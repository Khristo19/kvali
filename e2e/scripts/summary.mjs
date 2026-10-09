// Prints a markdown summary of report-json/results.json (Playwright JSON reporter) for $GITHUB_STEP_SUMMARY.
// Usage: node scripts/summary.mjs "<heading>" [results.json]
import { existsSync, readFileSync } from "node:fs";

const heading = process.argv[2] ?? "E2E";
const file = process.argv[3] ?? "report-json/results.json";
if (!existsSync(file)) {
  console.log(`## ${heading}\n\nNo results file (${file}): the run crashed before any test finished. See the job log.\n`);
  process.exit(0);
}
const report = JSON.parse(readFileSync(file, "utf8"));

const specs = [];
const walk = (suite, trail = []) => {
  for (const s of suite.specs ?? []) specs.push({ file: suite.file ?? s.file, title: s.title, tests: s.tests ?? [] });
  for (const child of suite.suites ?? []) walk(child, trail);
};
for (const s of report.suites ?? []) walk(s);

/** Deepest failing step titles of a result (the step that actually broke). */
const failedSteps = (steps = [], out = []) => {
  for (const st of steps) {
    if (st.error) {
      const before = out.length;
      failedSteps(st.steps, out);
      if (out.length === before && !String(st.title).startsWith("Expect") && !String(st.title).includes("fixture")) out.push(st.title);
    }
  }
  return out;
};
const firstLine = (s = "") => s.replace(/\u001b\[[0-9;]*m/g, "").split("\n").find((l) => l.trim()) ?? "";

const rows = [];
const failures = [];
const warnings = [];
for (const sp of specs) {
  for (const t of sp.tests) {
    const last = t.results?.[t.results.length - 1];
    const status = t.status === "expected" ? "pass" : t.status === "flaky" ? "flaky" : t.status === "skipped" ? "skipped" : "FAIL";
    const name = `${sp.file?.replace(/^.*tests\//, "") ?? ""} [${t.projectName}] ${sp.title}`;
    const secs = ((last?.duration ?? 0) / 1000).toFixed(0);
    rows.push(`| ${status === "pass" ? "PASS" : status === "flaky" ? "FLAKY (passed on retry)" : status === "skipped" ? "skipped" : "**FAIL**"} | ${name} | ${secs}s |`);
    for (const a of t.annotations ?? []) if (a.type === "warning") warnings.push(`${sp.title}: ${a.description}`);
    if (status === "FAIL" || status === "flaky") {
      const steps = failedSteps(last?.steps ?? []);
      const err = firstLine(last?.error?.message ?? last?.errors?.[0]?.message);
      failures.push(`- **${name}**\n  - failing step: ${steps.length ? steps.join(" > ") : "(see report)"}\n  - error: \`${err.slice(0, 300)}\``);
    }
  }
}

const st = report.stats ?? {};
console.log(`## ${heading}\n`);
console.log(`Passed ${st.expected ?? 0}, failed ${st.unexpected ?? 0}, flaky ${st.flaky ?? 0}, skipped ${st.skipped ?? 0}.\n`);
console.log("| Result | Test | Time |\n|---|---|---|");
console.log(rows.join("\n"));
if (failures.length) console.log(`\n### Failing / flaky steps\n\n${failures.join("\n")}`);
if (warnings.length) console.log(`\n### Warnings (soft)\n\n${[...new Set(warnings)].map((w) => `- ${w}`).join("\n")}`);
console.log("\nFull HTML report, traces, screenshots and videos: download the artifacts of this run.\n");
