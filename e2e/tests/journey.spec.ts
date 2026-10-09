import { test, expect } from "./fixtures";
import { expectFinalized, signatureFromHref } from "./chain";
import { go, lsKey, operatorAccepts, operatorSendsRecord, signUp, tid, warn } from "./helpers";

test.describe.configure({ mode: "serial" });

// Full-page screenshots of the real run, kept as the "e2e-shots" artifact (used for progress posts and the demo video).
async function shot(page: import("@playwright/test").Page, name: string) {
  await page.waitForTimeout(800);
  await page.screenshot({ path: `shots/${name}.png`, fullPage: true }).catch(() => undefined);
}

test("Happy path: farmer posts, operator flies, the bots co-sign by themselves, job settles and pays out", async ({ page, baseURL }, testInfo) => {
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
    await shot(page, "01-farmer-job-posted");
  });

  await test.step("3. Operator signs up, wallet + certificate set up, accepts the job (bond locked)", async () => {
    await operatorAccepts(page);
    await shot(page, "02-operator-accepted");
  });

  await test.step("4. Demo control: simulate an honest drone flight and send the record (the bots take it from here)", async () => {
    await operatorSendsRecord(page, "honest");
    // No validator click: the flight card goes away once the bots' co-signed proof is on chain.
    await expect(tid(page, "simulate-flight")).toBeHidden({ timeout: 240_000 });
    await shot(page, "03-operator-flight-sent");
  });

  let botSigs: string[] = [];
  await test.step("5. Validator page: the bots checked the record and co-signed, no human click", async () => {
    await signUp(page, "validator", "E2E Validator");
    await expect(tid(page, "bot-verdicts")).toBeVisible({ timeout: 120_000 });
    await expect(page.getByText("Record: Honest flight").first()).toBeVisible({ timeout: 120_000 });
    await expect(tid(page, "bot-outcome")).toContainText("All checks pass", { timeout: 180_000 });
    await expect(tid(page, "bot-outcome")).toContainText("2 of 3 bots co-signed");
    await expect(tid(page, "validator-job-banner")).toContainText("proof is on chain", { timeout: 180_000 });
    await expect(tid(page, "approve")).toHaveCount(0);
    const hrefs = await tid(page, "bot-tx-link").evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).href));
    botSigs = [...new Set(hrefs.map(signatureFromHref).filter((s): s is string => !!s))];
    expect(botSigs.length, "co-sign transaction link(s) on the bot verdicts").toBeGreaterThanOrEqual(1);
    await shot(page, "04-validator-bot-verdicts");
  });

  await test.step("6. Co-sign transactions are finalized with err null", async () => {
    await expectFinalized(botSigs);
  });

  await test.step("7. Stake card: every seat shows its stake as active; the co-signers have an open co-sign", async () => {
    for (const seat of ["operator-side", "farmer-side", "neutral"]) {
      await expect(tid(page, `stake-status-${seat}`)).toHaveText("active", { timeout: 60_000 });
      const amount = (await tid(page, `stake-amount-${seat}`).textContent()) ?? "";
      expect(Number(amount.replace(/[$,]/g, "")), `${seat} stake ${amount}`).toBeGreaterThanOrEqual(500);
      await expect(tid(page, `request-unstake-${seat}`)).toBeDisabled();
      await expect(tid(page, `withdraw-${seat}`)).toBeDisabled();
    }
    testInfo.annotations.push({ type: "stake-min", description: ((await tid(page, "stake-min").textContent()) ?? "").slice(0, 80) });
    await shot(page, "05-validator-stake-card");
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
    await shot(page, "06-farmer-paid");
  });

  await test.step("10. Operator sees earnings ($585 = $285 payment + $300 bond back, 1 job completed)", async () => {
    await go(page, "operator?tab=earnings");
    await expect(tid(page, "earnings-paid-out")).toContainText("$585.00", { timeout: 120_000 });
    await expect(tid(page, "earnings-completed")).toContainText("1");
    await expect(tid(page, "earnings-wallet")).toContainText("$1,285.00");
    await shot(page, "07-operator-earnings");
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
    await shot(page, "08-job-story");
  });

  await test.step("12. Every transaction is finalized on devnet with err null", async () => {
    testInfo.annotations.push({ type: "signatures", description: signatures.join(" ") });
    await expectFinalized(signatures);
  });

  await test.step("12b. After settle the app freed the co-signers' stake locks (release_cosign)", async () => {
    const key = lsKey(baseURL, "kvali.session.v1");
    await expect
      .poll(async () => page.evaluate((k) => Object.keys((JSON.parse(localStorage.getItem(k) ?? "{}").released ?? {}) as object).length, key), { timeout: 180_000, intervals: [3000] })
      .toBeGreaterThanOrEqual(2);
    const released = await page.evaluate((k) => Object.values(JSON.parse(localStorage.getItem(k) ?? "{}").released ?? {}) as string[], key);
    await expectFinalized(released);
    await go(page, "validator");
    for (const seat of ["operator-side", "neutral"]) await expect(tid(page, `stake-cosigned-${seat}`)).toContainText(/Proofs co-signed: [1-9]/, { timeout: 60_000 });
  });

  await test.step("13. State survives a reload", async () => {
    await page.reload();
    await expect(tid(page, "job-state")).toContainText("Released", { timeout: 120_000 });
    await expect(tid(page, "adds-up")).toContainText("Adds up", { timeout: 60_000 });
    await page.setViewportSize({ width: 390, height: 844 });
    await shot(page, "09-phone-job-story");
    await go(page, "farmer");
    await shot(page, "10-phone-farmer");
  });
});
