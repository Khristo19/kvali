// Technical demo video: one recorded run of the real app on devnet (farmer -> operator -> bots -> validator -> payout).
// Captions are drawn on the page; waits on the chain are marked so make-video.mjs can speed them up and keep the video under 3 minutes.
// Runs in the cloud only (.github/workflows/demo-video.yml), never on the laptop.
import { chromium, test, expect, type Locator, type Page } from "@playwright/test";
import { writeFileSync } from "node:fs";

import { go, tid } from "../tests/helpers";

type Seg = { start: number; end: number };
const fast: Seg[] = [];
let t0 = 0;
const now = () => (Date.now() - t0) / 1000;

const CAPTION_JS = `(() => {
  const draw = (text) => {
    let el = document.getElementById("kv-cap");
    if (!el) {
      el = document.createElement("div");
      el.id = "kv-cap";
      el.style.cssText = "position:fixed;left:50%;bottom:18px;transform:translateX(-50%);max-width:900px;width:calc(100% - 80px);box-sizing:border-box;padding:10px 18px;border-radius:14px;background:rgba(16,32,24,.92);color:#fff;font:600 20px/1.35 system-ui,sans-serif;text-align:center;z-index:2147483647;pointer-events:none;box-shadow:0 8px 30px rgba(0,0,0,.35)";
      document.documentElement.appendChild(el);
    }
    el.textContent = text;
    el.style.display = text ? "block" : "none";
  };
  window.__kvCap = draw;
  const saved = sessionStorage.getItem("kv-cap");
  if (saved !== null) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => draw(saved));
    else draw(saved);
  }
})();`;

async function caption(page: Page, text: string) {
  await page
    .evaluate(
      ([js, t]) => {
        if (!(window as unknown as { __kvCap?: unknown }).__kvCap) (0, eval)(js);
        try {
          sessionStorage.setItem("kv-cap", t);
        } catch {
          /* other origin */
        }
        (window as unknown as { __kvCap: (s: string) => void }).__kvCap(t);
      },
      [CAPTION_JS, text] as const,
    )
    .catch(() => undefined);
}

/** Show a caption and leave time to read it. */
async function say(page: Page, text: string, ms = 3800) {
  await caption(page, text);
  await page.waitForTimeout(ms);
}

/** A wait on the chain or the network: marked so the video plays it fast, with an honest label. */
async function waiting<T>(page: Page, label: string, fn: () => Promise<T>): Promise<T> {
  await caption(page, `${label}  ⏩ sped up`);
  const start = now();
  try {
    return await fn();
  } finally {
    const end = now();
    if (end - start > 1.5) fast.push({ start: start + 0.4, end: end - 0.2 });
  }
}

/** Ring the control, pause so viewers see it, then click. The ring is cleared page-wide: the control may be gone after the click. */
async function press(loc: Locator, page: Page) {
  await loc.scrollIntoViewIfNeeded();
  await loc.evaluate((el) => {
    (el as HTMLElement).scrollIntoView({ block: "center", behavior: "smooth" });
    (el as HTMLElement).setAttribute("data-kv-ring", "1");
    (el as HTMLElement).style.outline = "4px solid #F5B700";
    (el as HTMLElement).style.outlineOffset = "4px";
  });
  await page.waitForTimeout(1100);
  await loc.click();
  await page.waitForTimeout(400);
  await page
    .evaluate(() =>
      document.querySelectorAll("[data-kv-ring]").forEach((e) => {
        (e as HTMLElement).style.outline = "";
        e.removeAttribute("data-kv-ring");
      }),
    )
    .catch(() => undefined);
}

/** Type like a person, into an empty field (the sign-up form remembers the last name used). */
async function typeInto(loc: Locator, text: string, delay: number) {
  await loc.fill("");
  await loc.pressSequentially(text, { delay });
}

async function show(loc: Locator) {
  await loc.evaluate((el) => (el as HTMLElement).scrollIntoView({ block: "center", behavior: "smooth" })).catch(() => undefined);
}

