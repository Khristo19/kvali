import { test } from "node:test";
import assert from "node:assert/strict";
import { computeSettlement } from "./settlement.ts";

const usdc = (n: number) => BigInt(n) * 1_000_000n;
const job = usdc(300);
const bond = usdc(300);

test("unchallenged job: operator gets payment minus 5%, bond back", () => {
  const p = computeSettlement(job, bond, "settled");
  assert.equal(p.kvali, usdc(9));
  assert.equal(p.validators, usdc(6));
  assert.equal(p.operator, usdc(585)); // 300 + 300 bond - 15
  assert.equal(p.farmer, 0n);
});

test("farmer challenges and loses: their $60 bond pays the panel and the operator", () => {
  const p = computeSettlement(job, bond, "challenge-rejected");
  assert.equal(p.validators, usdc(36)); // 6 fee + 30 panel
  assert.equal(p.operator, usdc(615)); // 300 + 300 + 60 - 9 - 36
});

test("farmer challenges and wins: gets everything minus the panel fee", () => {
  const p = computeSettlement(job, bond, "challenge-upheld");
  assert.equal(p.kvali, 0n);
  assert.equal(p.validators, usdc(30));
  assert.equal(p.farmer, usdc(630)); // 300 + 300 + 60 - 30
  assert.equal(p.operator, 0n);
});

test("operator never delivers: farmer gets payment and bond, no fees", () => {
  const p = computeSettlement(job, bond, "expired");
  assert.equal(p.farmer, usdc(600));
  assert.equal(p.kvali + p.validators, 0n);
});

test("nothing is created or lost in any outcome", () => {
  for (const o of ["settled", "challenge-rejected", "challenge-upheld", "expired"] as const) {
    const p = computeSettlement(job, bond, o);
    const challenged = o.startsWith("challenge");
    const vault = job + bond + (challenged ? usdc(60) : 0n);
    assert.equal(p.farmer + p.operator + p.kvali + p.validators, vault, o);
  }
});
