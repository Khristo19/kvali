/// <reference types="node" />
// SIMULATED engine tests. Run from app/: node --test src/engine/engine.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { Engine, defaultConfig, totalBalance, vaultOf } from "./engine.ts";
import { EngineError } from "./types.ts";
import {
  USDC, WALLETS, VALIDATORS, DRONE, SAMPLE_JOB_ID, PROOF_SIGNERS, PANEL_SIGNERS,
  DEMO_DEADLINE_SECS, sampleJob, sampleRecords,
  createDemoEngine, postSampleJob, acceptSampleJob, submitSampleRecord,
} from "./scenario.ts";

function setup() {
  let t = 1_000_000;
  const clock = () => t;
  const e = createDemoEngine(clock);
  return { e, clock, advance: (s: number) => (t += s) };
}
const bal = (e: ReturnType<typeof setup>["e"]) => ({
  farmer: e.balance(WALLETS.farmer),
  operator: e.balance(WALLETS.operator),
  kvali: e.balance(WALLETS.treasury),
  validators: e.balance(WALLETS.validatorPool),
});
function conserved(e: ReturnType<typeof setup>["e"]) {
  const s = e.getState();
  assert.equal(totalBalance(s), s.minted, "money created or lost");
}
function rejects(fn: () => void, code: string) {
  assert.throws(fn, (err: unknown) => err instanceof EngineError && err.code === code, code);
}
function toProof() {
  const c = setup();
  postSampleJob(c.e);
  acceptSampleJob(c.e);
  submitSampleRecord(c.e, "honest");
  return c;
}

test("honest job settles: operator +585 from the vault, Kvali 9, validators 6", () => {
  const { e, advance } = toProof();
  advance(61);
  e.settle("anyone", SAMPLE_JOB_ID);
  const b = bal(e);
  // Operator started with 1000, locked 300 bond, receives 585 from a 600 vault.
  assert.equal(b.operator, 1_000n * USDC - 300n * USDC + 585n * USDC);
  assert.equal(b.kvali, 9n * USDC);
  assert.equal(b.validators, 6n * USDC);
  assert.equal(b.farmer, 700n * USDC);
  assert.equal(e.balance(vaultOf(SAMPLE_JOB_ID)), 0n);
  const j = e.getState().jobs[SAMPLE_JOB_ID];
  assert.equal(j.state, "Released");
  assert.equal(j.payout!.operator, 585n * USDC);
  assert.equal(e.getState().operators[WALLETS.operator].jobsCompleted, 1);
  conserved(e);
});

test("settle before the challenge window closes fails", () => {
  const { e, advance } = toProof();
  rejects(() => e.settle("anyone", SAMPLE_JOB_ID), "window-open");
  advance(59);
  rejects(() => e.settle("anyone", SAMPLE_JOB_ID), "window-open");
  advance(1);
  e.settle("anyone", SAMPLE_JOB_ID);
  conserved(e);
});

test("pump-off record is rejected with 'rate'", () => {
  const { e } = setup();
  postSampleJob(e);
  acceptSampleJob(e);
  rejects(() => submitSampleRecord(e, "pumpOff"), "rate");
  assert.equal(e.getState().jobs[SAMPLE_JOB_ID].state, "Accepted");
});

test("half-field record is rejected with 'coverage'", () => {
  const { e } = setup();
  postSampleJob(e);
  acceptSampleJob(e);
  rejects(() => submitSampleRecord(e, "halfField"), "coverage");
});

test("tank mismatch is a verdict check in the manifest but the on-chain inputs pass", () => {
  // The program only sees liters and area; the tank cross-check is the data validators' job.
  const { e } = setup();
  postSampleJob(e);
  acceptSampleJob(e);
  submitSampleRecord(e, "tankMismatch");
  assert.equal(e.getState().jobs[SAMPLE_JOB_ID].state, "ProofSubmitted");
});

test("uncertified operator cannot accept", () => {
  const { e } = setup();
  e.fund("operator-2", 1_000n * USDC);
  e.registerOperator("operator-2");
  postSampleJob(e);
  rejects(() => e.acceptJob("operator-2", SAMPLE_JOB_ID, DRONE.hash, 300n * USDC), "no-certificate");
});

test("revoked or poor-calibration certificate cannot accept", () => {
  const { e } = setup();
  postSampleJob(e);
  e.revokeCertificate(PANEL_SIGNERS, WALLETS.operator, DRONE.hash);
  rejects(() => acceptSampleJob(e), "certificate-revoked");
});

test("bond smaller than the job amount is rejected", () => {
  const { e } = setup();
  postSampleJob(e);
  rejects(() => acceptSampleJob(e, SAMPLE_JOB_ID, 299n * USDC), "bond-too-small");
  conserved(e);
});

test("one validator signature is rejected", () => {
  const { e } = setup();
  postSampleJob(e);
  acceptSampleJob(e);
  rejects(() => submitSampleRecord(e, "honest", SAMPLE_JOB_ID, [VALIDATORS[0].id]), "validator-threshold");
  // Duplicates and outsiders do not count.
  rejects(
    () => submitSampleRecord(e, "honest", SAMPLE_JOB_ID, [VALIDATORS[0].id, VALIDATORS[0].id, "stranger"]),
    "validator-threshold",
  );
});

