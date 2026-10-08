// Helper for scripts/devnet-demo.ts. Run with Node 22 (type stripping loads the .ts files in services/proof).
// usage: node scripts/demo-proof.mjs <record-sample-name>   e.g. record-honest
// Prints JSON: { verdict, manifest, hash, litersMl, areaCha, settled, upheld } (amounts as strings, USDC base units).
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const src = (f) => resolve(root, "services/proof/src", f);
const { computeVerdict } = await import(src("verdict.ts"));
const { buildManifest, jobTerms, manifestHash, sprayRecord } = await import(src("manifest.ts"));
const { computeSettlement } = await import(src("settlement.ts"));

const sample = process.argv[2];
const job = JSON.parse(readFileSync(resolve(root, "services/proof/samples/job-17ha.json"), "utf8"));
const record = JSON.parse(readFileSync(resolve(root, "services/proof/samples", sample + ".json"), "utf8"));
const verdict = computeVerdict(jobTerms(job), sprayRecord(record));
const manifest = buildManifest(job, record, verdict);
const str = (p) => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v.toString()]));
console.log(JSON.stringify({
  verdict: { pass: verdict.pass, appliedRateMlPerHa: verdict.appliedRateMlPerHa, coverageBps: verdict.coverageBps },
  manifest,
  hash: manifestHash(manifest),
  litersMl: record.totals.liters_ml,
  areaCha: record.totals.area_covered_cha,
  job: { areaCha: job.area_cha, rate: job.target_rate_ml_per_ha, tolerance: job.tolerance_bps, payment: job.payment_usdc },
  settled: str(computeSettlement(300_000_000n, 300_000_000n, "settled")),
  upheld: str(computeSettlement(300_000_000n, 300_000_000n, "challenge-upheld")),
}));
