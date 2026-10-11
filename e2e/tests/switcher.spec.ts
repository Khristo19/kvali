import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { go, isStaging, lsKey, tid, waitForWallet, type Role } from "./helpers";

// Staging only: presenter mode (?present=1) with several accounts per role in one browser + the STAGING marker. Skipped on the live site (single-account experience).
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

/** The presenter drawer (opened from the floating button; it stays open across the reload an account switch does). */
const drawer = (page: Page) => tid(page, "presenter-drawer");
async function openDrawer(page: Page) {
  if (await drawer(page).isVisible()) return;
  await tid(page, "presenter-open").click();
  await expect(drawer(page)).toBeVisible();
}

test("Staging: presenter mode is off without ?present=1", async ({ page, baseURL }) => {
  await seed(page, baseURL, ["farmer"]);
  await go(page, "farmer");
  await expect(tid(page, "page-title")).toBeVisible();
  await expect(tid(page, "presenter-open")).toHaveCount(0);
});

test("Staging: farmer accounts - add a second burner, switch back and forth (presenter drawer)", async ({ page, baseURL }) => {
  test.setTimeout(8 * 60_000);
  await seed(page, baseURL, ["farmer"]);
  await go(page, "farmer?present=1");
  await expect(chipSub(page)).toContainText("Farmer 1", { timeout: 60_000 });
  const sub1 = (await chipSub(page).textContent()) ?? "";

  await openDrawer(page);
  await tid(page, "acct-add-farmer").click(); // new burner, the page reloads
  await expect(chipSub(page)).toContainText("Farmer 2", { timeout: 60_000 });
  const sub2 = (await chipSub(page).textContent()) ?? "";
  expect(sub2.split("·")[1]).not.toEqual(sub1.split("·")[1]);
  await waitForWallet(page); // funded by the demo bank like the normal burner flow

  await openDrawer(page);
  await tid(page, "acct-option-f1").click();
  await expect(chipSub(page)).toHaveText(sub1, { timeout: 60_000 });
  // The list is persisted: both accounts are still there after a reload.
  await page.reload();
  await openDrawer(page);
  await expect(tid(page, "acct-option-f2")).toBeVisible({ timeout: 30_000 });
});

test("Staging: validator seat is picked in the presenter drawer and survives a reload", async ({ page, baseURL }) => {
  await seed(page, baseURL, ["validator"]);
  await go(page, "validator?present=1");
  await expect(tid(page, "account-name").first()).toBeVisible({ timeout: 60_000 });
  await openDrawer(page);
  await drawer(page).getByTestId("seat-farmer-side").click();
  await expect(chipSub(page)).toContainText("farmer-side seat");
  await page.reload();
  await expect(chipSub(page)).toContainText("farmer-side seat", { timeout: 60_000 });
  await openDrawer(page);
  await expect(drawer(page).getByTestId("seat-farmer-side")).toHaveAttribute("aria-checked", "true", { timeout: 60_000 });
});
