// SIMULATED job engine. Implements the rules of the Solana program
// (docs/ONCHAIN_SPEC.md) in memory so the demo runs without devnet.
// Pure TypeScript: no React Native imports, runs under Node tests.
//
// Proof modules are imported by relative path because Node does not know the
// Metro/tsconfig alias @kvali/proof/*. Same files, same logic.
import { computeVerdict } from "../../../services/proof/src/verdict.ts";
import {
  computeSettlement,
  KVALI_FEE_BPS,
  VALIDATOR_FEE_BPS,
  PANEL_FEE_BPS,
  CHALLENGE_BOND_BPS,
  type Outcome,
} from "../../../services/proof/src/settlement.ts";
import { MAX_METER_ERROR_BPS } from "../../../services/proof/src/calibration.ts";
import {
  EngineError,
  type Action,
  type Certificate,
  type Clock,
  type Config,
  type EngineState,
  type EventLogEntry,
  type Job,
  type WalletId,
} from "./types.ts";

export const DEFAULT_CHALLENGE_WINDOW_SECS = 60; // demo value; real jobs use 24 h (86_400)
/** A proof may claim at most 105% of the posted area (program: MAX_AREA_OVERSHOOT_PCT). */
export const MAX_AREA_OVERSHOOT_PCT = 105;

export function defaultConfig(
  validators: Config["validators"],
  overrides: Partial<Config> = {},
): Config {
  return {
    validators,
    proofThreshold: 2,
    panelThreshold: 2,
    challengeWindowSecs: DEFAULT_CHALLENGE_WINDOW_SECS,
    kvaliFeeBps: KVALI_FEE_BPS,
    validatorFeeBps: VALIDATOR_FEE_BPS,
    panelFeeBps: PANEL_FEE_BPS,
    challengeBondBps: CHALLENGE_BOND_BPS,
    minCoverageBps: 9_500,
    maxMeterErrorBps: MAX_METER_ERROR_BPS,
    treasury: "kvali-treasury",
    validatorPool: "validator-pool",
    ...overrides,
  };
}

export const vaultOf = (jobId: number) => `vault:${jobId}`;
export const certKey = (operator: WalletId, droneHash: string) => `${operator}:${droneHash}`;

function fakeTx(seq: number, text: string): string {
  let h = 0x811c9dc5; // FNV-1a, deterministic
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return `SIM-${seq.toString(16).padStart(4, "0")}${h.toString(16).padStart(8, "0")}`;
}

export class Engine {
  private state: EngineState;
  private clock: Clock;
  private listeners = new Set<() => void>();

  constructor(config: Config, clock: Clock = () => Math.floor(Date.now() / 1000)) {
    this.clock = clock;
    this.state = {
      config,
      balances: {},
      minted: 0n,
      operators: {},
      farmers: {},
      certificates: {},
      jobs: {},
      log: [],
    };
  }

  // ---- store interface (useSyncExternalStore) ----
  getState = (): EngineState => this.state;
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  balance(wallet: WalletId): bigint {
    return this.state.balances[wallet] ?? 0n;
  }
  now(): number {
    return this.clock();
  }
  /** Seconds left in the challenge window for a job (0 if none/closed). */
  windowRemaining(jobId: number): number {
    const p = this.state.jobs[jobId]?.proof;
    return p ? Math.max(0, p.windowEndsAt - this.clock()) : 0;
  }

  // ---- devnet mirror hooks (w09) ----
  // In devnet mode this engine is a local mirror of the chain: actions run here after the chain accepted them,
  // then these hooks overwrite balances, times and tx ids with what is really on chain.

  /** Replace token balances with real on-chain amounts. `minted` is re-derived so the books still add up. */
  chainSetBalances(balances: Record<string, bigint>) {
    const next = { ...this.state, balances: { ...balances } };
    next.minted = Object.values(balances).reduce((a, b) => a + b, 0n);
    this.state = next;
    this.listeners.forEach((l) => l());
  }

