// Devnet mode: every action is first a REAL devnet transaction; the local Engine then mirrors it so all screens keep working,
// and the mirror is overwritten with what is really on chain (balances, proof time, window end, signatures).
import { lsKey } from "@/env";
import { recordFor, sampleJob, sampleRecords, DEMO_DEADLINE_SECS, SAMPLE_AMOUNT, VALIDATORS, WALLETS, DRONE, PANEL_SIGNERS, PROOF_SIGNERS } from "@/engine/scenario";
import { vaultOf } from "@/engine/engine";
import { BotRefused, fullVerdict, runBotChecks, failReason } from "@/engine/bots";
import type { Engine } from "@/engine/engine";
import { sha256Hex } from "@/geo/sha256";
import deploy from "./deploy.json";
import * as chain from "./client";
import { ensureWallet } from "./provision";
import { keys } from "./keys";
import { friendlyMessage } from "./rpc";
import { getDevnetState, setDevnetState } from "./mode";
import { addSessionTx, getSession, dismissJob, isDismissed, loadPending, loadSession, newSession, patchSession, setPending, setSession, type Session } from "@/session/store";

let lastEngine: Engine | null = null;
const getEngineRef = () => lastEngine as Engine;
const nowSecs = () => Math.floor(Date.now() / 1000);

async function track<T>(label: string, fn: () => Promise<{ sig: string; value: T }>, needs?: "farmer" | "operator"): Promise<T> {
  if (getDevnetState().busy) throw new Error("Another devnet transaction is still being sent. Wait a few seconds.");
  setDevnetState({ busy: label });
  try {
    if (needs) {
      await ensureWallet(needs);
      if (lastEngine) retagCertificate(getEngineRef());
    }
    const { sig, value } = await fn();
    setDevnetState({ last: { label, sig, ok: true, at: Date.now() } });
    return value;
  } catch (e) {
    if (e instanceof chain.ChainError && e.code !== "rpc" && e.code !== "expired") {
      setDevnetState({ last: { label, sig: e.sig, ok: false, error: e.message, at: Date.now() } });
      if (e.sig) e.message = `The program refused it (${e.message}). Transaction: ${chain.explorerTx(e.sig)}`;
      else e.message = `The program refused it (${e.message}).`;
    } else if (e instanceof Error) {
      e.message = friendlyMessage(e.message); // rate limits and network trouble: plain words, never JSON
    }
    throw e;
  } finally {
    setDevnetState({ busy: null });
  }
}

/** Read the chain and copy balances, proof time and window end into the mirror. Also stores the snapshot for the on-chain card. */
export async function syncChain(engine: Engine) {
  const { chainJobId } = getDevnetState();
  const snap = await chain.readSnapshot(chainJobId);
  const balances: Record<string, bigint> = {
    [WALLETS.farmer]: snap.usdc.farmer,
    [WALLETS.operator]: snap.usdc.operator,
    [WALLETS.treasury]: snap.usdc.treasury,
    [WALLETS.validatorPool]: snap.usdc.validatorPool,
  };
  const jobId = localJobId();
  if (snap.job && snap.job.vaultBalance > 0n) balances[vaultOf(jobId)] = snap.job.vaultBalance;
  engine.chainSetBalances(balances);
  const lj = engine.getState().jobs[jobId];
  if (snap.job && lj?.proof && snap.job.challengeDeadline > 0) {
    const win = (deploy as { challengeWindowSecs?: number }).challengeWindowSecs ?? engine.getState().config.challengeWindowSecs;
    engine.chainPatchJob(jobId, { proof: { windowEndsAt: snap.job.challengeDeadline, submittedAt: snap.job.challengeDeadline - win } });
  }
  setDevnetState({ snapshot: snap });
  saveJobCache(snap, balances);
  return snap;
}

const localJobId = () => 17; // SAMPLE_JOB_ID: one session job
const ENDED = ["Released", "Refunded", "Cancelled"];

