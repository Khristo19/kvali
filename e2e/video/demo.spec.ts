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
  // A drawn mouse cursor (the screen capture has no real pointer): glides to each control, with a small ripple on click.
  const cur = () => {
    let el = document.getElementById("kv-cur");
    if (!el) {
      el = document.createElement("div");
      el.id = "kv-cur";
      el.style.cssText = "position:fixed;left:0;top:0;width:26px;height:34px;z-index:2147483647;pointer-events:none;will-change:transform;filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))";
      el.innerHTML = '<svg width="26" height="34" viewBox="0 0 26 34"><path d="M1.5 1.5 L1.5 27 L8 21 L12.5 31.5 L17 29.5 L12.6 19.4 L21.5 19.4 Z" fill="#fff" stroke="#111" stroke-width="2" stroke-linejoin="round"/></svg>';
      let p = [innerWidth * 0.62, innerHeight * 0.55];
      try { p = JSON.parse(sessionStorage.getItem("kv-cur") || "null") || p; } catch (e) {}
      el.style.transform = "translate(" + p[0] + "px," + p[1] + "px)";
      el.dataset.x = p[0]; el.dataset.y = p[1];
      document.documentElement.appendChild(el);
    }
    return el;
  };
  window.__kvPos = () => { const el = cur(); return [Number(el.dataset.x), Number(el.dataset.y)]; };
  window.__kvMove = (x, y, ms) => {
    const el = cur();
    el.style.transition = "transform " + ms + "ms cubic-bezier(.4,.05,.2,1)";
    el.style.transform = "translate(" + x + "px," + y + "px)";
    el.dataset.x = x; el.dataset.y = y;
    try { sessionStorage.setItem("kv-cur", JSON.stringify([x, y])); } catch (e) {}
  };
  window.__kvClick = () => {
    const el = cur(); const x = Number(el.dataset.x), y = Number(el.dataset.y);
    const r = document.createElement("div");
    r.style.cssText = "position:fixed;left:" + (x - 18) + "px;top:" + (y - 18) + "px;width:36px;height:36px;border-radius:50%;background:rgba(44,106,77,.35);border:2px solid rgba(44,106,77,.8);z-index:2147483646;pointer-events:none;transform:scale(.3);opacity:1;transition:transform .45s ease-out,opacity .45s ease-out";
    document.documentElement.appendChild(r);
    requestAnimationFrame(() => { r.style.transform = "scale(1.4)"; r.style.opacity = "0"; });
    setTimeout(() => r.remove(), 600);
    el.animate([{ transform: el.style.transform + " scale(1)" }, { transform: el.style.transform + " scale(.85)" }, { transform: el.style.transform + " scale(1)" }], { duration: 220 });
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", cur); else cur();
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

/** Glide the drawn cursor to the control like a person would, then click there for real. */
async function press(loc: Locator, page: Page) {
  await loc.scrollIntoViewIfNeeded();
  await loc.evaluate((el) => (el as HTMLElement).scrollIntoView({ block: "center", behavior: "smooth" })).catch(() => undefined);
  await page.waitForTimeout(450);
  const box = await loc.boundingBox();
  if (!box) {
    await loc.click();
    return;
  }
  const jitter = (n: number) => (Math.random() - 0.5) * Math.min(24, n / 4);
  const x = box.x + box.width / 2 + jitter(box.width);
  const y = box.y + box.height / 2 + jitter(box.height);
  const [cx, cy] = (await page.evaluate(() => (window as unknown as { __kvPos?: () => number[] }).__kvPos?.() ?? [x, y]).catch(() => [x, y])) as number[];
  const ms = Math.round(Math.min(1100, 380 + Math.hypot(x - cx, y - cy) * 0.55));
  await page.evaluate(([px, py, d]) => (window as unknown as { __kvMove: (a: number, b: number, c: number) => void }).__kvMove(px, py, d), [x, y, ms] as const).catch(() => undefined);
  await page.mouse.move(x, y, { steps: 8 });
  await page.waitForTimeout(ms + 180);
  await page.evaluate(() => (window as unknown as { __kvClick: () => void }).__kvClick()).catch(() => undefined);
  await page.mouse.click(x, y);
  await page.waitForTimeout(450);
}

/** Click into the field, then type like a person (empty first: the sign-up form remembers the last name used). */
async function typeInto(page: Page, loc: Locator, text: string, delay: number) {
  await press(loc, page);
  await loc.fill("");
  await loc.pressSequentially(text, { delay });
}

async function show(loc: Locator) {
  await loc.evaluate((el) => (el as HTMLElement).scrollIntoView({ block: "center", behavior: "smooth" })).catch(() => undefined);
}

async function signUp(page: Page, role: "farmer" | "operator" | "validator", name: string) {
  // Stay inside the app (no full page load, so no blank frame): "Change role" from a role page, nothing on the home page.
  const change = page.locator('[data-testid="nav-change-role"]:visible').first();
  if (await change.count()) await press(change, page);
  else if (!/\/kvali\/(\?.*)?$/.test(page.url())) await go(page, "/");
  await expect(tid(page, `role-${role}`)).toBeVisible();
  await press(tid(page, `role-${role}`), page);
  await press(tid(page, "continue-email"), page);
  await typeInto(page, tid(page, "signup-name"), name, 70);
  await typeInto(page, tid(page, "signup-email"), `${name.toLowerCase()}@example.com`, 30);
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
  await page.addInitScript(CAPTION_JS);
  await go(page, "/");
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await expect(tid(page, "role-farmer")).toBeVisible();
  await page.waitForTimeout(800);
  t0 = Date.now(); // the video starts here, on the loaded home page (no blank page, no title card)
  await page.waitForTimeout(1200);

  // 1. Farmer
  await say(page, "1 · Farmer. Demo sign-up: just a name and email, nothing is checked. The browser creates the farmer's Solana wallet. Real login (Privy) comes next.", 5000);
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
  await say(page, "2 · Drone operator. The operator signs up the same way and gets a wallet and a drone certificate on chain.", 4200);
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


  writeFileSync("video-out/marks.json", JSON.stringify({ t0Epoch: t0 / 1000, fast, total: now() }, null, 2));
  await ctx.close();
});