  /** Patch a job (and its proof) with on-chain values such as the real proof time and window end. */
  chainPatchJob(jobId: number, patch: { proof?: Partial<NonNullable<Job["proof"]>>; sprayDeadline?: number; postedAt?: number }) {
    const j = this.state.jobs[jobId];
    if (!j) return;
    const nj: Job = { ...j };
    if (patch.sprayDeadline !== undefined) nj.sprayDeadline = patch.sprayDeadline;
    if (patch.postedAt !== undefined) nj.postedAt = patch.postedAt;
    if (patch.proof && j.proof) nj.proof = { ...j.proof, ...patch.proof };
    this.state = { ...this.state, jobs: { ...this.state.jobs, [jobId]: nj } };
    this.listeners.forEach((l) => l());
  }

  /** Forget a job and its log entries (a new job starts, or a saved session is re-read from the chain). */
  chainResetJob(jobId: number) {
    const j = this.state.jobs[jobId];
    if (!j) return;
    const jobs = { ...this.state.jobs };
    delete jobs[jobId];
    const operators = { ...this.state.operators };
    for (const [k, o] of Object.entries(operators)) if (o.activeJob === jobId) operators[k] = { ...o, activeJob: null };
    this.state = { ...this.state, jobs, operators, log: this.state.log.filter((l) => l.jobId !== jobId) };
    this.listeners.forEach((l) => l());
  }

  /** Give the newest matching log entries their real transaction signature. */
  chainRetag(match: (e: EventLogEntry) => boolean, tx: string) {
    const log = [...this.state.log];
    for (let i = log.length - 1; i >= 0; i--) {
      if (match(log[i])) {
        log[i] = { ...log[i], tx };
        break;
      }
    }
    this.state = { ...this.state, log };
    this.listeners.forEach((l) => l());
  }

  /** Set the time of the newest matching log entry (chain block time). */
  chainSetLogTime(match: (e: EventLogEntry) => boolean, time: number) {
    const log = [...this.state.log];
    for (let i = log.length - 1; i >= 0; i--) {
      if (match(log[i])) {
        log[i] = { ...log[i], time };
        break;
      }
    }
    this.state = { ...this.state, log };
    this.listeners.forEach((l) => l());
  }

  // ---- internals ----
  /** Run a mutation on a copy; commit only if it does not throw. */
  private tx<T>(
    actor: WalletId,
    action: Action,
    jobId: number | null,
    note: string,
    fn: (s: EngineState) => { amounts?: Record<WalletId, bigint>; result: T },
  ): T {
    const draft = structuredClone(this.state);
    const { amounts = {}, result } = fn(draft);
    const seq = draft.log.length + 1;
    draft.log.push({
      seq,
      time: this.clock(),
      actor,
      action,
      jobId,
      amounts,
      note,
      tx: fakeTx(seq, `${action}|${actor}|${jobId}|${seq}`),
    });
    this.state = draft;
    this.listeners.forEach((l) => l());
    return result;
  }

  private move(s: EngineState, from: string, to: string, amt: bigint) {
    if (amt === 0n) return;
    if ((s.balances[from] ?? 0n) < amt) throw new EngineError("insufficient-funds", `${from} cannot pay ${amt}`);
    s.balances[from] = (s.balances[from] ?? 0n) - amt;
    s.balances[to] = (s.balances[to] ?? 0n) + amt;
  }

  private job(s: EngineState, id: number): Job {
    const j = s.jobs[id];
    if (!j) throw new EngineError("no-such-job");
    return j;
  }

  private requireState(j: Job, ...allowed: Job["state"][]) {
    if (!allowed.includes(j.state)) throw new EngineError("wrong-state", `job is ${j.state}, needs ${allowed.join("/")}`);
  }

  /**
   * Count distinct signers that belong to the configured validator set.
   * `excluded` (the job's farmer and operator) never count: conflict of interest.
   */
  private distinctValidators(s: EngineState, signers: WalletId[], excluded: (WalletId | null)[] = []): WalletId[] {
    const set = new Set(s.config.validators.map((v) => v.id));
    return [...new Set(signers)].filter((x) => set.has(x) && !excluded.includes(x));
  }

