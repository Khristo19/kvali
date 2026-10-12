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
  // With the email code on (Privy), sign up with the Privy test account: fixed email + fixed code (repo secrets).
  await tid(page, "signup-email").fill(process.env.E2E_PRIVY_EMAIL || uniqueEmail(role));
  await tid(page, "signup-submit").click();
  await enterEmailCode(page);
  await expect(page).toHaveURL(new RegExp(`/${ROLE_PATH[role]}(\\?|$|/)`));
  await expect(tid(page, "account-name").first()).toHaveText(name);
}

/**
 * After "Send code": if the code field shows up (Privy is on), type the test account's code and confirm.
 * Returns at once when the form closes instead (Privy off, or this browser already verified that email).
 */
export async function enterEmailCode(page: Page) {
  const codeField = tid(page, "signup-code");
  const shown = await Promise.race([
    codeField.waitFor({ state: "visible", timeout: 10_000 }).then(() => true),
    tid(page, "signup-form").waitFor({ state: "detached", timeout: 10_000 }).then(() => false),
  ]).catch(() => false);
  if (!shown) return;
  const email = process.env.E2E_PRIVY_EMAIL;
  const code = process.env.E2E_PRIVY_CODE;
  if (!email || !code) {
    throw new Error("Sign-up asks for an email code, but E2E_PRIVY_EMAIL / E2E_PRIVY_CODE are not set (Privy test account; repo secrets).");
  }
  await codeField.fill(code);
  await tid(page, "signup-submit").click();
}

/** Farmer/operator sign-up creates a burner wallet funded by the demo bank; wait for the "funded and ready" toast. */
export async function waitForWallet(page: Page) {
  await expect(tid(page, "wallet-note")).toContainText("funded and ready", { timeout: 180_000 });
}

/** Sign up as a farmer, wait for the wallet, post the selected (first) field as a $300 job with the default date (tomorrow). Returns the job ref ("…12345"). */
export async function farmerPostsJob(page: Page): Promise<string> {
  await signUp(page, "farmer", "E2E Farmer");
  await waitForWallet(page);
  const post = tid(page, "post-job");
  await expect(post).toBeEnabled({ timeout: 120_000 });
  await expect(tid(page, "wanted-by")).not.toHaveValue("");
  await post.click();
  await expect(tid(page, "job-status-title")).toHaveText("Waiting for an operator", { timeout: 180_000 });
  await expect(tid(page, "job-wanted-by")).not.toContainText("Not given");
  return await readJobRef(page);
}

/** The job id shown in the farmer "Job" row, e.g. "…97622". */
export async function readJobRef(page: Page): Promise<string> {
  const text = (await tid(page, "job-id").first().textContent({ timeout: 60_000 })) ?? "";
  const m = text.match(/…\d{5}|\b\d+\b/);
  return m ? m[0] : text.trim();
}

/** Accept the job with this ref (the list shows every open job on devnet, newest first), else the first one. */
export async function operatorAccepts(page: Page, jobRef?: string) {
  await signUp(page, "operator", "E2E Operator");
  await waitForWallet(page);
  const accept = (jobRef ? tid(page, "accept-job").filter({ hasText: jobRef }) : tid(page, "accept-job")).first();
  await expect(accept).toBeVisible({ timeout: 180_000 });
  await expect(accept).toBeEnabled({ timeout: 60_000 });
  await accept.click();
  await expect(tid(page, "simulate-flight")).toBeVisible({ timeout: 180_000 });
}

/** Pick a sample record and send it. The validator bots check it and (if it passes) co-sign and submit the proof; no human validator step. */
export async function operatorSendsRecord(page: Page, key: "honest" | "pumpOff" | "halfField" | "tankMismatch") {
  await tid(page, `record-${key}`).click();
  await expect(tid(page, `record-${key}`)).toContainText("(selected)");
  await tid(page, "send-record").click();
  // The checker bots run right away in this browser: an honest record goes on chain by itself, a bad one gets a refusal banner.
}

export function warn(testInfo: TestInfo, description: string) {
  testInfo.annotations.push({ type: "warning", description });
  console.warn(`WARNING: ${description}`);
}

/** True when the tests run against the staging site (https://khristo19.github.io/kvali/staging/). */
export const isStaging = (baseURL: string | undefined) => /\/staging\/?$/.test(baseURL ?? "");
/** localStorage key as the app names it: staging prefixes every key with "stg." (live and staging share one origin). */
export const lsKey = (baseURL: string | undefined, k: string) => (isStaging(baseURL) ? `stg.${k}` : k);
