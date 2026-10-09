import { test, expect } from "./fixtures";
import { farmerPostsJob, go, operatorAccepts, operatorSendsRecord, signUp, tid } from "./helpers";

test.describe.configure({ mode: "serial" });

// The bots give the failed check and its numbers (services/proof verdict): the pump-off record fails the spray-rate check.
const REASON = "rate:";

test("Refusal path: bots refuse a pump-off record, operator and farmer see the reason, nothing is paid", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "desktop only");

  await test.step("1. Farmer signs up and posts a job", async () => {
    await farmerPostsJob(page);
  });

  await test.step("2. Operator signs up and accepts the job", async () => {
    await operatorAccepts(page);
  });

  await test.step("3. Demo control: simulate 'Pump off' and send the record: the bots refuse it at once", async () => {
    await operatorSendsRecord(page, "pumpOff");
    await expect(tid(page, "refusal-banner")).toContainText("Bots refused", { timeout: 120_000 });
  });

  await test.step("4. Validator sign-up: Bot verdicts show the failed checks, nothing was signed", async () => {
    await signUp(page, "validator", "E2E Validator");
    await expect(tid(page, "bot-verdicts")).toBeVisible({ timeout: 120_000 });
    await expect(page.getByText("Record: Pump off").first()).toBeVisible();
    await expect(tid(page, "bot-outcome")).toContainText("Refused", { timeout: 60_000 });
    await expect(tid(page, "bot-outcome")).toContainText("Nothing was signed and nothing was paid");
    await expect(tid(page, "bot-tx-link")).toHaveCount(0);
    await expect(tid(page, "approve")).toHaveCount(0);
  });

  await test.step("5. Operator sees the refusal reason and the job stays Accepted", async () => {
    await go(page, "operator");
    await expect(tid(page, "refusal-banner")).toContainText(REASON, { timeout: 120_000 });
    await expect(tid(page, "send-record")).toBeVisible();
  });

  await test.step("6. Farmer sees the refusal reason, nothing is paid, and the job stays open", async () => {
    await go(page, "farmer");
    await expect(tid(page, "refusal-banner")).toContainText(REASON, { timeout: 120_000 });
    await expect(tid(page, "job-status-title")).toHaveText("Operator accepted");
  });
});