  /** Split a finished job's vault by computeSettlement and pay everyone. */
  private payOut(s: EngineState, j: Job, outcome: Outcome) {
    const p = computeSettlement(j.amount, j.bond, outcome);
    const vault = vaultOf(j.id);
    const cfg = s.config;
    if (p.farmer > 0n) this.move(s, vault, j.farmer, p.farmer);
    if (p.operator > 0n && j.operator) this.move(s, vault, j.operator, p.operator);
    if (p.kvali > 0n) this.move(s, vault, cfg.treasury, p.kvali);
    if (p.validators > 0n) this.move(s, vault, cfg.validatorPool, p.validators);
    j.payout = p;
    j.endedAt = this.clock();
    if (j.operator) s.operators[j.operator].activeJob = null;
    const amounts: Record<WalletId, bigint> = {};
    if (p.farmer > 0n) amounts[j.farmer] = p.farmer;
    if (p.operator > 0n && j.operator) amounts[j.operator] = p.operator;
    if (p.kvali > 0n) amounts[cfg.treasury] = p.kvali;
    if (p.validators > 0n) amounts[cfg.validatorPool] = p.validators;
    return amounts;
  }

  // ---- actions (mirror the program instructions) ----

  /** SIMULATED faucet: mint test USDC to a wallet. Not a program instruction. */
  fund(wallet: WalletId, amount: bigint) {
    this.tx("faucet", "fund", null, `simulated faucet to ${wallet}`, (s) => {
      s.balances[wallet] = (s.balances[wallet] ?? 0n) + amount;
      s.minted += amount;
      return { amounts: { [wallet]: amount }, result: undefined };
    });
  }

  registerOperator(operator: WalletId) {
    this.tx(operator, "registerOperator", null, "operator registered", (s) => {
      if (s.operators[operator]) throw new EngineError("already-registered");
      s.operators[operator] = { id: operator, jobsCompleted: 0, jobsFailed: 0, activeJob: null };
      return { result: undefined };
    });
  }

  postJob(
    farmer: WalletId,
    p: {
      jobId: number;
      amount: bigint;
      fieldHash: string;
      areaCha: number;
      targetRateMlPerHa: number;
      toleranceBps: number;
      sprayDeadline: number;
    },
  ): number {
    return this.tx(farmer, "postJob", p.jobId, `posted ${p.areaCha / 100} ha job`, (s) => {
      if (p.amount <= 0n || p.areaCha <= 0 || p.targetRateMlPerHa <= 0) throw new EngineError("bad-terms");
      if (p.sprayDeadline <= this.clock()) throw new EngineError("deadline-in-past");
      if (s.jobs[p.jobId]) throw new EngineError("job-exists");
      this.move(s, farmer, vaultOf(p.jobId), p.amount);
      s.jobs[p.jobId] = {
        id: p.jobId,
        farmer,
        amount: p.amount,
        fieldHash: p.fieldHash,
        areaCha: p.areaCha,
        targetRateMlPerHa: p.targetRateMlPerHa,
        toleranceBps: p.toleranceBps,
        postedAt: this.clock(),
        sprayDeadline: p.sprayDeadline,
        state: "Posted",
        operator: null,
        droneHash: null,
        bond: 0n,
        proof: null,
        challenge: null,
        payout: null,
        endedAt: null,
      };
      const fp = (s.farmers[farmer] ??= { id: farmer, jobsPosted: 0, challengesWon: 0, challengesLost: 0 });
      fp.jobsPosted += 1;
      return { amounts: { [farmer]: -p.amount }, result: p.jobId };
    });
  }

  cancelJob(farmer: WalletId, jobId: number) {
    this.tx(farmer, "cancelJob", jobId, "job cancelled, full refund", (s) => {
      const j = this.job(s, jobId);
      if (j.farmer !== farmer) throw new EngineError("not-farmer");
      this.requireState(j, "Posted");
      this.move(s, vaultOf(jobId), farmer, j.amount);
      j.state = "Cancelled";
      j.endedAt = this.clock();
      j.payout = { farmer: j.amount, operator: 0n, kvali: 0n, validators: 0n };
      return { amounts: { [farmer]: j.amount }, result: undefined };
    });
  }

