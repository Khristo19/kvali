import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { canonicalJson, manifestHash, buildManifest, jobTerms, sprayRecord, sha256Hex, type JobFile, type RecordFile } from "./manifest.ts";
import { computeVerdict } from "./verdict.ts";

const load = (name: string) =>
  JSON.parse(readFileSync(new URL(`../samples/${name}`, import.meta.url), "utf8"));

const job: JobFile = load("job-17ha.json");
const honest: RecordFile = load("record-honest.json");

function manifestFor(rec: RecordFile) {
  return buildManifest(job, rec, computeVerdict(jobTerms(job), sprayRecord(rec)));
}

test("canonicalJson sorts keys recursively and has no whitespace", () => {
  assert.equal(canonicalJson({ b: 1, a: { d: [{ z: 1, y: 2 }], c: null } }),
    '{"a":{"c":null,"d":[{"y":2,"z":1}]},"b":1}');
});

test("sha256Hex matches a known vector", () => {
  assert.equal(sha256Hex("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

test("manifest hash is stable for the same input", () => {
  assert.equal(manifestHash(manifestFor(honest)), manifestHash(manifestFor(honest)));
});

test("manifest hash does not depend on key order", () => {
  const m = manifestFor(honest);
  const reversed = Object.fromEntries(Object.entries(m).reverse());
  assert.equal(manifestHash(reversed), manifestHash(m));
});

test("manifest hash changes when the record changes", () => {
  const pumpOff: RecordFile = load("record-pump-off.json");
  assert.notEqual(manifestHash(manifestFor(honest)), manifestHash(manifestFor(pumpOff)));
});

test("manifest copies simulated flag and createdAt from the record, no clock reads", () => {
  const m = manifestFor(honest);
  assert.equal(m.version, 1);
  assert.equal(m.simulated, true);
  assert.equal(m.created_at, honest.created_at);
  assert.equal(m.job_id, "SIM-KAKHETI-0017");
  assert.equal(m.verdict.pass, true);
  assert.equal(m.verdict.checks.length, 3);
  assert.deepEqual(m.totals, { liters_ml: 170800, area_covered_cha: 1700 });
  assert.equal(m.operator, "SIMULATED-operator-pubkey");
});

const expectations: Array<[string, boolean, string | null]> = [
  ["record-honest.json", true, null],
  ["record-pump-off.json", false, "rate"],
  ["record-half-field.json", false, "coverage"],
  ["record-tank-mismatch.json", false, "tank-crosscheck"],
];

for (const [file, pass, failing] of expectations) {
  test(`${file}: verdict pass=${pass}${failing ? `, failing ${failing}` : ""}`, () => {
    const m = manifestFor(load(file));
    assert.equal(m.verdict.pass, pass);
    for (const c of m.verdict.checks) {
      assert.equal(c.pass, c.name !== failing, `${c.name}: ${c.detail}`);
    }
  });
}
