import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreCalibration, type CalibrationRun } from "./calibration.ts";

const good: CalibrationRun = {
  reportedLiters: 20.4,
  tankKgBefore: 40,
  tankKgAfter: 20, // 20 L of water left the tank
  densityKgPerL: 1,
  cardCoveragePct: [18, 22, 15, 30, 12, 25, 19, 16, 21, 14],
  operatorPassed: true,
};

test("accurate meter, good coverage, skilled operator: certified", () => {
  const r = scoreCalibration(good);
  assert.equal(r.meterErrorBps, 200); // 2%
  assert.equal(r.certified, true);
});

test("meter over-reports by 10%: not certified", () => {
  const r = scoreCalibration({ ...good, reportedLiters: 22 });
  assert.equal(r.meterErrorBps, 1000);
  assert.equal(r.meterOk, false);
  assert.equal(r.certified, false);
});

test("half the cards dry (clogged nozzle): not certified", () => {
  const r = scoreCalibration({ ...good, cardCoveragePct: [20, 0, 18, 1, 22, 0, 19, 2, 25, 0] });
  assert.equal(r.sprayOk, false);
  assert.equal(r.certified, false);
});

test("operator fails the practical part: not certified", () => {
  assert.equal(scoreCalibration({ ...good, operatorPassed: false }).certified, false);
});

test("nothing left the tank: not certified, no divide by zero", () => {
  const r = scoreCalibration({ ...good, tankKgAfter: 40 });
  assert.equal(r.meterOk, false);
  assert.equal(r.certified, false);
});
