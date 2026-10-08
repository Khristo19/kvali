// Runs computeVerdict over the SIMULATED sample records in ../samples.
// All sample data is simulated demo data, not a real job.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { computeVerdict, type JobTerms, type SprayRecord } from "./verdict.ts";

const load = (name: string) =>
  JSON.parse(readFileSync(new URL(`../samples/${name}`, import.meta.url), "utf8"));

function toJobTerms(j: any): JobTerms {
  return { areaCha: j.area_cha, targetRateMlPerHa: j.target_rate_ml_per_ha, toleranceBps: j.tolerance_bps };
}

function toSprayRecord(m: any): SprayRecord {
  return {
    litersMl: m.totals.liters_ml,
    areaCoveredCha: m.totals.area_covered_cha,
    tankKgBefore: m.tank.kg_before,
    tankKgAfter: m.tank.kg_after,
    mixDensityKgPerL: m.tank.mix_density_kg_per_l,
  };
}

const jobJson = load("job-17ha.json");
const job = toJobTerms(jobJson);

test("sample job is labelled simulated and is 17 ha at 10 L/ha ±15%", () => {
  assert.equal(jobJson.simulated, true);
  assert.deepEqual(job, { areaCha: 1700, targetRateMlPerHa: 10_000, toleranceBps: 1500 });
});

const cases: Array<[file: string, failing: string | null]> = [
  ["record-honest.json", null],
  ["record-pump-off.json", "rate"],
  ["record-half-field.json", "coverage"],
  ["record-tank-mismatch.json", "tank-crosscheck"],
];

for (const [file, failing] of cases) {
  test(`${file}: ${failing ? `fails only on ${failing}` : "passes all checks"}`, () => {
    const m = load(file);
    assert.equal(m.simulated, true);
    assert.match(m.notes, /simulated/i);

    // Per-flight numbers add up to the totals.
    const flightMl = Math.round(m.flights.reduce((a: number, f: any) => a + f.liters, 0) * 1000);
    const flightCha = Math.round(m.flights.reduce((a: number, f: any) => a + f.area_ha, 0) * 100);
    assert.equal(flightMl, m.totals.liters_ml);
    assert.equal(flightCha, m.totals.area_covered_cha);
    assert.equal(m.weather.within_limits, true);

    const v = computeVerdict(job, toSprayRecord(m));
    assert.equal(v.checks.length, 3);
    assert.equal(v.pass, failing === null);
    for (const c of v.checks) assert.equal(c.pass, c.name !== failing, `${c.name}: ${c.detail}`);

    // The verdict stored in the manifest matches a fresh run.
    assert.equal(m.verdict.pass, v.pass);
    assert.equal(m.verdict.applied_rate_ml_per_ha, v.appliedRateMlPerHa);
    assert.equal(m.verdict.coverage_bps, v.coverageBps);
  });
}
