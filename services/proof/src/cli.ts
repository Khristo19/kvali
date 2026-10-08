// Command-line proof tool: spray record -> verdict -> manifest -> SHA-256.
//
//   node src/cli.ts --job samples/job-17ha.json --record samples/record-honest.json [--out manifest.json]
//
// Exit codes: 0 PASS, 1 FAIL, 2 bad input (missing file, bad JSON, bad shape, bad arguments).

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { computeVerdict } from "./verdict.ts";
import {
  buildManifest,
  jobTerms,
  manifestHash,
  sprayRecord,
  type JobFile,
  type RecordFile,
} from "./manifest.ts";

const USAGE =
  "usage: node src/cli.ts --job <job.json> --record <record.json> [--out <manifest.json>] [--upload]";

export const EXIT_PASS = 0;
export const EXIT_FAIL = 1;
export const EXIT_BAD_INPUT = 2;

/** Thrown for any input problem; the message is shown to the user without a stack trace. */
export class InputError extends Error {}

export function readJsonFile(path: string, label: string): unknown {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") throw new InputError(`${label} file not found: ${path}`);
    if (code === "EISDIR") throw new InputError(`${label} path is a directory: ${path}`);
    throw new InputError(`cannot read ${label} file ${path}: ${(err as Error).message}`);
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new InputError(`invalid JSON in ${label} file ${path}: ${(err as Error).message}`);
  }
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function requireJob(v: unknown, path: string): JobFile {
  const o = v as Record<string, unknown> | null;
  if (!o || typeof o !== "object") throw new InputError(`job file ${path} is not a JSON object`);
  for (const k of ["area_cha", "target_rate_ml_per_ha", "tolerance_bps"]) {
    if (!isNum(o[k])) throw new InputError(`job file ${path} is missing numeric field "${k}"`);
  }
  return o as JobFile;
}

function requireRecord(v: unknown, path: string): RecordFile {
  const o = v as Record<string, unknown> | null;
  if (!o || typeof o !== "object") throw new InputError(`record file ${path} is not a JSON object`);
  const totals = o.totals as Record<string, unknown> | undefined;
  if (!totals || !isNum(totals.liters_ml) || !isNum(totals.area_covered_cha)) {
    throw new InputError(
      `record file ${path} is missing totals.liters_ml or totals.area_covered_cha`,
    );
  }
  return o as RecordFile;
}

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

/** Runs the tool with the given arguments (without node and script path). Never throws. */
export function run(argv: string[]): RunResult {
  let out = "";

  const fail = (message: string): RunResult => ({
    code: EXIT_BAD_INPUT,
    stdout: out,
    stderr: `error: ${message}\n${USAGE}\n`,
  });

  let values: { job?: string; record?: string; out?: string; upload?: boolean; help?: boolean };
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        job: { type: "string" },
        record: { type: "string" },
        out: { type: "string" },
        upload: { type: "boolean" },
        help: { type: "boolean", short: "h" },
      },
      strict: true,
      allowPositionals: false,
    }));
  } catch (e) {
    return fail((e as Error).message);
  }

  if (values.help) {
    return { code: EXIT_PASS, stdout: `${USAGE}\n`, stderr: "" };
  }
  if (!values.job || !values.record) {
    return fail("--job and --record are required");
  }

  try {
    const jobPath = resolve(values.job);
    const recordPath = resolve(values.record);
    const job = requireJob(readJsonFile(jobPath, "job"), values.job);
    const record = requireRecord(readJsonFile(recordPath, "record"), values.record);

    const verdict = computeVerdict(jobTerms(job), sprayRecord(record));
    const manifest = buildManifest(job, record, verdict);
    const hash = manifestHash(manifest);

    if (record.simulated === true) {
      out += "NOTE: SIMULATED DEMO DATA. Not a real spray job.\n";
    }
    out += `job ${job.job_id ?? record.job_ref ?? "(no id)"}, record ${values.record}\n`;
    out += `${verdict.pass ? "PASS" : "FAIL"}\n`;
    for (const c of verdict.checks) {
      out += `  [${c.pass ? "pass" : "FAIL"}] ${c.name}: ${c.detail}\n`;
    }
    out += `manifest SHA-256: ${hash}\n`;

    if (values.out) {
      try {
        writeFileSync(resolve(values.out), `${JSON.stringify(manifest, null, 2)}\n`);
      } catch (e) {
        return {
          code: EXIT_BAD_INPUT,
          stdout: out,
          stderr: `error: cannot write ${values.out}: ${(e as Error).message}\n`,
        };
      }
      out += `manifest written to ${values.out}\n`;
    }

    return { code: verdict.pass ? EXIT_PASS : EXIT_FAIL, stdout: out, stderr: "" };
  } catch (e) {
    if (e instanceof InputError) return fail(e.message);
    return { code: EXIT_BAD_INPUT, stdout: out, stderr: `error: ${(e as Error).message}\n` };
  }
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMain) {
  const argv = process.argv.slice(2);
  const res = run(argv);
  if (res.stdout) process.stdout.write(res.stdout);
  if (res.stderr) process.stderr.write(res.stderr);
  process.exitCode = res.code;
  if (argv.includes("--upload") && res.code <= EXIT_FAIL) {
    try {
      const { values } = parseArgs({
        args: argv,
        options: { job: { type: "string" }, record: { type: "string" }, out: { type: "string" }, upload: { type: "boolean" }, help: { type: "boolean", short: "h" } },
      });
      const job = requireJob(readJsonFile(resolve(values.job!), "job"), values.job!);
      const record = requireRecord(readJsonFile(resolve(values.record!), "record"), values.record!);
      const manifest = buildManifest(job, record, computeVerdict(jobTerms(job), sprayRecord(record)));
      const { uploadManifest } = await import("./upload.ts");
      const up = await uploadManifest(manifest);
      process.stdout.write(
        `uploaded to Irys DEVNET (temporary, ~60 days; simulated public data)\nid: ${up.id}\nurl: ${up.url}\nsha256: ${up.sha256}\nfunded: ${up.spentLamports} lamports\n`,
      );
    } catch (e) {
      process.stderr.write(`upload failed: ${(e as Error).message}\n`);
      process.exitCode = EXIT_BAD_INPUT;
    }
  }
}
