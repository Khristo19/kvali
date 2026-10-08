// SIMULATED sample data from services/proof/samples (not a real job, drone,
// operator or field). Imported by relative path so it works in Node and Metro.
import jobJson from "../../../services/proof/samples/job-17ha.json" with { type: "json" };
import honest from "../../../services/proof/samples/record-honest.json" with { type: "json" };
import pumpOff from "../../../services/proof/samples/record-pump-off.json" with { type: "json" };
import halfField from "../../../services/proof/samples/record-half-field.json" with { type: "json" };
import tankMismatch from "../../../services/proof/samples/record-tank-mismatch.json" with { type: "json" };

export interface SampleRecord {
  sample: string;
  litersMl: number;
  areaCoveredCha: number;
  /** Verdict stored in the simulated manifest (expected result). */
  expectedPass: boolean;
  raw: unknown;
}

export const sampleJob = {
  jobRef: jobJson.job_id,
  fieldRef: jobJson.field_ref,
  fieldHash: jobJson.field_hash,
  areaCha: jobJson.area_cha,
  targetRateMlPerHa: jobJson.target_rate_ml_per_ha,
  toleranceBps: jobJson.tolerance_bps,
  paymentUsdc: jobJson.payment_usdc,
  farmersInBatch: jobJson.farmers_in_batch,
  sprayDeadline: jobJson.spray_window.deadline,
  raw: jobJson as unknown,
};

function rec(m: any): SampleRecord {
  return {
    sample: m.sample,
    litersMl: m.totals.liters_ml,
    areaCoveredCha: m.totals.area_covered_cha,
    expectedPass: m.verdict.pass,
    raw: m,
  };
}

/** SIMULATED spray records keyed by name. */
export const sampleRecords = {
  honest: rec(honest),
  pumpOff: rec(pumpOff),
  halfField: rec(halfField),
  tankMismatch: rec(tankMismatch),
};