/**
 * Rebuild the local mirror of the session job from what the CHAIN says (state, amounts, proof, deadlines),
 * using the saved signatures only for Explorer links. The mirror's own rules re-run on the same values the chain accepted.
 */
function replay(engine: Engine, cj: chain.ChainJob, s: Session, txs: { action: string; sig: string; time?: number }[] = s.txs) {
  const known = engine.getState().balances;
  // The mirror needs funds to replay the steps; the real balances are put back right after.
  engine.chainSetBalances({ ...known, [WALLETS.farmer]: 1_000_000_000_000n, [WALLETS.operator]: 1_000_000_000_000n });
  try {
    replayInner(engine, cj, s, txs);
  } finally {
    engine.chainSetBalances(known);
  }
}

function replayInner(engine: Engine, cj: chain.ChainJob, s: Session, txs: { action: string; sig: string; time?: number }[]) {
  const jobId = localJobId();
  const farmer = WALLETS.farmer;
  const op = WALLETS.operator;
  const tag = (action: string) => {
    const t = [...txs].reverse().find((x) => x.action === action);
    if (!t) return;
    engine.chainRetag((e) => e.action === action && e.jobId === jobId, t.sig);
    if (t.time) engine.chainSetLogTime((e) => e.action === action && e.jobId === jobId, t.time);
  };
  const t0 = nowSecs();
  engine.chainResetJob(jobId);
  engine.postJob(farmer, { jobId, amount: cj.amount, fieldHash: cj.fieldHash, areaCha: cj.areaCha, targetRateMlPerHa: cj.targetRateMlPerHa, toleranceBps: cj.toleranceBps, sprayDeadline: cj.sprayDeadline });
  tag("postJob");
  if (cj.createdAt > 0) {
    engine.chainPatchJob(jobId, { postedAt: cj.createdAt });
    engine.chainSetLogTime((e) => e.action === "postJob" && e.jobId === jobId, cj.createdAt);
  }
  if (cj.state === "Cancelled") {
    engine.cancelJob(farmer, jobId);
    return tag("cancelJob");
  }
  if (cj.state === "Posted") return;
  engine.acceptJob(op, jobId, DRONE.hash, cj.bond);
  tag("acceptJob");
  if (cj.state === "Accepted") return;
  if (cj.state === "Refunded" && cj.litersMl === 0) {
    engine.reclaimExpired(farmer, jobId);
    return tag("reclaimExpired");
  }
  engine.submitProof(op, jobId, { proofHash: cj.proofHash, litersMl: cj.litersMl, areaCoveredCha: cj.areaCoveredCha, validatorSigners: s.signers.length >= 2 ? s.signers : PROOF_SIGNERS });
  tag("submitProof");
  const window = (patch: number) => engine.chainPatchJob(jobId, { proof: { windowEndsAt: patch } });
  window(cj.challengeDeadline > 0 ? cj.challengeDeadline : t0 + 60);
  if (cj.state === "ProofSubmitted") return;
  const challenged = cj.state === "Challenged" || cj.state === "Refunded" || (cj.state === "Released" && cj.challengeBond > 0n);
  if (challenged) {
    window(t0 + 3600);
    engine.challenge(farmer, jobId, sha256Hex(`farmer-evidence-${cj.fieldHash}`));
    tag("challenge");
    if (cj.state === "Challenged") return;
    const ids = s.resolution?.ids?.length ? s.resolution.ids : PANEL_SIGNERS;
    engine.resolveChallenge(ids, jobId, cj.state === "Refunded", "restored");
    return tag("resolveChallenge");
  }
  window(t0 - 1);
  engine.settle(farmer, jobId);
  tag("settle");
}

/** Signatures and block times from the chain, merged over the saved ones, so every step links to Explorer and times are in true order. */
async function chainTxs(cj: chain.ChainJob, s: Session) {
  let found: { action: string; sig: string; time?: number }[] = [];
  try {
    found = await chain.jobTxs(cj.pda);
  } catch {
    /* RPC hiccup: the saved ones still work */
  }
  const merged = [...s.txs.filter((t) => !found.some((f) => f.action === t.action)), ...found];
  patchSession({ txs: merged });
  return merged;
}