test("challenge lost: operator 615, validators 36 (plus 9 Kvali)", () => {
  const { e } = toProof();
  e.challenge(WALLETS.farmer, SAMPLE_JOB_ID, "SIM-evidence");
  assert.equal(e.balance(vaultOf(SAMPLE_JOB_ID)), 660n * USDC);
  assert.equal(e.getState().jobs[SAMPLE_JOB_ID].state, "Challenged");
  e.resolveChallenge(PANEL_SIGNERS, SAMPLE_JOB_ID, false, "SIM-report");
  const j = e.getState().jobs[SAMPLE_JOB_ID];
  assert.equal(j.payout!.operator, 615n * USDC);
  assert.equal(j.payout!.validators, 36n * USDC);
  assert.equal(j.payout!.kvali, 9n * USDC);
  assert.equal(j.state, "Released");
  assert.equal(e.getState().farmers[WALLETS.farmer].challengesLost, 1);
  assert.equal(e.balance(WALLETS.farmer), 640n * USDC); // 1000 - 300 - 60
  conserved(e);
});

test("challenge won: farmer 630, validators 30", () => {
  const { e } = toProof();
  e.challenge(WALLETS.farmer, SAMPLE_JOB_ID, "SIM-evidence");
  e.resolveChallenge(PANEL_SIGNERS, SAMPLE_JOB_ID, true, "SIM-report");
  const j = e.getState().jobs[SAMPLE_JOB_ID];
  assert.equal(j.payout!.farmer, 630n * USDC);
  assert.equal(j.payout!.validators, 30n * USDC);
  assert.equal(j.payout!.kvali, 0n);
  assert.equal(j.state, "Refunded");
  assert.equal(e.balance(WALLETS.farmer), 1_000n * USDC - 300n * USDC - 60n * USDC + 630n * USDC);
  assert.equal(e.getState().farmers[WALLETS.farmer].challengesWon, 1);
  assert.equal(e.getState().operators[WALLETS.operator].jobsFailed, 1);
  conserved(e);
});

test("challenge only inside the window, and resolution needs the panel threshold", () => {
  const { e, advance } = toProof();
  rejects(() => e.challenge("someone-else", SAMPLE_JOB_ID, "x"), "not-farmer");
  e.challenge(WALLETS.farmer, SAMPLE_JOB_ID, "SIM-evidence");
  rejects(() => e.resolveChallenge([PANEL_SIGNERS[0]], SAMPLE_JOB_ID, true, "r"), "panel-threshold");
  const late = toProof();
  late.advance(61);
  rejects(() => late.e.challenge(WALLETS.farmer, SAMPLE_JOB_ID, "x"), "window-closed");
  void advance;
});

test("reclaim after the spray deadline returns payment and bond with no fees", () => {
  const { e, advance } = setup();
  postSampleJob(e);
  acceptSampleJob(e);
  rejects(() => e.reclaimExpired("anyone", SAMPLE_JOB_ID), "deadline-not-passed");
  advance(5 * 24 * 3600);
  e.reclaimExpired("anyone", SAMPLE_JOB_ID);
  assert.equal(e.balance(WALLETS.farmer), 1_000n * USDC + 300n * USDC); // own 700 + 600 back
  assert.equal(e.balance(WALLETS.operator), 700n * USDC); // bond lost
  assert.equal(e.balance(WALLETS.treasury), 0n);
  assert.equal(e.getState().jobs[SAMPLE_JOB_ID].state, "Refunded");
  assert.equal(e.getState().operators[WALLETS.operator].activeJob, null);
  conserved(e);
});

test("cancel a posted job refunds in full; cannot cancel after accept", () => {
  const { e } = setup();
  postSampleJob(e);
  e.cancelJob(WALLETS.farmer, SAMPLE_JOB_ID);
  assert.equal(e.balance(WALLETS.farmer), 1_000n * USDC);
  postSampleJob(e, 18);
  acceptSampleJob(e, 18);
  rejects(() => e.cancelJob(WALLETS.farmer, 18), "wrong-state");
  conserved(e);
});

test("event log: SIM- tx ids, ordered, failed actions leave no trace", () => {
  const { e } = setup();
  postSampleJob(e);
  const before = e.getState();
  rejects(() => acceptSampleJob(e, SAMPLE_JOB_ID, 1n), "bond-too-small");
  assert.equal(e.getState(), before);
  const log = e.getState().log;
  assert.ok(log.every((l) => l.tx.startsWith("SIM-")));
  assert.deepEqual(log.map((l) => l.seq), log.map((_, i) => i + 1));
  assert.equal(new Set(log.map((l) => l.tx)).size, log.length);
});

test("a busy operator cannot take a second job", () => {
  const { e } = setup();
  postSampleJob(e);
  postSampleJob(e, 18);
  acceptSampleJob(e);
  rejects(() => acceptSampleJob(e, 18), "operator-busy");
});
// ---- k03 rules (mirror KvaliError names in the program) ----