  /** One field validator from the set records a calibration test. */
  issueCertificate(
    validator: WalletId,
    p: {
      operator: WalletId;
      droneHash: string;
      droneModel: string;
      meterErrorBps: number;
      operatorPassed: boolean;
      reportHash: string;
      validUntil: number;
    },
  ): Certificate {
    return this.tx(validator, "issueCertificate", null, `certificate for ${p.droneModel}`, (s) => {
      if (!s.config.validators.some((v) => v.id === validator)) throw new EngineError("not-validator");
      if (p.validUntil <= this.clock()) throw new EngineError("validity-in-past");
      // A panel revocation is final: one validator cannot re-issue over it.
      if (s.certificates[certKey(p.operator, p.droneHash)]?.revoked) {
        throw new EngineError("certificate-revoked", "certificate was revoked by a validator panel");
      }
      const cert: Certificate = { ...p, operator: p.operator, issuedBy: validator, revoked: false };
      s.certificates[certKey(p.operator, p.droneHash)] = cert;
      return { result: cert };
    });
  }

  revokeCertificate(signers: WalletId[], operator: WalletId, droneHash: string) {
    this.tx(signers[0] ?? "none", "revokeCertificate", null, "certificate revoked", (s) => {
      const c = s.certificates[certKey(operator, droneHash)];
      if (!c) throw new EngineError("no-certificate");
      if (this.distinctValidators(s, signers, [c.operator]).length < s.config.panelThreshold) {
        throw new EngineError("panel-threshold");
      }
      c.revoked = true;
      return { result: undefined };
    });
  }

  acceptJob(operator: WalletId, jobId: number, droneHash: string, bondAmount: bigint) {
    this.tx(operator, "acceptJob", jobId, "job accepted, bond locked", (s) => {
      const j = this.job(s, jobId);
      const op = s.operators[operator];
      if (!op) throw new EngineError("not-registered");
      const c = s.certificates[certKey(operator, droneHash)];
      if (!c) throw new EngineError("no-certificate", "uncertified operator or drone");
      if (c.revoked) throw new EngineError("certificate-revoked");
      if (c.validUntil <= this.clock()) throw new EngineError("certificate-expired");
      if (!c.operatorPassed || c.meterErrorBps > s.config.maxMeterErrorBps) throw new EngineError("certificate-failed");
      this.requireState(j, "Posted");
      if (operator === j.farmer) throw new EngineError("operator-is-farmer", "a farmer cannot accept their own job");
      if (bondAmount < j.amount) throw new EngineError("bond-too-small", "bond must be >= job amount");
      if (op.activeJob !== null) throw new EngineError("operator-busy");
      if (this.clock() >= j.sprayDeadline) throw new EngineError("past-deadline");
      this.move(s, operator, vaultOf(jobId), bondAmount);
      j.operator = operator;
      j.droneHash = droneHash;
      j.bond = bondAmount;
      j.state = "Accepted";
      op.activeJob = jobId;
      return { amounts: { [operator]: -bondAmount }, result: undefined };
    });
  }

  /** `signers` = operator plus the data validators who co-sign. */
  submitProof(
    operator: WalletId,
    jobId: number,
    p: { proofHash: string; litersMl: number; areaCoveredCha: number; validatorSigners: WalletId[] },
  ) {
    this.tx(operator, "submitProof", jobId, "proof submitted, challenge window open", (s) => {
      const j = this.job(s, jobId);
      if (j.operator !== operator) throw new EngineError("not-job-operator");
      this.requireState(j, "Accepted");
      if (this.clock() > j.sprayDeadline) throw new EngineError("proof-after-deadline");
      const signers = this.distinctValidators(s, p.validatorSigners, [j.farmer, j.operator]);
      if (signers.length < s.config.proofThreshold) {
        throw new EngineError("validator-threshold", `need ${s.config.proofThreshold} validator signatures, got ${signers.length}`);
      }
      if (p.areaCoveredCha * 100 > j.areaCha * MAX_AREA_OVERSHOOT_PCT) {
        throw new EngineError("area-exceeds-posted", `covered ${p.areaCoveredCha} cha > ${MAX_AREA_OVERSHOOT_PCT}% of ${j.areaCha} cha`);
      }
      const v = computeVerdict(
        { areaCha: j.areaCha, targetRateMlPerHa: j.targetRateMlPerHa, toleranceBps: j.toleranceBps },
        { litersMl: p.litersMl, areaCoveredCha: p.areaCoveredCha },
      );
      if (!v.pass) {
        const failing = v.checks.filter((c) => !c.pass);
        throw new EngineError(failing[0].name, failing.map((c) => `${c.name}: ${c.detail}`).join("; "));
      }
      j.proof = {
        proofHash: p.proofHash,
        litersMl: p.litersMl,
        areaCoveredCha: p.areaCoveredCha,
        signers,
        submittedAt: this.clock(),
        windowEndsAt: this.clock() + s.config.challengeWindowSecs,
        appliedRateMlPerHa: v.appliedRateMlPerHa,
        coverageBps: v.coverageBps,
      };
      j.state = "ProofSubmitted";
      return { result: undefined };
    });
  }

