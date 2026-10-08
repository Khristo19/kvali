import { test } from "node:test";
import assert from "node:assert/strict";
import { computeVerdict, type JobTerms } from "./verdict.ts";

// 20 ha field, 10 L/ha target, ±15%.
const job: JobTerms = { areaCha: 2000, targetRateMlPerHa: 10_000, toleranceBps: 1500 };

test("honest job passes", () => {
  const v = computeVerdict(job, { litersMl: 200_000, areaCoveredCha: 2000 });
  assert.equal(v.pass, true);
  assert.equal(v.appliedRateMlPerHa, 10_000);
});

test("pump off (flew the pattern, sprayed nothing) fails on rate", () => {
  const v = computeVerdict(job, { litersMl: 0, areaCoveredCha: 2000 });
  assert.equal(v.pass, false);
  assert.equal(v.checks.find((c) => c.name === "rate")?.pass, false);
});

test("half the field fails on coverage", () => {
  const v = computeVerdict(job, { litersMl: 100_000, areaCoveredCha: 1000 });
  assert.equal(v.pass, false);
  assert.equal(v.checks.find((c) => c.name === "coverage")?.pass, false);
});

test("slightly short coverage within tolerance passes", () => {
  // 97.5% coverage at ~10.26 L/ha
  const v = computeVerdict(job, { litersMl: 200_000, areaCoveredCha: 1950 });
  assert.equal(v.pass, true);
});

test("double dose fails on rate", () => {
  const v = computeVerdict(job, { litersMl: 400_000, areaCoveredCha: 2000 });
  assert.equal(v.pass, false);
  assert.equal(v.checks.find((c) => c.name === "rate")?.pass, false);
});

test("flow meter disagreeing with tank weight fails the cross-check", () => {
  const v = computeVerdict(job, {
    litersMl: 200_000,
    areaCoveredCha: 2000,
    tankKgBefore: 60,
    tankKgAfter: 55, // only 5 kg left the tank, flow meter claims 200 L
    mixDensityKgPerL: 1.0,
  });
  assert.equal(v.pass, false);
  assert.equal(v.checks.find((c) => c.name === "tank-crosscheck")?.pass, false);
});

test("zero covered area does not divide by zero", () => {
  const v = computeVerdict(job, { litersMl: 1000, areaCoveredCha: 0 });
  assert.equal(v.pass, false);
});