/** Take a job out of the visible open list at once (it was just accepted); the next read confirms it. */
function dropOpenJob(chainJobId: number | null) {
  const cur = getDevnetState().openJobs;
  if (chainJobId !== null && cur) setDevnetState({ openJobs: cur.filter((j) => j.chainJobId !== chainJobId) });
}

/** Read the open jobs on chain and the job the operator still holds. */
export async function refreshOpenJobs() {
  try {
    const [openJobs, held] = await Promise.all([chain.listOpenJobs(), chain.readOperatorActiveJob()]);
    const mine = getSession()?.chainJobId;
    setDevnetState({ openJobs, heldJob: held && held.chainJobId !== mine ? held : null });
  } catch {
    /* keep what we had */
  }
}

/** Put a job that exists on chain (posted by another visit) into this browser's session and mirror it. */
export async function adoptChainJob(engine: Engine, cj: chain.ChainJob) {
  const local = engine.getState().jobs[localJobId()];
  if (local && !ENDED.includes(local.state) && getSession()?.chainJobId !== cj.chainJobId) throw new Error(`The demo job in this browser is still ${local.state}. Finish it first, or release it, then accept another one.`);
  if (local && getSession()?.chainJobId === cj.chainJobId) return; // already the shared session job
  chain.setJobFarmer(cj.farmer);
  newSession({ farmer: cj.farmer, chainJobId: cj.chainJobId, fieldHash: cj.fieldHash, areaCha: cj.areaCha, sprayDeadline: cj.sprayDeadline });
  setPending(null);
  setDevnetState({ chainJobId: cj.chainJobId });
  const txs = await chainTxs(cj, getSession()!);
  replay(engine, cj, getSession()!, txs);
}

/** Give the certificate step its real signature (saved when this browser's operator wallet was certified). */
export function retagCertificate(engine: Engine) {
  try {
    const sig = globalThis.localStorage?.getItem(lsKey("kvali.certsig.v1"));
    if (sig) engine.chainRetag((e) => e.action === "issueCertificate", sig);
  } catch {
    /* ignore */
  }
}

async function restoreSession(engine: Engine) {
  loadPending();
  let s = loadSession();
  let cj: chain.ChainJob | null = null;
  if (s) {
    chain.setJobFarmer(s.farmer);
    cj = await chain.readJob(s.chainJobId, s.farmer);
    if (!cj) {
      setSession(null);
      s = null;
    }
  }
  if (!s) {
    // No saved session (cleared storage, another tab, a new device with the same wallets): find this browser's own jobs on the chain.
    const mine = (await chain.findMyJobs()).filter((j) => !isDismissed(j.chainJobId));
    const pick = mine.find((j) => !ENDED.includes(j.state)) ?? mine[0];
    if (!pick) return;
    newSession({ farmer: pick.farmer, chainJobId: pick.chainJobId, fieldHash: pick.fieldHash, areaCha: pick.areaCha, sprayDeadline: pick.sprayDeadline });
    chain.setJobFarmer(pick.farmer);
    s = getSession()!;
    cj = pick;
  }
  setDevnetState({ chainJobId: s.chainJobId, restoreNote: null });
  const txs = await chainTxs(cj!, s);
  await yieldMain();
  replay(engine, cj!, s, txs);
}

/** Probe devnet, restore this browser's job from the chain, then replace the seeded balances with real ones. */
// ---- last known job, so a reload or role switch shows the job at once while the chain is read in the background ----
const CACHE_KEY = lsKey("kvali.jobcache.v1");
const enc = (v: unknown) => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? { __b: x.toString() } : x));
const dec = (t: string) => JSON.parse(t, (_k, x) => (x && typeof x === "object" && "__b" in x ? BigInt((x as { __b: string }).__b) : x));

function saveJobCache(snap: chain.ChainSnapshot, balances: Record<string, bigint>) {
  try {
    if (snap.job) globalThis.localStorage?.setItem(CACHE_KEY, enc({ job: snap.job, balances }));
  } catch {
    /* ignore */
  }
}

