# Kvali web demo: end-to-end tests

Playwright (chromium) tests against the live demo, https://khristo19.github.io/kvali/. They run in GitHub Actions only
(workflow `.github/workflows/e2e.yml`); do not start a browser or dev server on the laptop.

## When they run

- Automatically after every successful "Deploy web demo" run (push to `main` touching `app/**`). Note: a push that only
  changes `e2e/` does not redeploy, so run the workflow by hand.
- By hand: GitHub > Actions > "E2E (live demo)" > Run workflow (optional `base_url` input, e.g. another deployment).
- Two parallel jobs: **journey** (journey.spec.ts then refusal.spec.ts, one worker, real devnet transactions, ~8-12 min)
  and **nav** (nav.spec.ts on a 1280x900 and a 390x844 project).

## Specs

| Spec | What it covers |
|---|---|
| `journey.spec.ts` | Farmer sign-up, post job, operator sign-up and accept, simulate honest flight, send to validators, validator sign-up, approve seat A + B, auto-settle (falls back to Settle now with a warning), farmer paid-out card ($285 / $300 bond / $9 / $6), operator earnings, /job "Adds up" and at least 4 Explorer links, every tx finalized with err null (JSON-RPC), reload keeps state |
| `refusal.spec.ts` | Pump-off record refused with a reason; operator and farmer show "Reason: ..." |
| `nav.spec.ts` | Side nav / tab bar for all roles, /job "Open this demo as", /how-it-works back, Phantom "coming soon", Demo controls toggle, Sign out (all roles), signed-out views, no horizontal overflow at 390 px |

Every test fails on any console error or uncaught page error, except React #418 (hydration) and transient public-RPC
failures (429 / CORS from api.devnet.solana.com), which are recorded as a warning annotation instead.

## Reading results

1. Open the run in GitHub Actions. The **job summary** lists pass/fail per test, the failing step names and any soft warnings
   (for example "Auto-settle did not happen, fell back to Settle now").
2. Download the artifacts `e2e-journey-report` / `e2e-nav-report`: `playwright-report/index.html` (open it, steps are named
   like the journey), `test-results/` (trace.zip, screenshot, video of failed tests; `npx playwright show-trace trace.zip`),
   `report-json/results.json`.
3. Before calling a failure an app bug, check KNOWN_ISSUES.md (`docs/records/qa/`): HTTP 429 on the public devnet RPC and an
   empty demo bank (`scripts/devnet-bank.ts --topup`) are the usual non-app causes. A single retry is built in.

## Adding or changing a step

- Use the `data-testid` values (React Native `testID`) already on the controls; add a `testID` prop in `app/src` when a
  control has none (`Button` accepts `testID`; `Row`, `Card`, `Banner`, `StatusChip` too). Side nav and tab bar share the
  same ids (`nav-<tab key>`, `nav-home` for the first tab); use `visibleTid(page, id)` for those.
- Wrap new actions in `await test.step("N. Clear name", async () => { ... })` in the spec, so the report reads like the journey.
- App paths are relative to the `/kvali/` base: use `go(page, "farmer")`, never a leading slash.
- Shared flows (sign-up, post job, accept) are in `tests/helpers.ts`; chain checks in `tests/chain.ts` (`E2E_RPC_URL` overrides the RPC).

## Local checks only

```
cd e2e
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm ci
npx tsc --noEmit
```
