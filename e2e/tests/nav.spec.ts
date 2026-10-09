import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { go, tid, visibleTid, type Role } from "./helpers";

test.describe.configure({ mode: "parallel" });

const ACCOUNTS_KEY = "kvali.accounts.v2";

/** Titles shown in the page header per role/tab. Signed-out operators always see "Jobs near you". */
const TABS: Record<Role, { key: string; label: string; title: string; signedOutTitle?: string }[]> = {
  farmer: [
    { key: "", label: "My jobs", title: "My jobs" },
    { key: "post", label: "Post a job", title: "Post a job" },
    { key: "payments", label: "Payments", title: "Payments" },
    { key: "help", label: "Help", title: "Help" },
  ],
  operator: [
    { key: "", label: "Jobs", title: "Jobs near you" },
    { key: "mine", label: "My jobs", title: "My jobs", signedOutTitle: "Jobs near you" },
    { key: "earnings", label: "Earnings", title: "Earnings", signedOutTitle: "Jobs near you" },
    { key: "drones", label: "Drones", title: "My drones", signedOutTitle: "Jobs near you" },
  ],
  validator: [
    { key: "", label: "Queue", title: "Proof review" },
    { key: "reviewed", label: "Reviewed", title: "Reviewed" },
    { key: "earnings", label: "Earnings", title: "Earnings" },
    { key: "profile", label: "Profile", title: "Profile" },
  ],
};
const ROLES: Role[] = ["farmer", "operator", "validator"];
const isMobile = (page: Page) => (page.viewportSize()?.width ?? 1280) < 900;

/** Pre-seed demo accounts (the app only reads localStorage) so no devnet wallet has to be funded for layout tests. */
async function seedAccounts(page: Page, roles: Role[]) {
  await page.addInitScript(
    ([key, list]) => {
      const acc: Record<string, unknown> = {};
      for (const r of list) acc[r] = { name: `Nav ${r}`, email: `nav-${r}@example.com`, role: r };
      acc.last = list[0];
      try {
        localStorage.setItem(key as string, JSON.stringify(acc));
      } catch {
        /* ignore */
      }
    },
    [ACCOUNTS_KEY, roles] as const,
  );
}

async function expectNoHorizontalOverflow(page: Page) {
  const m = await page.evaluate(() => ({ sw: document.scrollingElement?.scrollWidth ?? 0, iw: window.innerWidth }));
  expect(m.sw, `scrollWidth ${m.sw} vs innerWidth ${m.iw}`).toBeLessThanOrEqual(m.iw);
}