/** Rebuild the mirror from the cache without any network. Returns true if a job was shown. */
function applyJobCache(engine: Engine): boolean {
  try {
    const s = loadSession();
    const raw = globalThis.localStorage?.getItem(CACHE_KEY);
    if (!s || !raw) return false;
    const c = dec(raw) as { job: chain.ChainJob; balances: Record<string, bigint> };
    if (c.job.chainJobId !== s.chainJobId) return false;
    chain.setJobFarmer(s.farmer);
    setDevnetState({ chainJobId: s.chainJobId });
    replay(engine, c.job, s, s.txs);
    engine.chainSetBalances(c.balances);
    return true;
  } catch {
    return false;
  }
}

let restoreOk = false;
/** Give the main thread back to the browser (paint, input) between heavy steps. */
export const yieldMain = () => new Promise<void>((r) => setTimeout(r, 0));
const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T> => Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("the node is slow to answer")), ms))]);

/** Probe devnet, show the last known job at once, restore from the chain, then read balances. Never falls back to the simulation. */
export async function bootDevnet(engine: Engine): Promise<boolean> {
  setDevnetState({ status: "connecting" });
  // Let the page paint its loader before any of the heavier work below (cache replay, chain reads, account decoding).
  await yieldMain();
  loadPending();
  engine.chainSetBalances({}); // never show the simulation's seeded $1,000 in devnet mode
  if (applyJobCache(engine)) setDevnetState({ cachedReady: true });
  // A rate-limited or slow node is not "unreachable": keep trying quietly (the RPC layer shows "devnet is busy").
  for (;;) {
    if (await chain.probe()) break;
    await new Promise((r) => setTimeout(r, 6000));
  }
  try {
    await withTimeout(restoreSession(engine), 30000);
    restoreOk = true;
  } catch (e) {
    setDevnetState({ restoreNote: `Still reading your job from the chain (${friendlyMessage((e as Error).message)}).` });
  }
  retagCertificate(engine);
  try {
    await withTimeout(syncChain(engine), 15000);
  } catch {
    // Never leave the seeded (simulated) balances on screen in devnet mode; the poll below keeps trying.
    if (!getDevnetState().cachedReady) engine.chainSetBalances({});
  }
  setDevnetState({ status: "ready", fellBack: false, cachedReady: false });
  return true;
}

/** Periodic refresh: finish a restore that failed earlier, then re-read balances and the job. Safe to call while the node is busy. */
export async function pollChain(engine: Engine) {
  if (!restoreOk) {
    try {
      await restoreSession(engine);
      restoreOk = true;
      setDevnetState({ restoreNote: null });
    } catch {
      return;
    }
  }
  await syncChain(engine);
}

let releasing = false;
/**
 * After the job is settled (Released): free every co-signer's stake lock with release_cosign (permissionless, the bank pays),
 * so the stakes can be withdrawn later. Safe from any tab: validators with nothing to release are skipped, errors are ignored.
 */
export async function releaseCosigns(): Promise<void> {
  const s = getSession();
  if (!s || s.released || releasing) return;
  releasing = true;
  try {
    const ids = VALIDATORS.map((v) => v.id);
    const stakes = await chain.readStakes(ids);
    const done: Record<string, string> = {};
    let failed = false;
    for (const id of ids) {
      if (!stakes[id]) continue; // no stake account = never co-signed with a stake
      try {
        done[id] = await chain.releaseCosign(s.chainJobId, id);
      } catch (e) {
        // NothingToRelease = this validator did not co-sign this job (or another tab already freed it): fine. Anything else: try again later.
        if (!(e instanceof chain.ChainError) || e.code !== "NothingToRelease") failed = true;
      }
    }
    if (!failed && getSession()?.chainJobId === s.chainJobId) patchSession({ released: done });
  } finally {
    releasing = false;
  }
}

