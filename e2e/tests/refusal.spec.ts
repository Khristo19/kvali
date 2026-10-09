import { test, expect } from "./fixtures";
import { farmerPostsJob, go, operatorAccepts, operatorSendsRecord, signUp, tid } from "./helpers";

test.describe.configure({ mode: "serial" });

const REASON = "Spray rate out of range";

test("Refusal path: validator refuses a pump-off record, operator and farmer see the reason", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "desktop only");

  await test.step("1. Farmer signs up and posts a job", async () => {
    await farmerPostsJob(page);
  });

  await test.step("2. Operator signs up and accepts the job", async () => {
    await operatorAccepts(page);
  });

  await test.step("3. Demo control: simulate 'Pump off' and send the record to the validators", async () => {
    await operatorSendsRecord(page, "pumpOff");
  });

  await test.step("4. Validator signs up, sees failing checks and refuses with a reason", async () => {
    await signUp(page, "validator", "E2E Validator");
    await expect(page.getByText("Record: Pump off")).toBeVisible({ timeout: 120_000 });
    await expect(page.getByText("Checks fail")).toBeVisible();
    await expect(tid(page, "approve")).toBeDisabled();
    await tid(page, "refuse-open").click();
    await tid(page, "refuse-reason").fill(REASON);
    await tid(page, "refuse-send").click();
    await expect(tid(page, "refusal-text")).toContainText(`Reason: ${REASON}`);
  });

  await test.step("5. Operator sees the refusal reason and the job stays Accepted", async () => {
    await go(page, "operator");
    await expect(tid(page, "refusal-banner")).toContainText(`Reason: ${REASON}`, { timeout: 120_000 });
    await expect(tid(page, "send-record")).toBeVisible();
  });

  await test.step("6. Farmer sees the refusal reason and the job stays open", async () => {
    await go(page, "farmer");
    await expect(tid(page, "refusal-banner")).toContainText(`Reason: ${REASON}`, { timeout: 120_000 });
    await expect(tid(page, "job-status-title")).toHaveText("Operator accepted");
  });
});
