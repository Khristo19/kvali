// SIMULATED demo seed: generic names, no real people, drone or field.
// One village batch (17 ha, $300) for a farmer group, one certified operator
// with a DJI Agras T50 (calibration meter error 2%), three validators.
import { Engine, defaultConfig } from "./engine.ts";
import type { Clock, Validator } from "./types.ts";
import { sampleJob, sampleRecords } from "./samples.ts";

export { sampleJob, sampleRecords };

export const USDC = 1_000_000n;

export const WALLETS = {
  farmer: "farmer-group-1",
  operator: "operator-1",
  treasury: "kvali-treasury",
  validatorPool: "validator-pool",
} as const;

export const VALIDATORS: Validator[] = [
  { id: "validator-operator-side", label: "Operator-side validator", seat: "operator-side" },
  { id: "validator-farmer-side", label: "Farmer-side validator", seat: "farmer-side" },
  { id: "validator-neutral", label: "Neutral validator", seat: "neutral" },
];

export const DRONE = {
  model: "DJI Agras T50",
  hash: "SIM-sha256-of-drone-serial",
  meterErrorBps: 200, // 2%
};

export const SAMPLE_JOB_ID = 17;
export const SAMPLE_AMOUNT = 300n * USDC;
/** Demo jobs must be spray-by within 30 minutes: long enough for a walkthrough, short enough that an abandoned job can be released (reclaim_expired) the same day. */
export const DEMO_DEADLINE_SECS = 30 * 60;

/** Two data validators sign (operator-side + neutral). Any 2 of 3 would do. */
export const PROOF_SIGNERS = [VALIDATORS[0].id, VALIDATORS[2].id];
/** Panel for challenges (farmer-side + neutral). */
export const PANEL_SIGNERS = [VALIDATORS[1].id, VALIDATORS[2].id];

/**
 * Engine with config, funded wallets and a certified operator. No job yet.
 * Farmer holds $1,000, operator $1,000 (bond), everyone else 0.
 */
export function createDemoEngine(clock: Clock, opts: { challengeWindowSecs?: number } = {}): Engine {
  const e = new Engine(
    defaultConfig(VALIDATORS, opts.challengeWindowSecs ? { challengeWindowSecs: opts.challengeWindowSecs } : {}),
    clock,
  );
  e.fund(WALLETS.farmer, 1_000n * USDC);
  e.fund(WALLETS.operator, 1_000n * USDC);
  e.registerOperator(WALLETS.operator);
  e.issueCertificate(VALIDATORS[1].id, {
    operator: WALLETS.operator,
    droneHash: DRONE.hash,
    droneModel: DRONE.model,
    meterErrorBps: DRONE.meterErrorBps,
    operatorPassed: true,
    reportHash: "SIM-sha256-of-calibration-report",
    validUntil: clock() + 365 * 24 * 3600,
  });
  return e;
}

/**
 * The sample spray record scaled to a job of another size (same rates, same shape). The demo records were
 * made for the 17 ha batch; a farmer's own field is smaller or bigger. Factor 1 returns the record as is.
 */
export function recordFor(which: keyof typeof sampleRecords, areaCha: number) {
  const r = sampleRecords[which];
  const f = areaCha / sampleJob.areaCha;
  if (f === 1) return r;
  const raw = r.raw as { tank?: { kg_before?: number; kg_after?: number } };
  const tank = raw.tank ? { ...raw.tank, kg_before: (raw.tank.kg_before ?? 0) * f, kg_after: (raw.tank.kg_after ?? 0) * f } : undefined;
  return {
    ...r,
    litersMl: Math.round(r.litersMl * f),
    areaCoveredCha: Math.round(r.areaCoveredCha * f),
    raw: tank ? { ...raw, tank } : raw,
  };
}

/** Post the $300 sample job (SIMULATED). With a field it uses the outline's hash and area, else the 17 ha batch. */
export function postSampleJob(e: Engine, jobId = SAMPLE_JOB_ID, field?: { hash: string; areaCha: number }) {
  return e.postJob(WALLETS.farmer, {
    jobId,
    amount: SAMPLE_AMOUNT,
    fieldHash: field?.hash ?? sampleJob.fieldHash,
    areaCha: field?.areaCha ?? sampleJob.areaCha,
    targetRateMlPerHa: sampleJob.targetRateMlPerHa,
    toleranceBps: sampleJob.toleranceBps,
    sprayDeadline: e.now() + DEMO_DEADLINE_SECS,
  });
}

export function acceptSampleJob(e: Engine, jobId = SAMPLE_JOB_ID, bond = SAMPLE_AMOUNT) {
  e.acceptJob(WALLETS.operator, jobId, DRONE.hash, bond);
}

/** Submit one of the simulated records with the default validator co-signers. */
export function submitSampleRecord(
  e: Engine,
  which: keyof typeof sampleRecords,
  jobId = SAMPLE_JOB_ID,
  validatorSigners: string[] = PROOF_SIGNERS,
) {
  const r = recordFor(which, e.getState().jobs[jobId].areaCha);
  e.submitProof(WALLETS.operator, jobId, {
    proofHash: `SIM-proof-${r.sample}`,
    litersMl: r.litersMl,
    areaCoveredCha: r.areaCoveredCha,
    validatorSigners,
  });
}
