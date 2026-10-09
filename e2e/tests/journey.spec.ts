import { test, expect } from "./fixtures";
import { expectFinalized, signatureFromHref } from "./chain";
import { go, operatorAccepts, operatorSendsRecord, signUp, tid, warn } from "./helpers";

test.describe.configure({ mode: "serial" });

test("Happy path: farmer posts, operator flies, validators approve, job settles and pays out", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "desktop only");
  let jobRef = "";

  await test.step("1. Farmer signs up (name + email) and the devnet wallet is funded", async () => {
    await signUp(page, "farmer", "E2E Farmer");
    await expect(tid(page, "wallet-note")).toContainText("funded and ready", { timeout: 180_000 });
  });

  await test.step("2. Farmer posts the job and holds $300 (real post_job tx)", async () => {
    const post = tid(page, "post-job");
    await expect(post).toBeEnabled({ timeout: 120_000 });
    await post.click();
    await expect(tid(page, "job-status-title")).toHaveText("Waiting for an operator", { timeout: 180_000 });
    jobRef = ((await tid(page, "job-id").first().textContent()) ?? "").match(/…\d{5}|\d+/)?.[0] ?? "";
    expect(jobRef, "job id (last 5 digits of the on-chain id)").toMatch(/…\d{5}/);
  });

  await test.step("3. Operator signs up, wallet + certificate set up, accepts the job (bond locked)", async () => {
    await operatorAccepts(page);
  });

  await test.step("4. Demo control: simulate an honest drone flight and send the record to the validators", async () => {
    await operatorSendsRecord(page, "honest");
  });

  await test.step("5. Validator signs up and sees the record in the queue", async () => {
    await signUp(page, "validator", "E2E Validator");
    await expect(page.getByText("Record: Honest flight")).toBeVisible({ timeout: 120_000 });
    await expect(page.getByText("Checks pass")).toBeVisible();
  });

  await test.step("6. Validator approves as seat A (operator-side)", async () => {
    await tid(page, "seat-operator-side").click();
    await tid(page, "approve").click();
    await expect(page.getByText("Approval recorded").first()).toBeVisible();
  });

  await test.step("7. Validator approves as seat B (farmer-side): proof submitted on chain", async () => {
    await tid(page, "seat-farmer-side").click();
    await expect(tid(page, "approve")).toBeEnabled();
    await tid(page, "approve").click();
    await expect(tid(page, "validator-job-banner")).toContainText("proof is on chain", { timeout: 180_000 });
  });

  await test.step("8. Challenge window closes and the job settles (auto, up to 3 min)", async () => {
    const banner = tid(page, "validator-job-banner");
    try {
      await expect(banner).toContainText("settled", { timeout: 180_000 });
    } catch {
      warn(testInfo, "Auto-settle did not happen within 3 minutes; fell back to clicking Settle now (possible RPC 429 or auto-settle regression).");
      const settle = tid(page, "settle-now");
      await expect(settle).toBeEnabled({ timeout: 120_000 });
      await settle.click();
      await expect(banner).toContainText("settled", { timeout: 180_000 });
    }
  });

  await test.step("9. Farmer sees 'Operator paid' and the payout card ($285 / $300 bond / $9 / $6)", async () => {
    await go(page, "farmer");
    await expect(tid(page, "job-status-title")).toHaveText("Operator paid", { timeout: 180_000 });
    const payout = tid(page, "payout-card");
    await expect(payout).toBeVisible();
    await expect(payout.getByText("Paid out", { exact: true })).toBeVisible();
    await expect(tid(page, "payout-operator")).toContainText("$285.00");
    await expect(tid(page, "payout-bond")).toContainText("$300.00");
    await expect(tid(page, "payout-kvali")).toContainText("$9.00");
    await expect(tid(page, "payout-validators")).toContainText("$6.00");
    await expect(tid(page, "payout-farmer")).toContainText("$0.00");
    await expect(tid(page, "job-id").first()).toContainText(jobRef);
  });

  await test.step("10. Operator sees earnings ($585 = $285 payment + $300 bond back, 1 job completed)", async () => {
    await go(page, "operator?tab=earnings");
    await expect(tid(page, "earnings-paid-out")).toContainText("$585.00", { timeout: 120_000 });
    await expect(tid(page, "earnings-completed")).toContainText("1");
    await expect(tid(page, "earnings-wallet")).toContainText("$1,285.00");
  });

  let signatures: string[] = [];
  await test.step("11. Job story: every step has an Explorer link and 'Adds up'", async () => {
    await go(page, "job");
    await expect(tid(page, "job-state")).toContainText("Released", { timeout: 120_000 });
    await expect(tid(page, "adds-up")).toContainText("Adds up", { timeout: 60_000 });
    await expect.poll(() => tid(page, "tx-link").count(), { timeout: 60_000 }).toBeGreaterThanOrEqual(4);
    const hrefs = await tid(page, "tx-link").evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).href));
    signatures = [...new Set(hrefs.map(signatureFromHref).filter((s): s is string => !!s))];
    expect(signatures.length, "distinct transaction signatures on the job story").toBeGreaterThanOrEqual(4);
    await expect(tid(page, "job-ref")).toContainText(jobRef);
  });

  await test.step("12. Every transaction is finalized on devnet with err null", async () => {
    testInfo.annotations.push({ type: "signatures", description: signatures.join(" ") });
    await expectFinalized(signatures);
  });

  await test.step("13. State survives a reload", async () => {
    await page.reload();
    await expect(tid(page, "job-state")).toContainText("Released", { timeout: 120_000 });
    await expect(tid(page, "adds-up")).toContainText("Adds up", { timeout: 60_000 });
  });
});