  /** Anyone can call. Pays the operator once the challenge window is closed. */
  settle(caller: WalletId, jobId: number) {
    this.tx(caller, "settle", jobId, "settled after challenge window", (s) => {
      const j = this.job(s, jobId);
      this.requireState(j, "ProofSubmitted");
      if (this.clock() < j.proof!.windowEndsAt) throw new EngineError("window-open", "challenge window still open");
      const amounts = this.payOut(s, j, "settled");
      j.state = "Released";
      s.operators[j.operator!].jobsCompleted += 1;
      return { amounts, result: undefined };
    });
  }

  challenge(farmer: WalletId, jobId: number, evidenceHash: string) {
    this.tx(farmer, "challenge", jobId, "challenged, 20% bond locked", (s) => {
      const j = this.job(s, jobId);
      if (j.farmer !== farmer) throw new EngineError("not-farmer");
      this.requireState(j, "ProofSubmitted");
      if (this.clock() >= j.proof!.windowEndsAt) throw new EngineError("window-closed");
      const bond = (j.amount * s.config.challengeBondBps) / 10_000n;
      this.move(s, farmer, vaultOf(jobId), bond);
      j.challenge = { farmer, evidenceHash, bond, at: this.clock() };
      j.state = "Challenged";
      return { amounts: { [farmer]: -bond }, result: undefined };
    });
  }

  /** upheld = farmer wins (operator refused payment). */
  resolveChallenge(panelSigners: WalletId[], jobId: number, upheld: boolean, reportHash: string) {
    this.tx(panelSigners[0] ?? "none", "resolveChallenge", jobId, `challenge ${upheld ? "upheld" : "rejected"} (${reportHash})`, (s) => {
      const j = this.job(s, jobId);
      this.requireState(j, "Challenged");
      if (this.distinctValidators(s, panelSigners, [j.farmer, j.operator]).length < s.config.panelThreshold) {
        throw new EngineError("panel-threshold");
      }
      const amounts = this.payOut(s, j, upheld ? "challenge-upheld" : "challenge-rejected");
      const fp = s.farmers[j.farmer];
      if (upheld) {
        j.state = "Refunded";
        fp.challengesWon += 1;
        s.operators[j.operator!].jobsFailed += 1;
      } else {
        j.state = "Released";
        fp.challengesLost += 1;
        s.operators[j.operator!].jobsCompleted += 1;
      }
      return { amounts, result: undefined };
    });
  }

  /** Anyone can call after the spray deadline if no proof was submitted. */
  reclaimExpired(caller: WalletId, jobId: number) {
    this.tx(caller, "reclaimExpired", jobId, "deadline passed, farmer reclaims payment and bond", (s) => {
      const j = this.job(s, jobId);
      this.requireState(j, "Accepted");
      if (this.clock() <= j.sprayDeadline) throw new EngineError("deadline-not-passed");
      const amounts = this.payOut(s, j, "expired");
      j.state = "Refunded";
      s.operators[j.operator!].jobsFailed += 1;
      return { amounts, result: undefined };
    });
  }
}

/** Sum of every balance. Equals state.minted unless money was created or lost. */
/** Seconds left in a job's challenge window at `nowSecs`. Pure, so UI can pass a ticking clock. */
export function windowLeft(job: Job | undefined, nowSecs: number): number {
  const p = job?.proof;
  return p ? Math.max(0, p.windowEndsAt - nowSecs) : 0;
}

export function totalBalance(s: EngineState): bigint {
  return Object.values(s.balances).reduce((a, b) => a + b, 0n);
}