export interface DevActions {
  postJob(jobId: number, field?: { hash: string; areaCha: number; name?: string; crop?: string; product?: string; farmerName?: string }): Promise<void>;
  /** After the spray-by deadline: return payment and bond (program: reclaim_expired). */
  reclaimExpired(jobId: number): Promise<void>;
  acceptJob(jobId: number): Promise<void>;
  /** The checker bots run the verdict on the record; if it passes, 2 staked bots co-sign and the proof goes on chain. Throws BotRefused if not. */
  submitRecord(which: keyof typeof sampleRecords, jobId: number): Promise<void>;
  settle(caller: string, jobId: number): Promise<void>;
  challenge(farmer: string, jobId: number): Promise<void>;
  resolveChallenge(signers: string[], jobId: number, upheld: boolean): Promise<void>;
  cancelJob(jobId: number): Promise<void>;
  /** Accept a job that exists on chain but is not this browser's current job (adopts it first). */
  acceptOpenJob(chainJobId: number): Promise<void>;
  /** Continue a job the operator still holds on chain. */
  continueHeldJob(chainJobId: number): Promise<void>;
  /** Forget the finished job so a new one can be posted. */
  newJob(jobId: number): Promise<void>;
}

/** The bot run in progress in this tab (shared by every caller, so a click and the resume effect never double-send). */
let botRun: Promise<void> | null = null;

