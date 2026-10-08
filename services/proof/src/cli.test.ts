import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const proofDir = fileURLToPath(new URL("../", import.meta.url));
const cli = fileURLToPath(new URL("./cli.ts", import.meta.url));
const sample = (name: string) => join(proofDir, "samples", name);

function runCli(args: string[]) {
  const r = spawnSync(process.execPath, [cli, ...args], { cwd: proofDir, encoding: "utf8" });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

const tmp = mkdtempSync(join(tmpdir(), "kvali-proof-cli-"));
process.on("exit", () => rmSync(tmp, { recursive: true, force: true }));

test("honest record exits 0 and prints PASS and a 64-char hash", () => {
  const r = runCli(["--job", sample("job-17ha.json"), "--record", sample("record-honest.json")]);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /^(NOTE:.*\n)?job SIM-KAKHETI-0017.*\nPASS\n/m);
  assert.match(r.stdout, /SHA-256: [0-9a-f]{64}/);
});

for (const [file, check] of [
  ["record-pump-off.json", "rate"],
  ["record-half-field.json", "coverage"],
  ["record-tank-mismatch.json", "tank-crosscheck"],
] as const) {
  test(`${file} exits 1 and reports FAIL on ${check}`, () => {
    const r = runCli(["--job", sample("job-17ha.json"), "--record", sample(file)]);
    assert.equal(r.code, 1, r.stderr);
    assert.match(r.stdout, /\nFAIL\n/);
    assert.match(r.stdout, new RegExp(`\\[FAIL\\] ${check}:`));
  });
}

test("--out writes the manifest JSON even on FAIL", () => {
  const out = join(tmp, "manifest-pump-off.json");
  const r = runCli(["--job", sample("job-17ha.json"), "--record", sample("record-pump-off.json"), "--out", out]);
  assert.equal(r.code, 1);
  const m = JSON.parse(readFileSync(out, "utf8"));
  assert.equal(m.verdict.pass, false);
  assert.equal(m.version, 1);
});

test("--out with PASS writes the same hash the summary prints", () => {
  const out = join(tmp, "manifest-honest.json");
  const r = runCli(["--job", sample("job-17ha.json"), "--record", sample("record-honest.json"), "--out", out]);
  assert.equal(r.code, 0);
  const printed = /SHA-256: ([0-9a-f]{64})/.exec(r.stdout)?.[1];
  assert.ok(printed);
  const again = runCli(["--job", sample("job-17ha.json"), "--record", sample("record-honest.json")]);
  assert.equal(/SHA-256: ([0-9a-f]{64})/.exec(again.stdout)?.[1], printed);
});

test("missing file exits 2 with a clear message and no stack trace", () => {
  const r = runCli(["--job", sample("job-17ha.json"), "--record", join(tmp, "nope.json")]);
  assert.equal(r.code, 2);
  assert.match(r.stderr, /record file not found/);
  assert.doesNotMatch(r.stderr, /\n\s+at /);
});

test("bad JSON exits 2 with a clear message and no stack trace", () => {
  const bad = join(tmp, "bad.json");
  writeFileSync(bad, "{ not json");
  const r = runCli(["--job", bad, "--record", sample("record-honest.json")]);
  assert.equal(r.code, 2);
  assert.match(r.stderr, /invalid JSON in job file/);
  assert.doesNotMatch(r.stderr, /\n\s+at /);
});

test("wrong shape exits 2", () => {
  const wrong = join(tmp, "wrong.json");
  writeFileSync(wrong, JSON.stringify({ hello: 1 }));
  const r = runCli(["--job", sample("job-17ha.json"), "--record", wrong]);
  assert.equal(r.code, 2);
  assert.match(r.stderr, /missing totals/);
});

test("missing arguments and unknown flags exit 2 with usage", () => {
  const none = runCli([]);
  assert.equal(none.code, 2);
  assert.match(none.stderr, /usage:/);
  const unknown = runCli(["--bogus"]);
  assert.equal(unknown.code, 2);
  assert.match(unknown.stderr, /usage:/);
  assert.doesNotMatch(unknown.stderr, /\n\s+at /);
});
