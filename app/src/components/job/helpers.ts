// Pure helpers for the job story screen (SIMULATED engine data).
import { VALIDATORS, WALLETS } from "@/engine/scenario";
import type { Action, EventLogEntry, Job } from "@/engine/types";
import { usdc } from "@/components/money";

/** True for the engine's fake ids. Devnet mode (w09) returns real signatures, which switch to links automatically. */
export function isSimulated(tx: string): boolean {
  return tx.startsWith("SIM-");
}

export function explorerUrl(sig: string): string {
  return `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
}

export function shortTx(tx: string): string {
  return tx.length > 22 ? `${tx.slice(0, 10)}...${tx.slice(-8)}` : tx;
}

/** Wallet id -> plain words. */
export function actorName(id: string): string {
  if (id === WALLETS.farmer) return "Farmer";
  if (id === WALLETS.operator) return "Operator";
  if (id === WALLETS.treasury) return "Kvali";
  if (id === WALLETS.validatorPool) return "Validators";
  if (id === "faucet") return "Test faucet";
  const v = VALIDATORS.find((x) => x.id === id);
  return v ? v.label : id;
}

/** "+0:42" relative to the job being posted. */
export function relTime(time: number, base: number): string {
  const d = time - base;
  if (d < 0) return "earlier";
  return `+${Math.floor(d / 60)}:${String(d % 60).padStart(2, "0")}`;
}

export function mmss(secs: number): string {
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
}

const SENTENCES: Partial<Record<Action, string>> = {
  postJob: "Posted the job and put the payment on hold, safely.",
  acceptJob: "Accepted the job and locked a bond equal to the job value.",
  submitProof: "Submitted the spray record, co-signed by validators.",
  settle: "Challenge window closed with no dispute, so the job settled and everyone was paid.",
  challenge: "Challenged the spray result and locked a deposit.",
  resolveChallenge: "The validator panel ruled on the challenge and paid out.",
  cancelJob: "Cancelled the job and took the payment back.",
  reclaimExpired: "The deadline passed, so the payment and bond went back to the farmer.",
  issueCertificate: "Issued the operator's drone calibration certificate.",
};

export function describe(e: EventLogEntry): string {
  return SENTENCES[e.action] ?? e.note;
}

/** Log entries for this job, plus the operator's certificate once an operator is on the job. */
export function jobLog(log: EventLogEntry[], job: Job): EventLogEntry[] {
  // The operator's certificate is a pre-step from before the job (shown separately), so the story is strictly in block-time order.
  return log.filter((e) => e.jobId === job.id).sort((a, b) => a.time - b.time || a.seq - b.seq);
}

export function moneyLine(e: EventLogEntry): string[] {
  return Object.entries(e.amounts).map(([w, a]) => `${actorName(w)} ${a >= 0n ? "+" : ""}${usdc(a)}`);
}

export interface Split {
  label: string;
  value: bigint;
  color: string;
}

/** Breakdown of a finished job's payout. Operator payout = pay + returned bond. */
export function payoutRows(job: Job, colorsByKey: Record<string, string>): { rows: Split[]; total: bigint; expected: bigint } | null {
  const p = job.payout;
  if (!p) return null;
  const challengeBond = job.challenge?.bond ?? 0n;
  const expected = job.amount + job.bond + challengeBond;
  const operatorWins = p.operator > 0n;
  const bondBack = operatorWins ? (p.operator < job.bond ? p.operator : job.bond) : 0n;
  const rows: Split[] = [
    { label: "Operator (payment)", value: p.operator - bondBack, color: colorsByKey.operator },
    { label: "Kvali fee (3%)", value: p.kvali, color: colorsByKey.kvali },
    { label: "Validators (2%)", value: p.validators, color: colorsByKey.validators },
    { label: "Farmer refund", value: p.farmer, color: colorsByKey.farmer },
    { label: "Operator bond returned", value: bondBack, color: colorsByKey.bond },
  ].filter((r) => r.value > 0n);
  const total = rows.reduce((a, r) => a + r.value, 0n);
  return { rows, total, expected };
}