/** Full-screen title card. */
async function card(page: Page, title: string, sub: string, ms: number) {
  await caption(page, "");
  await page.evaluate(
    ([t, s]) => {
      const el = document.createElement("div");
      el.id = "kv-card";
      el.style.cssText = "position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;background:#14301f;color:#fff;font-family:system-ui,sans-serif;text-align:center;padding:40px";
      el.innerHTML = `<div style="font:700 54px/1.1 system-ui">${t}</div><div style="font:500 23px/1.45 system-ui;opacity:.9;max-width:820px">${s}</div>`;
      document.documentElement.appendChild(el);
    },
    [title, sub] as const,
  );
  await page.waitForTimeout(ms);
  await page.evaluate(() => document.getElementById("kv-card")?.remove());
}

async function signUp(page: Page, role: "farmer" | "operator" | "validator", name: string) {
  await go(page, "/");
  await press(tid(page, `role-${role}`), page);
  await press(tid(page, "continue-email"), page);
  await typeInto(tid(page, "signup-name"), name, 70);
  await typeInto(tid(page, "signup-email"), `${name.toLowerCase()}@example.com`, 30);
  await press(tid(page, "signup-submit"), page);
  await expect(page).toHaveURL(new RegExp(`/${role}(\\?|$|/)`));
}

