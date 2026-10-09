import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { go, isStaging, lsKey, tid, waitForWallet, type Role } from "./helpers";

// Staging only: several accounts per role in one browser + the STAGING marker. Skipped on the live site (single-account experience).
test.describe.configure({ mode: "serial" });

test.beforeEach(({}, testInfo) => {
  test.skip(!isStaging(testInfo.project.use.baseURL), "staging site only");
});

async function seed(page: Page, baseURL: string | undefined, roles: Role[]) {
  await page.addInitScript(
    ([key, list]) => {
      if (sessionStorage.getItem("seeded")) return; // seed once: a reload (account switch) must keep what the app saved
      sessionStorage.setItem("seeded", "1");
      const acc: Record<string, unknown> = {};
      for (const r of list) acc[r] = { name: `Switch ${r}`, email: `switch-${r}@example.com`, role: r };
      acc.last = list[0];
      localStorage.setItem(key as string, JSON.stringify(acc));
    },
    [lsKey(baseURL, "kvali.accounts.v2"), roles] as const,
  );
}

/** The chip's second line: "Farmer 2 · 4abc...wxyz". */
const chipSub = (page: Page) => tid(page, "account-name").first().locator("xpath=following-sibling::*[1]");

test("Staging: marker is shown and no live keys are written", async ({ page, baseURL }) => {
  await seed(page, baseURL, ["farmer"]);
  await go(page, "farmer");
  await expect(tid(page, "staging-badge")).toBeVisible();
  await expect(tid(page, "page-title")).toBeVisible();
  const keys = await page.evaluate(() => Object.keys(localStorage));
  expect(keys.filter((k) => k.startsWith("kvali.")), "staging must only use stg.* keys").toEqual([]);
});

test("Staging: farmer accounts - add a second burner, switch back and forth", async ({ page, baseURL }) => {
  test.setTimeout(8 * 60_000);
  await seed(page, baseURL, ["farmer"]);
  await go(page, "farmer");
  await expect(tid(page, "acct-switch")).toHaveText(/Farmer 1/, { timeout: 60_000 });
  const sub1 = (await chipSub(page).textContent()) ?? "";
  expect(sub1).toContain("Farmer 1");

  await tid(page, "acct-switch").click();
  await tid(page, "acct-add").click(); // new burner, the page reloads
  await expect(tid(page, "acct-switch")).toHaveText(/Farmer 2/, { timeout: 60_000 });
  const sub2 = (await chipSub(page).textContent()) ?? "";
  expect(sub2).toContain("Farmer 2");
  expect(sub2.split("·")[1]).not.toEqual(sub1.split("·")[1]);
  await waitForWallet(page); // funded by the demo bank like the normal burner flow

  await tid(page, "acct-switch").click();
  await tid(page, "acct-option-f1").click();
  await expect(tid(page, "acct-switch")).toHaveText(/Farmer 1/, { timeout: 60_000 });
  await expect(chipSub(page)).toHaveText(sub1);
  // The list is persisted: both accounts are still there after a reload.
  await page.reload();
  await tid(page, "acct-switch").click();
  await expect(tid(page, "acct-option-f2")).toBeVisible({ timeout: 30_000 });
});

test("Staging: validator seat is picked in the switcher and survives a reload", async ({ page, baseURL }) => {
  await seed(page, baseURL, ["validator"]);
  await go(page, "validator");
  await expect(tid(page, "acct-switch")).toBeVisible({ timeout: 60_000 });
  await tid(page, "acct-switch").click();
  await tid(page, "acct-option-farmer-side").click();
  await expect(tid(page, "acct-switch")).toHaveText(/farmer-side seat/);
  await page.reload();
  await expect(tid(page, "acct-switch")).toHaveText(/farmer-side seat/, { timeout: 60_000 });
  await expect(tid(page, "seat-farmer-side")).toHaveAttribute("aria-checked", "true", { timeout: 60_000 });
});
