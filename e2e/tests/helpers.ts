import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";

export type Role = "farmer" | "operator" | "validator";

const ROLE_PATH: Record<Role, string> = { farmer: "farmer", operator: "operator", validator: "validator" };

/** Open an app path relative to baseURL (which carries the /kvali/ prefix, so never use a leading slash). */
export async function go(page: Page, path: string) {
  await page.goto(path.replace(/^\/+/, ""), { waitUntil: "domcontentloaded" });
}

export const tid = (page: Page, id: string): Locator => page.getByTestId(id);

/** Visible copy of a control that exists twice in the DOM (side nav + bottom tab bar share testIDs; CSS hides one). */
export const visibleTid = (page: Page, id: string): Locator => page.locator(`[data-testid="${id}"]:visible`).first();

export function uniqueEmail(role: Role) {
  return `e2e-${role}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@example.com`;
}

/** Home -> pick role -> Continue with email -> fill name/email -> create account. Lands on the role page. */
export async function signUp(page: Page, role: Role, name: string) {
  await go(page, "/");
  await tid(page, `role-${role}`).click();
  await expect(tid(page, `role-${role}`)).toHaveAttribute("aria-checked", "true");
  await tid(page, "continue-email").click();
  await tid(page, "signup-name").fill(name);
  await tid(page, "signup-email").fill(uniqueEmail(role));
  await tid(page, "signup-submit").click();
  await expect(page).toHaveURL(new RegExp(`/${ROLE_PATH[role]}(\\?|$|/)`));
  await expect(tid(page, "account-name").first()).toHaveText(name);
}

/** Farmer/operator sign-up creates a burner wallet funded by the demo bank; wait for the "funded and ready" toast. */
export async function waitForWallet(page: Page) {
  await expect(tid(page, "wallet-note")).toContainText("funded and ready", { timeout: 180_000 });
}

/** Sign up as a farmer, wait for the wallet, post the first listed field as a $300 job. Returns the job ref ("…12345"). */
export async function farmerPostsJob(page: Page): Promise<string> {
  await signUp(page, "farmer", "E2E Farmer");
  await waitForWallet(page);
  const post = tid(page, "post-job");
  await expect(post).toBeEnabled({ timeout: 120_000 });
  await post.click();
  await expect(tid(page, "job-status-title")).toHaveText("Waiting for an operator", { timeout: 180_000 });
  return await readJobRef(page);
}

/** The job id shown in the farmer "Job" row, e.g. "…97622". */
export async function readJobRef(page: Page): Promise<string> {
  const text = (await tid(page, "job-id").first().textContent({ timeout: 60_000 })) ?? "";
  const m = text.match(/…\d{5}|\b\d+\b/);
  return m ? m[0] : text.trim();
}

export async function operatorAccepts(page: Page) {
  await signUp(page, "operator", "E2E Operator");
  await waitForWallet(page);
  const accept = tid(page, "accept-job").first();
  await expect(accept).toBeVisible({ timeout: 180_000 });
  await expect(accept).toBeEnabled({ timeout: 60_000 });
  await accept.click();
  await expect(tid(page, "simulate-flight")).toBeVisible({ timeout: 180_000 });
}

export async function operatorSendsRecord(page: Page, key: "honest" | "pumpOff" | "halfField" | "tankMismatch") {
  await tid(page, `record-${key}`).click();
  await expect(tid(page, `record-${key}`)).toContainText("(selected)");
  await tid(page, "send-record").click();
  await expect(tid(page, "record-pending-banner")).toContainText("Waiting for validators");
}

export function warn(testInfo: TestInfo, description: string) {
  testInfo.annotations.push({ type: "warning", description });
  console.warn(`WARNING: ${description}`);
}
