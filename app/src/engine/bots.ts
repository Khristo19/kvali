// Validator bots: the arithmetic checks (coverage, L/ha band, flow meter vs tank) run automatically.
// Same verdict logic as the Validator screen always showed (services/proof/src/verdict.ts); humans only do
// certificates, spot checks and challenges.
import { computeVerdict } from "@kvali/proof/verdict";

import { VALIDATORS, recordFor, type sampleRecords } from "./scenario";
import type { Job } from "./types";

export type SampleKey = keyof typeof sampleRecords;
type Terms = Pick<Job, "areaCha" | "targetRateMlPerHa" | "toleranceBps">;

export interface BotCheck {
  name: string;
  pass: boolean;
  detail: string;
}
export interface BotVerdict {
  id: string;
  seat: string;
  label: string;
  pass: boolean;
  /** This bot's key signed the proof transaction. */
  signed: boolean;
}
/** What the bots did with one spray record. Kept in the session (survives reloads) and shown on the Validator screen. */
export interface BotRun {
  key: string;
  at: number;
  pass: boolean;
  checks: BotCheck[];
  bots: BotVerdict[];
  /** Why nothing was signed (failed checks, or fewer than 2 staked bots). */
  reason?: string;
  /** The submit_proof transaction that carries the co-signatures. */
  sig?: string;
}

/** Tank readings from the sample manifest, if present. */
function tankOf(raw: any) {
  const t = raw?.tank;
  if (!t) return {};
  return { tankKgBefore: t.kg_before, tankKgAfter: t.kg_after, mixDensityKgPerL: t.mix_density_kg_per_l };
}

/** The FULL verdict (coverage + rate + flow-meter vs tank cross-check). */
export function fullVerdict(job: Terms, key: SampleKey) {
  const r = recordFor(key, job.areaCha);
  return computeVerdict(
    { areaCha: job.areaCha, targetRateMlPerHa: job.targetRateMlPerHa, toleranceBps: job.toleranceBps },
    { litersMl: r.litersMl, areaCoveredCha: r.areaCoveredCha, ...tankOf(r.raw) },
  );
}

export const failReason = (checks: BotCheck[]) => checks.filter((c) => !c.pass).map((c) => `${c.name}: ${c.detail}`).join("; ");

/** Every bot runs the same checks; `signers` are the bots whose keys co-sign (empty when the record is refused). */
export function runBotChecks(job: Terms, key: SampleKey, signers: string[], reason?: string): BotRun {
  const v = fullVerdict(job, key);
  return {
    key,
    at: Math.floor(Date.now() / 1000),
    pass: v.pass,
    checks: v.checks,
    bots: VALIDATORS.map((b) => ({ id: b.id, seat: b.seat, label: b.label, pass: v.pass, signed: v.pass && signers.includes(b.id) })),
    reason: reason ?? (v.pass ? undefined : failReason(v.checks)),
  };
}

/** Thrown when the bots refuse a record: nothing is signed or sent, the reason is shown to everyone. */
export class BotRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BotRefused";
  }
}