test("Technical demo video", async ({ baseURL }) => {
  test.setTimeout(25 * 60_000);
  // Our own full-screen window (kiosk only applies to the browser's first window, so a persistent context): no tabs or address bar on screen.
  const ctx = await chromium.launchPersistentContext("", {
    headless: false,
    viewport: null,
    baseURL,
    args: ["--kiosk", "--force-device-scale-factor=1.5", "--window-position=0,0", "--window-size=1280,720", "--hide-scrollbars", "--disable-infobars", "--no-first-run"],
  });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  t0 = Date.now();
  await page.addInitScript(CAPTION_JS);

  await go(page, "/");
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await card(page, "Kvali", "Proof of spray: drone spraying paid only when the work is proven.<br/>A live run on Solana devnet, recorded end to end.", 5000);

  // 1. Farmer
  await say(page, "1 · Farmer. A farmer signs up with a name and email. No crypto wallet to install.", 3500);
  await signUp(page, "farmer", "Anna");
  // Ready when posting is possible (the "funded and ready" note can come and go before we look).
  await waiting(page, "Kvali creates the farmer's Solana wallet and funds it with test USDC", () =>
    expect(tid(page, "post-job")).toBeEnabled({ timeout: 240_000 }),
  );
  await say(page, "My fields: field outlines on satellite maps. Tap a field to pick it.", 3800);
  const firstField = page.locator('[data-testid^="field-card-"]').first();
  if (await firstField.count()) await press(firstField, page);
  await show(tid(page, "post-job"));
  await say(page, "Post a spray job: pick the date. $300 USDC will be locked in the Kvali program on Solana, not held by us.", 4500);
  const post = tid(page, "post-job");
  await press(post, page);
  await waiting(page, "Posting the job on Solana: the $300 goes into escrow", () =>
    expect(tid(page, "job-status-title")).toHaveText("Waiting for an operator", { timeout: 180_000 }),
  );
  const jobRef = ((await tid(page, "job-id").first().textContent()) ?? "").match(/…\d{5}/)?.[0] ?? "";
  await show(tid(page, "job-status-title"));
  await say(page, `Job ${jobRef} is live on chain and waiting for an operator.`, 3500);

  // 2. Operator
  await say(page, "2 · Drone operator. A certified operator signs up in the same way.", 3000);
  await signUp(page, "operator", "Luka");
  const accept = (jobRef ? tid(page, "accept-job").filter({ hasText: jobRef }) : tid(page, "accept-job")).first();
  await waiting(page, "Setting up the operator's wallet and drone certificate, loading open jobs", () => expect(accept).toBeEnabled({ timeout: 300_000 }));
  await show(accept);
  await say(page, "Open jobs near you, read from the chain. To accept, the operator locks a $300 bond: skin in the game.", 4500);
  await press(accept, page);
  await waiting(page, "Accepting on Solana: the operator's bond is locked", () => expect(tid(page, "simulate-flight")).toBeVisible({ timeout: 180_000 }));

  // 3. Flight log and checks
  await show(tid(page, "simulate-flight"));
  await say(page, "3 · After spraying, the drone's flight log is sent: path, area covered, spray rate and tank use.", 4200);
  await say(page, "Bad logs (pump off, half the field, tank mismatch) are refused by the checkers, and nothing is paid.", 4200);
  await press(tid(page, "record-honest"), page);
  await press(tid(page, "send-record"), page);
  await say(page, "Three independent checker bots verify the log against the field outline and the target dose.", 3500);
  await waiting(page, "The bots check the log and co-sign the proof on chain", () => expect(tid(page, "simulate-flight")).toBeHidden({ timeout: 300_000 }));

  // 4. Validator
  await say(page, "4 · Validators. Here is what the checkers decided.", 2800);
  await signUp(page, "validator", "Mari");
  await waiting(page, "Reading the verdicts from Solana", () => expect(tid(page, "bot-outcome")).toContainText("All checks pass", { timeout: 240_000 }));
  await show(tid(page, "bot-verdicts"));
  await say(page, "All checks pass: 2 of 3 bots co-signed the proof on chain. No human click needed.", 4500);
  await show(tid(page, "stake-card"));
  await say(page, "Every validator seat stakes at least $500. A wrong co-sign can be slashed.", 4200);

  // 5. Settlement
  await say(page, "The farmer can still dispute during a challenge window. Then the job settles by itself.", 3800);
  const banner = tid(page, "validator-job-banner");
  await waiting(page, "Challenge window closing, then automatic settlement on Solana", async () => {
    try {
      await expect(banner).toContainText("settled", { timeout: 200_000 });
    } catch {
      const settle = tid(page, "settle-now");
      await expect(settle).toBeEnabled({ timeout: 120_000 });
      await settle.click();
      await expect(banner).toContainText("settled", { timeout: 180_000 });
    }
  });

  // 6. Payout
  await go(page, "farmer");
  await waiting(page, "Loading the farmer's view", () => expect(tid(page, "job-status-title")).toHaveText("Operator paid", { timeout: 180_000 }));
  await show(tid(page, "job-status-title"));
  await say(page, "5 · Paid with proof. The farmer sees the job done and paid.", 3200);
  await show(tid(page, "payout-card"));
  await say(page, "$285 to the operator, the $300 bond returned, $9 Kvali fee, $6 to the validators. Paid in USDC.", 5000);

  await go(page, "operator?tab=earnings");
  await waiting(page, "Loading the operator's earnings", () => expect(tid(page, "earnings-paid-out")).toContainText("$585.00", { timeout: 120_000 }));
  await say(page, "The operator was paid the moment the work was proven: $585 including the bond back.", 4000);

  // 7. Job story + Explorer
  await go(page, "job");
  await waiting(page, "Loading the job story", () => expect(tid(page, "adds-up")).toContainText("Adds up", { timeout: 120_000 }));
  await show(tid(page, "tx-link").first());
  await say(page, "The job story: every step is a Solana transaction, and the money adds up.", 4200);
  const story = page.getByText("What happened").first();
  await show(story);
  await say(page, "Each step links to its transaction on Solana Explorer: post, accept, proof, co-signs and payout. Anyone can check them.", 5000);
  await show(page.getByText("Where the money went").first());
  await say(page, "Where the money went: every dollar is accounted for, on chain.", 4000);

  await card(page, "Kvali: proof of spray", "Farmers pay only for proven work.<br/>Operators are paid the moment it's proven.<br/><br/>khristo19.github.io/kvali", 4000);

  writeFileSync("video-out/marks.json", JSON.stringify({ t0Epoch: t0 / 1000, fast, total: now() }, null, 2));
  await ctx.close();
});