const certParams = (operator: string, validUntil: number) => ({
  operator,
  droneHash: DRONE.hash,
  droneModel: DRONE.model,
  meterErrorBps: DRONE.meterErrorBps,
  operatorPassed: true,
  reportHash: "SIM-report",
  validUntil,
});

test("CertificateRevoked: one validator cannot re-issue a certificate a panel revoked", () => {
  const { e } = setup();
  e.revokeCertificate(PANEL_SIGNERS, WALLETS.operator, DRONE.hash);
  rejects(
    () => e.issueCertificate(VALIDATORS[0].id, certParams(WALLETS.operator, e.now() + 3600)),
    "certificate-revoked",
  );
  assert.equal(e.getState().certificates[`${WALLETS.operator}:${DRONE.hash}`].revoked, true);
  // A non-revoked certificate can still be renewed.
  const { e: e2 } = setup();
  e2.issueCertificate(VALIDATORS[0].id, certParams(WALLETS.operator, e2.now() + 7200));
});

test("ProofAfterDeadline: proof after the spray deadline fails; reclaim still works", () => {
  const { e, advance } = setup();
  postSampleJob(e);
  acceptSampleJob(e);
  advance(DEMO_DEADLINE_SECS + 1);
  rejects(() => submitSampleRecord(e, "honest"), "proof-after-deadline");
  e.reclaimExpired("anyone", SAMPLE_JOB_ID);
  assert.equal(e.getState().jobs[SAMPLE_JOB_ID].state, "Refunded");
  conserved(e);
});

test("AreaExceedsPosted: covered area above 105% of the posted area fails", () => {
  const { e } = setup();
  postSampleJob(e);
  acceptSampleJob(e);
  const area = Math.floor((sampleJob.areaCha * 106) / 100);
  // Liters scaled so the rate stays in band: only the area rule can fail.
  const liters = Math.round((sampleRecords.honest.litersMl * area) / sampleRecords.honest.areaCoveredCha);
  rejects(
    () => e.submitProof(WALLETS.operator, SAMPLE_JOB_ID, {
      proofHash: "SIM-proof-big", litersMl: liters, areaCoveredCha: area, validatorSigners: PROOF_SIGNERS,
    }),
    "area-exceeds-posted",
  );
  assert.equal(e.getState().jobs[SAMPLE_JOB_ID].state, "Accepted");
});

test("OperatorIsFarmer: a farmer cannot accept their own job", () => {
  const { e } = setup();
  postSampleJob(e);
  e.registerOperator(WALLETS.farmer);
  e.issueCertificate(VALIDATORS[0].id, certParams(WALLETS.farmer, e.now() + 3600));
  rejects(() => e.acceptJob(WALLETS.farmer, SAMPLE_JOB_ID, DRONE.hash, 300n * USDC), "operator-is-farmer");
  conserved(e);
});

test("conflict of interest: a validator who is the job's operator or farmer does not count", () => {
  let t = 1_000_000;
  const clock = () => t;
  const e = new Engine(
    defaultConfig([
      { id: WALLETS.operator, label: "Operator who is also a validator", seat: "operator-side" },
      { id: WALLETS.farmer, label: "Farmer who is also a validator", seat: "farmer-side" },
      { id: "validator-a", label: "Validator A", seat: "neutral" },
      { id: "validator-b", label: "Validator B", seat: "neutral" },
    ]),
    clock,
  );
  e.fund(WALLETS.farmer, 1_000n * USDC);
  e.fund(WALLETS.operator, 1_000n * USDC);
  e.registerOperator(WALLETS.operator);
  e.issueCertificate("validator-a", certParams(WALLETS.operator, t + 3600));
  postSampleJob(e);
  acceptSampleJob(e);
  rejects(() => submitSampleRecord(e, "honest", SAMPLE_JOB_ID, [WALLETS.operator, "validator-a"]), "validator-threshold");
  rejects(() => submitSampleRecord(e, "honest", SAMPLE_JOB_ID, [WALLETS.farmer, "validator-a"]), "validator-threshold");
  submitSampleRecord(e, "honest", SAMPLE_JOB_ID, ["validator-a", "validator-b"]);
  e.challenge(WALLETS.farmer, SAMPLE_JOB_ID, "SIM-evidence");
  rejects(() => e.resolveChallenge([WALLETS.farmer, "validator-a"], SAMPLE_JOB_ID, true, "r"), "panel-threshold");
  rejects(() => e.resolveChallenge([WALLETS.operator, "validator-a"], SAMPLE_JOB_ID, false, "r"), "panel-threshold");
  // The certificate's own operator does not count toward a revocation either.
  rejects(() => e.revokeCertificate([WALLETS.operator, "validator-a"], WALLETS.operator, DRONE.hash), "panel-threshold");
  e.resolveChallenge(["validator-a", "validator-b"], SAMPLE_JOB_ID, false, "r");
  assert.equal(e.getState().jobs[SAMPLE_JOB_ID].state, "Released");
  conserved(e);
});

void PROOF_SIGNERS;