export function devnetActions(engine: Engine): DevActions {
  lastEngine = engine;
  const chainId = () => {
    const id = getDevnetState().chainJobId;
    if (id === null) throw new Error("No devnet job yet. Post one from the Farmer screen.");
    return id;
  };
  const retag = (action: string, jobId: number, sig: string, time?: number) => {
    engine.chainRetag((e) => e.action === action && e.jobId === jobId, sig);
    addSessionTx({ action, sig, time });
    if (time) engine.chainSetLogTime((e) => e.action === action && e.jobId === jobId, time);
  };
  const blockTime = async (sig: string) => {
    try {
      return (await chain.connection.getTransaction(sig, { commitment: "confirmed", maxSupportedTransactionVersion: 0 }))?.blockTime ?? undefined;
    } catch {
      return undefined;
    }
  };
  const refresh = async () => {
    try {
      await syncChain(engine);
    } catch {
      /* the transaction is already confirmed; the next refresh will catch up */
    }
  };

  /** True if the chain already holds a proof for this job (another tab or browser got there first); then the mirror is rebuilt from the chain. */
  const alreadySubmitted = async () => {
    const cj = await chain.readJob(chainId(), getSession()?.farmer).catch(() => null);
    if (!cj || cj.state === "Accepted") return false;
    await restoreSession(engine);
    setPending(null);
    await refresh();
    return true;
  };
  const runBots = async (which: keyof typeof sampleRecords, jobId: number) => {
    const j = engine.getState().jobs[jobId];
    if (!j) throw new Error("No job to check yet.");
    if (j.state !== "Accepted") throw new Error(`The job is ${j.state}; a spray record can only be submitted once, right after it is accepted.`);
    const refuse = (reason: string) => {
      patchSession({ bots: runBotChecks(j, which, [], reason) });
      setPending({ key: which, approvals: [], refusal: `Bots refused: ${reason}` });
      throw new BotRefused(`The checker bots refused this record (${reason}). Nothing was signed and nothing was paid.`);
    };
    // 1. every bot runs the same checks
    const v = fullVerdict(j, which);
    if (!v.pass) return refuse(failReason(v.checks));
    // 2. only checkers with an active stake (>= the minimum) may co-sign; 2 of 3 are needed
    const ids = VALIDATORS.map((x) => x.id);
    const [params, stakes] = await Promise.all([chain.readStakingParams(), chain.readStakes(ids)]);
    const eligible = ids.filter((id) => {
      const s = stakes[id];
      if (params.minStake > 0n) return !!s && !s.slashed && s.unstakeRequestedAt === 0 && s.amount >= params.minStake;
      return !s?.slashed;
    });
    const need = engine.getState().config.proofThreshold;
    if (eligible.length < need) return refuse(`only ${eligible.length} of 3 checkers have an active stake, ${need} are needed`);
    eligible.sort((a, b) => Number(!!stakes[b]) - Number(!!stakes[a]));
    const signers = eligible.slice(0, need);
    // 3. idempotent: if the proof is already on chain, do not send it again
    if (await alreadySubmitted()) return;
    try {
      await track("Submit proof", async () => {
        const r = recordFor(which, j.areaCha);
        // The proof hash commits to the field outline hash and the whole spray record.
        const proofHashHex = sha256Hex(JSON.stringify({ job: jobId, field_hash: j.fieldHash, record: r.raw }));
        const sig = await chain.submitProof(chainId(), { proofHashHex, litersMl: r.litersMl, areaCoveredCha: r.areaCoveredCha, validatorIds: signers });
        engine.submitProof(WALLETS.operator, jobId, { proofHash: proofHashHex, litersMl: r.litersMl, areaCoveredCha: r.areaCoveredCha, validatorSigners: signers });
        patchSession({ recordKey: which, signers, bots: { ...runBotChecks(j, which, signers), sig } });
        setPending(null);
        retag("submitProof", jobId, sig, await blockTime(sig));
        await refresh();
        return { sig, value: undefined };
      }, "operator");
    } catch (e) {
      // "Already submitted" by another tab that won the race: not an error, just adopt the chain state.
      if (await alreadySubmitted()) return;
      throw e;
    }
  };

  const api: DevActions = {
    async postJob(jobId, field) {
      if (engine.getState().jobs[jobId]) throw new Error("This browser already has a current job. Finish it (or cancel it) and press Start a new job first.");
      await track("Post job", async () => {
        const p = {
          amount: SAMPLE_AMOUNT,
          fieldHashHex: field?.hash ?? sampleJob.fieldHash,
          areaCha: field?.areaCha ?? sampleJob.areaCha,
          targetRateMlPerHa: sampleJob.targetRateMlPerHa,
          toleranceBps: sampleJob.toleranceBps,
          sprayDeadline: nowSecs() + DEMO_DEADLINE_SECS,
        };
        const r = await chain.postJob(p);
        chain.setJobFarmer(keys.farmer.publicKey);
        newSession({ farmer: keys.farmer.publicKey.toBase58(), chainJobId: r.chainJobId, fieldHash: p.fieldHashHex, areaCha: p.areaCha, sprayDeadline: p.sprayDeadline, fieldName: field?.name, crop: field?.crop, product: field?.product, farmerName: field?.farmerName });
        setPending(null);
        setDevnetState({ chainJobId: r.chainJobId });
        engine.postJob(WALLETS.farmer, { jobId, amount: p.amount, fieldHash: p.fieldHashHex, areaCha: p.areaCha, targetRateMlPerHa: p.targetRateMlPerHa, toleranceBps: p.toleranceBps, sprayDeadline: p.sprayDeadline });
        retag("postJob", jobId, r.sig, await blockTime(r.sig));
        await refresh();
        return { sig: r.sig, value: undefined };
      }, "farmer");
    },
    async acceptJob(jobId) {
      await track("Accept job", async () => {
        const j = engine.getState().jobs[jobId];
        const sig = await chain.acceptJob(chainId(), j.amount);
        engine.acceptJob(WALLETS.operator, jobId, DRONE.hash, j.amount);
        dropOpenJob(getDevnetState().chainJobId);
        retag("acceptJob", jobId, sig, await blockTime(sig));
        await refresh();
        return { sig, value: undefined };
      }, "operator");
    },
    submitRecord(which, jobId) {
      // One bot run at a time per tab; the chain state check inside makes other tabs / browsers harmless too.
      if (botRun) return botRun;
      botRun = runBots(which, jobId).finally(() => {
        botRun = null;
      });
      return botRun;
    },
    async settle(_caller, jobId) {
      await track("Settle", async () => {
        const sig = await chain.settle(chainId());
        // The chain accepted it, so its window is over; make the mirror agree even if the browser clock is a second behind.
        engine.chainPatchJob(jobId, { proof: { windowEndsAt: Math.min(engine.getState().jobs[jobId].proof?.windowEndsAt ?? 0, nowSecs()) } });
        engine.settle(WALLETS.farmer, jobId);
        retag("settle", jobId, sig, await blockTime(sig));
        await refresh();
        return { sig, value: undefined };
      });
    },
    async challenge(_farmer, jobId) {
      await track("Challenge", async () => {
        const j = engine.getState().jobs[jobId];
        const sig = await chain.challenge(chainId(), `farmer-evidence-${j.fieldHash}`);
        engine.chainPatchJob(jobId, { proof: { windowEndsAt: Math.max(j.proof?.windowEndsAt ?? 0, nowSecs() + 1) } });
        engine.challenge(WALLETS.farmer, jobId, sha256Hex(`farmer-evidence-${j.fieldHash}`));
        retag("challenge", jobId, sig, await blockTime(sig));
        await refresh();
        return { sig, value: undefined };
      }, "farmer");
    },
    async resolveChallenge(signers, jobId, upheld) {
      if (upheld) throw new Error("Upholding a challenge would slash the shared demo validators on devnet, so it is switched off in the public demo. Slashing is proven by the program tests.");
      await track(upheld ? "Resolve challenge (upheld)" : "Resolve challenge (rejected)", async () => {
        const ids = signers.filter((s) => VALIDATORS.some((v) => v.id === s));
        const sig = await chain.resolveChallenge(chainId(), { validatorIds: ids.length ? ids : PANEL_SIGNERS, upheld, reportText: `panel-report-${jobId}-${upheld}` });
        engine.resolveChallenge(ids, jobId, upheld, sha256Hex(`panel-report-${jobId}-${upheld}`));
        patchSession({ resolution: { upheld, ids } });
        retag("resolveChallenge", jobId, sig, await blockTime(sig));
        await refresh();
        return { sig, value: undefined };
      });
    },
    async reclaimExpired(jobId) {
      await track("Release job", async () => {
        const j = engine.getState().jobs[jobId];
        if (!j || j.state !== "Accepted") throw new Error("Only an accepted job can be released.");
        if (nowSecs() <= j.sprayDeadline) throw new Error("The spray-by deadline has not passed yet.");
        const sig = await chain.reclaimExpired(chainId());
        engine.reclaimExpired(WALLETS.farmer, jobId);
        retag("reclaimExpired", jobId, sig, await blockTime(sig));
        await refresh();
        return { sig, value: undefined };
      });
    },
    async cancelJob(jobId) {
      await track("Cancel job", async () => {
        const sig = await chain.cancelJob(chainId());
        engine.cancelJob(WALLETS.farmer, jobId);
        retag("cancelJob", jobId, sig, await blockTime(sig));
        await refresh();
        return { sig, value: undefined };
      }, "farmer");
    },
    async acceptOpenJob(chainJobId) {
      const cj = (getDevnetState().openJobs ?? []).find((j) => j.chainJobId === chainJobId);
      if (!cj || cj.state !== "Posted") throw new Error("That job is no longer open.");
      await adoptChainJob(engine, cj);
      await api.acceptJob(localJobId());
      await refreshOpenJobs();
    },
    async continueHeldJob(chainJobId) {
      const held = getDevnetState().heldJob;
      const cj = held && held.chainJobId === chainJobId ? held : null;
      if (!cj) throw new Error("That job could not be found on chain.");
      await adoptChainJob(engine, cj);
      await refresh();
      await refreshOpenJobs();
    },
    async newJob(jobId) {
      const cur = getSession();
      if (cur) dismissJob(cur.chainJobId);
      setSession(null);
      setPending(null);
      try {
        globalThis.localStorage?.removeItem(CACHE_KEY);
      } catch {
        /* ignore */
      }
      engine.chainResetJob(jobId);
      setDevnetState({ chainJobId: null });
      await refresh();
    },
  };
  return api;
}