for (const role of ROLES) {
  test(`Nav: ${role} side nav / tab bar routes every item to the right tab and title (signed out)`, async ({ page }) => {
    await go(page, role);
    await expect(tid(page, "page-title")).toBeVisible();
    // The right navigation is the visible one: tab bar on phones, side nav on desktop.
    await expect(page.locator(isMobile(page) ? "[data-kv=tabbar]" : "[data-kv=side]")).toBeVisible();
    // Visit non-home tabs first, then go back home (clicking the active tab is a no-op by design).
    const order = [...TABS[role].filter((t) => t.key !== ""), ...TABS[role].filter((t) => t.key === "")];
    for (const t of order) {
      await test.step(`${role}: ${t.label}`, async () => {
        await visibleTid(page, `nav-${t.key || "home"}`).click();
        if (t.key) await expect(page).toHaveURL(new RegExp(`/${role}\\?tab=${t.key}$`));
        else await expect(page).toHaveURL(new RegExp(`/${role}/?$`));
        await expect(tid(page, "page-title")).toHaveText(t.signedOutTitle ?? t.title);
        await expect(visibleTid(page, `nav-${t.key || "home"}`)).toHaveAttribute("aria-selected", "true");
      });
    }
  });

  test(`Nav: signed-out ${role} page shows sign-up and no balances`, async ({ page }) => {
    await go(page, role);
    await expect(tid(page, "chip-signup")).toBeVisible();
    if (role !== "validator") await expect(tid(page, "signup-card")).toBeVisible({ timeout: 90_000 });
    else await expect(page.getByText("No job to check yet").or(page.getByText("Nothing to check right now")).first()).toBeVisible({ timeout: 90_000 });
    await expect(tid(page, "operator-wallet")).toHaveCount(0);
    await expect(tid(page, "payout-card")).toHaveCount(0);
    await expect(tid(page, "account-name")).toHaveCount(0);
    await expect(page.getByText(/Farmer USDC|Operator USDC|Your wallet/)).toHaveCount(0);
    await expect(page.getByText("$1,000.00")).toHaveCount(0);
  });

  test(`Nav: Sign out (all roles) from the ${role} page returns home`, async ({ page }) => {
    await seedAccounts(page, ROLES);
    await go(page, role);
    await expect(tid(page, "account-name").first()).toHaveText(`Nav ${role}`, { timeout: 60_000 });
    await visibleTid(page, "signout-all").click();
    await expect(tid(page, "continue-email")).toBeVisible();
    await expect(tid(page, "signed-in-box")).toHaveCount(0);
    const stored = await page.evaluate((k) => localStorage.getItem(k), ACCOUNTS_KEY);
    expect(stored === null || !/"(farmer|operator|validator)":\{/.test(stored), "accounts cleared").toBe(true);
  });
}

test("Nav: /job 'Open this demo as' buttons open the right page", async ({ page }) => {
  const targets: [string, RegExp][] = [
    ["job-open-farmer", /\/farmer\/?$/],
    ["job-open-operator", /\/operator\/?$/],
    ["job-open-validator", /\/validator\/?$/],
  ];
  for (const [id, url] of targets) {
    await test.step(`Open this demo as: ${id.replace("job-open-", "")}`, async () => {
      await go(page, "job");
      await tid(page, id).click();
      await expect(page).toHaveURL(url);
    });
  }
  await test.step("Open this demo as: Home", async () => {
    await go(page, "job");
    await tid(page, "job-open-home").click();
    await expect(tid(page, "continue-email")).toBeVisible();
  });
});

test("Nav: /how-it-works back button returns home", async ({ page }) => {
  await go(page, "/");
  await tid(page, "link-how-it-works").click();
  await expect(page).toHaveURL(/\/how-it-works\/?$/);
  await tid(page, "back").click();
  await expect(tid(page, "continue-email")).toBeVisible();
});

test("Nav: Connect Phantom says 'coming soon' and does not navigate", async ({ page }) => {
  await go(page, "/");
  const before = page.url();
  await tid(page, "connect-phantom").click();
  await expect(tid(page, "phantom-soon")).toContainText("Coming soon");
  await expect(tid(page, "connect-phantom")).toContainText("coming soon");
  expect(page.url()).toBe(before);
});

test("Nav: Demo controls toggle opens and closes", async ({ page }) => {
  await seedAccounts(page, ["farmer"]);
  await go(page, "farmer");
  const toggle = tid(page, "demo-controls-toggle");
  await expect(toggle).toBeVisible({ timeout: 90_000 });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(tid(page, "demo-accept")).toHaveCount(0);
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(tid(page, "demo-accept")).toBeVisible();
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(tid(page, "demo-accept")).toHaveCount(0);
});

test("Layout: no horizontal overflow at 390 px on every page", async ({ page }) => {
  test.skip(!isMobile(page), "phone width only");
  const paths = [
    "/", "farmer", "farmer?tab=post", "farmer?tab=payments", "farmer?tab=help",
    "operator", "operator?tab=mine", "operator?tab=earnings", "operator?tab=drones",
    "validator", "validator?tab=reviewed", "validator?tab=earnings", "validator?tab=profile",
    "job", "how-it-works",
  ];
  for (const p of paths) {
    await test.step(`390 px: ${p}`, async () => {
      await go(page, p);
      await page.waitForLoadState("load");
      await expect(page.locator("body")).toBeVisible();
      await page.waitForTimeout(1_500); // let the chain gate / cards render before measuring
      await expectNoHorizontalOverflow(page);
    });
  }
});

// Z1/Z2: a direct URL load must show real content, never sit on the "Reading ..." placeholder.
for (const path of ["validator", "job", "farmer", "operator"] as const) {
  test(`Nav: direct load of /${path} leaves the loading placeholder within 20 s`, async ({ page }) => {
    await go(page, path);
    await expect(tid(page, "page-title")).toBeVisible({ timeout: 20_000 });
    await expect(tid(page, "chain-gate")).toHaveCount(0, { timeout: 20_000 });
  });
}
