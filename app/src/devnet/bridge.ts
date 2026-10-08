// Devnet mode: every action is first a REAL devnet transaction; the local Engine then mirrors it so all screens keep working,
// and the mirror is overwritten with what is really on chain (balances, proof time, window end, signatures).
import { recordFor, sampleJob, sampleRecords, DEMO_DEADLINE_SECS, SAMPLE_AMOUNT, VALIDATORS, WALLETS, DRONE, PANEL_SIGNERS, PROOF_SIGNERS } from "@/engine/scenario";
import { vaultOf } from "@/engine/engine";
import type { Engine } from "@/engine/engine";
import { sha256Hex } from "@/geo/sha256";
import deploy from "./deploy.json";
import * as chain from "./client";
import { getDevnetState, setDevnetState } from "./mode";

const nowSecs = () => Math.floor(Date.now() / 1000);

async function track<T>(label: string, fn: () => Promise<{ sig: string; value: T }>): Promise<T> {
  if (getDevnetState().busy) throw new Error("Another devnet transaction is still being sent. Wait a few seconds.");
  setDevnetState({ busy: label });
  try {
    const { sig, value } = await fn();
    setDevnetState({ last: { label, sig, ok: true } });
    return value;
  } catch (e) {
    if (e instanceof chain.ChainError) {
      setDevnetState({ last: { label, sig: e.sig, ok: false, error: e.message } });
      if (e.sig) e.message = `The program refused it (${e.message}). Transaction: ${chain.explorerTx(e.sig)}`;
      else e.message = `The program refused it (${e.message}).`;
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
  return snap;
}

const localJobId = () => 17; // SAMPLE_JOB_ID: one session job

let booted = false;
/** Probe devnet, then replace the seeded balances with real ones and tag the setup log entries with their real signatures. */
export async function bootDevnet(engine: Engine): Promise<boolean> {
  setDevnetState({ status: "connecting" });
  const ok = await chain.probe();
  if (!ok) {
    setDevnetState({ status: "unreachable", fellBack: true, mode: "sim" });
    return false;
  }
  try {
    if (!booted) {
      const t = (deploy as { demoKeysSetup?: { txs?: Record<string, string> } }).demoKeysSetup?.txs ?? {};
      const find = (prefix: string) => Object.entries(t).find(([k]) => k.startsWith(prefix))?.[1];
      const mint = find("mint test USDC"), reg = find("register_operator"), cert = find("issue_certificate");
      if (mint) {
        engine.chainRetag((e) => e.action === "fund" && (e.amounts[WALLETS.operator] ?? 0n) > 0n, mint);
        engine.chainRetag((e) => e.action === "fund" && (e.amounts[WALLETS.farmer] ?? 0n) > 0n, mint);
      }
      if (reg) engine.chainRetag((e) => e.action === "registerOperator", reg);
      if (cert) engine.chainRetag((e) => e.action === "issueCertificate", cert);
      booted = true;
    }
    await syncChain(engine);
    setDevnetState({ status: "ready", fellBack: false });
    return true;
  } catch {
    setDevnetState({ status: "unreachable", fellBack: true, mode: "sim" });
    return false;
  }
}

export interface DevActions {
  postJob(jobId: number, field?: { hash: string; areaCha: number }): Promise<void>;
  acceptJob(jobId: number): Promise<void>;
  submitRecord(which: keyof typeof sampleRecords, jobId: number, signers?: string[]): Promise<void>;
  settle(caller: string, jobId: number): Promise<void>;
  challenge(farmer: string, jobId: number): Promise<void>;
  resolveChallenge(signers: string[], jobId: number, upheld: boolean): Promise<void>;
}

export function devnetActions(engine: Engine): DevActions {
  const chainId = () => {
    const id = getDevnetState().chainJobId;
    if (id === null) throw new Error("No devnet job yet. Post one from the Farmer screen.");
    return id;
  };
  const retag = (action: string, jobId: number, sig: string, time?: number) => {
    engine.chainRetag((e) => e.action === action && e.jobId === jobId, sig);
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

  return {
    async postJob(jobId, field) {
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
        setDevnetState({ chainJobId: r.chainJobId });
        engine.postJob(WALLETS.farmer, { jobId, amount: p.amount, fieldHash: p.fieldHashHex, areaCha: p.areaCha, targetRateMlPerHa: p.targetRateMlPerHa, toleranceBps: p.toleranceBps, sprayDeadline: p.sprayDeadline });
        retag("postJob", jobId, r.sig, await blockTime(r.sig));
        await refresh();
        return { sig: r.sig, value: undefined };
      });
    },
    async acceptJob(jobId) {
      await track("Accept job", async () => {
        const j = engine.getState().jobs[jobId];
        const sig = await chain.acceptJob(chainId(), j.amount);
        engine.acceptJob(WALLETS.operator, jobId, DRONE.hash, j.amount);
        retag("acceptJob", jobId, sig, await blockTime(sig));
        await refresh();
        return { sig, value: undefined };
      });
    },
    async submitRecord(which, jobId, signers = PROOF_SIGNERS) {
      await track("Submit proof", async () => {
        const j = engine.getState().jobs[jobId];
        const r = recordFor(which, j.areaCha);
        // The proof hash commits to the field outline hash and the whole spray record.
        const proofHashHex = sha256Hex(JSON.stringify({ job: jobId, field_hash: j.fieldHash, record: r.raw }));
        const sig = await chain.submitProof(chainId(), { proofHashHex, litersMl: r.litersMl, areaCoveredCha: r.areaCoveredCha, validatorIds: signers });
        engine.submitProof(WALLETS.operator, jobId, { proofHash: proofHashHex, litersMl: r.litersMl, areaCoveredCha: r.areaCoveredCha, validatorSigners: signers });
        retag("submitProof", jobId, sig, await blockTime(sig));
        await refresh();
        return { sig, value: undefined };
      });
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
      });
    },
    async resolveChallenge(signers, jobId, upheld) {
      await track(upheld ? "Resolve challenge (upheld)" : "Resolve challenge (rejected)", async () => {
        const ids = signers.filter((s) => VALIDATORS.some((v) => v.id === s));
        const sig = await chain.resolveChallenge(chainId(), { validatorIds: ids.length ? ids : PANEL_SIGNERS, upheld, reportText: `panel-report-${jobId}-${upheld}` });
        engine.resolveChallenge(ids, jobId, upheld, sha256Hex(`panel-report-${jobId}-${upheld}`));
        retag("resolveChallenge", jobId, sig, await blockTime(sig));
        await refresh();
        return { sig, value: undefined };
      });
    },
  };
}
