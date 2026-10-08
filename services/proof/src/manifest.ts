// Builds the proof manifest from a job, a spray record and a verdict, and
// hashes it. Output is deterministic: no timestamps are generated here, the
// createdAt value is copied from the record.

import { createHash } from "node:crypto";
import type { JobTerms, SprayRecord, Verdict } from "./verdict.ts";

/** Raw job file shape (samples/job-17ha.json). */
export interface JobFile {
  job_id?: string;
  field_ref?: string;
  field_hash?: string;
  area_cha: number;
  target_rate_ml_per_ha: number;
  tolerance_bps: number;
  [key: string]: unknown;
}

/** Raw record file shape (samples/record-*.json). */
export interface RecordFile {
  simulated?: boolean;
  job?: string;
  job_ref?: string;
  field_hash?: string;
  operator?: string;
  drone?: { model?: string; serial_hash?: string; [key: string]: unknown };
  totals: { liters_ml: number; area_covered_cha: number };
  tank?: { kg_before?: number; kg_after?: number; mix_density_kg_per_l?: number };
  created_at?: string;
  [key: string]: unknown;
}

export interface Manifest {
  version: 1;
  simulated: unknown;
  job_id: string | null;
  field_hash: string | null;
  operator?: string;
  drone?: { model?: string; serial_hash?: string };
  verdict: {
    pass: boolean;
    applied_rate_ml_per_ha: number;
    coverage_bps: number;
    checks: Array<{ name: string; pass: boolean; detail: string }>;
  };
  totals: { liters_ml: number; area_covered_cha: number };
  created_at: string | null;
}

/** Maps a job file onto the JobTerms that computeVerdict expects. */
export function jobTerms(job: JobFile): JobTerms {
  return {
    areaCha: job.area_cha,
    targetRateMlPerHa: job.target_rate_ml_per_ha,
    toleranceBps: job.tolerance_bps,
  };
}

/** Maps a record file onto the SprayRecord that computeVerdict expects. */
export function sprayRecord(rec: RecordFile): SprayRecord {
  return {
    litersMl: rec.totals.liters_ml,
    areaCoveredCha: rec.totals.area_covered_cha,
    tankKgBefore: rec.tank?.kg_before,
    tankKgAfter: rec.tank?.kg_after,
    mixDensityKgPerL: rec.tank?.mix_density_kg_per_l,
  };
}

export function buildManifest(job: JobFile, record: RecordFile, verdict: Verdict): Manifest {
  const manifest: Manifest = {
    version: 1,
    simulated: record.simulated,
    job_id: job.job_id ?? record.job_ref ?? null,
    field_hash: job.field_hash ?? record.field_hash ?? null,
    verdict: {
      pass: verdict.pass,
      applied_rate_ml_per_ha: verdict.appliedRateMlPerHa,
      coverage_bps: verdict.coverageBps,
      checks: verdict.checks.map((c) => ({ name: c.name, pass: c.pass, detail: c.detail })),
    },
    totals: {
      liters_ml: record.totals.liters_ml,
      area_covered_cha: record.totals.area_covered_cha,
    },
    created_at: record.created_at ?? null,
  };
  if (record.operator !== undefined) manifest.operator = record.operator;
  if (record.drone !== undefined) {
    manifest.drone = { model: record.drone.model, serial_hash: record.drone.serial_hash };
  }
  return manifest;
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      out[key] = sortKeys((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

/** JSON with object keys sorted recursively and no whitespace. */
export function canonicalJson(obj: unknown): string {
  return JSON.stringify(sortKeys(obj));
}

export function sha256Hex(str: string): string {
  return createHash("sha256").update(str, "utf8").digest("hex");
}

export function manifestHash(manifest: unknown): string {
  return sha256Hex(canonicalJson(manifest));
}
