// Pure verification logic for the proof service. Mirrors the checks in
// programs/kvali/src/lib.rs `submit_proof` so a proof that passes here
// will not be rejected on-chain.

export const MIN_COVERAGE_BPS = 9_500;
const BPS = 10_000;

export interface JobTerms {
  /** Posted field area, hundredths of a hectare. */
  areaCha: number;
  /** Target application rate, milliliters per hectare. */
  targetRateMlPerHa: number;
  /** Allowed deviation from the target rate, basis points. */
  toleranceBps: number;
}

export interface SprayRecord {
  /** Liters dispensed by the flow meter, in milliliters. */
  litersMl: number;
  /** Area covered by the spray swath, hundredths of a hectare. */
  areaCoveredCha: number;
  /** Tank weight before and after, kg. Optional cross-check. */
  tankKgBefore?: number;
  tankKgAfter?: number;
  /** Density of the mix, kg per liter. Needed for the tank cross-check. */
  mixDensityKgPerL?: number;
}

export type Check = { name: string; pass: boolean; detail: string };

export interface Verdict {
  pass: boolean;
  appliedRateMlPerHa: number;
  coverageBps: number;
  checks: Check[];
}

/** Flow-meter and tank-weight readings may differ by this much. */
const TANK_TOLERANCE = 0.1;

export function computeVerdict(job: JobTerms, rec: SprayRecord): Verdict {
  const checks: Check[] = [];

  const coverageBps =
    job.areaCha > 0 ? Math.floor((rec.areaCoveredCha * BPS) / job.areaCha) : 0;
  checks.push({
    name: "coverage",
    pass: rec.areaCoveredCha * BPS >= job.areaCha * MIN_COVERAGE_BPS,
    detail: `${(coverageBps / 100).toFixed(1)}% of posted area (min ${MIN_COVERAGE_BPS / 100}%)`,
  });

  // Integer math, same as on-chain: ml/ha = ml * 100 / cha.
  const applied =
    rec.areaCoveredCha > 0 ? Math.floor((rec.litersMl * 100) / rec.areaCoveredCha) : 0;
  const lo = Math.floor((job.targetRateMlPerHa * (BPS - job.toleranceBps)) / BPS);
  const hi = Math.floor((job.targetRateMlPerHa * (BPS + job.toleranceBps)) / BPS);
  checks.push({
    name: "rate",
    pass: rec.areaCoveredCha > 0 && applied >= lo && applied <= hi,
    detail: `${(applied / 1000).toFixed(2)} L/ha, allowed ${(lo / 1000).toFixed(2)}–${(hi / 1000).toFixed(2)}`,
  });

  if (
    rec.tankKgBefore !== undefined &&
    rec.tankKgAfter !== undefined &&
    rec.mixDensityKgPerL !== undefined
  ) {
    const tankLiters = (rec.tankKgBefore - rec.tankKgAfter) / rec.mixDensityKgPerL;
    const flowLiters = rec.litersMl / 1000;
    const diff = flowLiters > 0 ? Math.abs(tankLiters - flowLiters) / flowLiters : 1;
    checks.push({
      name: "tank-crosscheck",
      pass: diff <= TANK_TOLERANCE,
      detail: `flow ${flowLiters.toFixed(1)} L vs tank ${tankLiters.toFixed(1)} L (${(diff * 100).toFixed(1)}% apart)`,
    });
  }

  return {
    pass: checks.every((c) => c.pass),
    appliedRateMlPerHa: applied,
    coverageBps,
    checks,
  };
}
