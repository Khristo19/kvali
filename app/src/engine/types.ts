// SIMULATED engine types. Mirrors the accounts in docs/ONCHAIN_SPEC.md.
// Nothing here talks to a chain; "tx" ids are fake and start with SIM-.
// Amounts are USDC base units (6 decimals) as bigint.

export type JobState =
  | "Posted"
  | "Accepted"
  | "ProofSubmitted"
  | "Challenged"
  | "Released"
  | "Refunded"
  | "Cancelled";

/** Wallet id. Simulated: a plain string instead of a Solana public key. */
export type WalletId = string;

export interface Validator {
  id: WalletId;
  /** Generic label shown in the UI. */
  label: string;
  seat: "operator-side" | "farmer-side" | "neutral";
}

export interface Config {
  validators: Validator[];
  /** Data validator signatures needed for submit_proof (v1: 2 of 3). */
  proofThreshold: number;
  /** Field validator votes needed for resolve_challenge / revoke (v1: 2 of 3). */
  panelThreshold: number;
  /** 24 h for real jobs, 60 s on the demo deployment (D14). */
  challengeWindowSecs: number;
  kvaliFeeBps: bigint;
  validatorFeeBps: bigint;
  panelFeeBps: bigint;
  challengeBondBps: bigint;
  minCoverageBps: number;
  maxMeterErrorBps: number;
  treasury: WalletId;
  validatorPool: WalletId;
}

export interface Operator {
  id: WalletId;
  jobsCompleted: number;
  jobsFailed: number;
  /** Job id currently held, or null. */
  activeJob: number | null;
}

export interface FarmerProfile {
  id: WalletId;
  jobsPosted: number;
  challengesWon: number;
  challengesLost: number;
}

export interface Certificate {
  operator: WalletId;
  droneHash: string;
  /** Display only. */
  droneModel: string;
  meterErrorBps: number;
  operatorPassed: boolean;
  reportHash: string;
  issuedBy: WalletId;
  /** Unix seconds. */
  validUntil: number;
  revoked: boolean;
}

export interface ProofRecord {
  proofHash: string;
  litersMl: number;
  areaCoveredCha: number;
  signers: WalletId[];
  submittedAt: number;
  windowEndsAt: number;
  appliedRateMlPerHa: number;
  coverageBps: number;
}

export interface Challenge {
  farmer: WalletId;
  evidenceHash: string;
  bond: bigint;
  at: number;
}

export interface Job {
  id: number;
  farmer: WalletId;
  amount: bigint;
  fieldHash: string;
  /** Hundredths of a hectare. */
  areaCha: number;
  /** Milliliters per hectare. */
  targetRateMlPerHa: number;
  toleranceBps: number;
  postedAt: number;
  sprayDeadline: number;
  state: JobState;
  operator: WalletId | null;
  droneHash: string | null;
  bond: bigint;
  proof: ProofRecord | null;
  challenge: Challenge | null;
  /** Set when the job ends (Released/Refunded/Cancelled): the money split. */
  payout: { farmer: bigint; operator: bigint; kvali: bigint; validators: bigint } | null;
  endedAt: number | null;
}

export type Action =
  | "fund"
  | "registerOperator"
  | "postJob"
  | "cancelJob"
  | "issueCertificate"
  | "revokeCertificate"
  | "acceptJob"
  | "submitProof"
  | "settle"
  | "challenge"
  | "resolveChallenge"
  | "reclaimExpired";

export interface EventLogEntry {
  seq: number;
  /** Unix seconds from the injected clock. */
  time: number;
  actor: WalletId;
  action: Action;
  jobId: number | null;
  /** Money moved by this step, by wallet id (positive = received, negative = paid in). */
  amounts: Record<WalletId, bigint>;
  note: string;
  /** SIMULATED transaction id, always "SIM-" prefixed. Swapped for a devnet signature in w09. */
  tx: string;
}

export interface EngineState {
  config: Config;
  /** Token balances per wallet, including `vault:<jobId>` escrow accounts. */
  balances: Record<string, bigint>;
  /** Total ever minted by fund(); the sum of all balances always equals this. */
  minted: bigint;
  operators: Record<WalletId, Operator>;
  farmers: Record<WalletId, FarmerProfile>;
  /** Keyed by `${operator}:${droneHash}`. */
  certificates: Record<string, Certificate>;
  jobs: Record<number, Job>;
  log: EventLogEntry[];
}

export type Clock = () => number;

/**
 * Thrown when an action breaks a program rule. `code` is the rule that failed.
 * Codes added in k03 map to the program's KvaliError names:
 *   "certificate-revoked"  = CertificateRevoked  (issueCertificate over a revoked cert;
 *                                                 also used by acceptJob, where the program says NotCertified)
 *   "proof-after-deadline" = ProofAfterDeadline
 *   "area-exceeds-posted"  = AreaExceedsPosted
 *   "operator-is-farmer"   = OperatorIsFarmer
 * A validator who is the job's farmer or operator simply does not count, so a
 * conflicted signer surfaces as "validator-threshold" / "panel-threshold"
 * (program: NotEnoughValidators).
 */
export class EngineError extends Error {
  code: string;
  constructor(code: string, message?: string) {
    super(message ?? code);
    this.name = "EngineError";
    this.code = code;
  }
}
