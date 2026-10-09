// One shared RPC layer for the public devnet endpoint, which rate-limits (HTTP 429) quickly when many people use the demo.
//  - a request queue with a small concurrency limit
//  - retry with exponential backoff + jitter on 429 / 5xx / network errors (honours Retry-After), invisible to callers
//  - identical in-flight reads are shared; reads are cached for a few seconds (immutable data longer)
//  - any successful write clears the read cache, so the next read is fresh
//  - the UI is told when we are waiting ("rpcBusy"), and callers get plain-words errors, never raw JSON bodies
import { setDevnetState } from "./mode";

const MAX_CONCURRENT = 3;
const MAX_ATTEMPTS = 7;

const TTL_MS: Record<string, number> = {
  getBalance: 4000,
  getTokenAccountBalance: 4000,
  getAccountInfo: 4000,
  getMultipleAccounts: 4000,
  getSlot: 4000,
  getProgramAccounts: 10000,
  getSignaturesForAddress: 6000,
  getTransaction: 10 * 60 * 1000, // immutable once confirmed
};

export class RpcBusyError extends Error {
  constructor() {
    super("Solana devnet is busy right now. The app keeps retrying; please wait a few seconds.");
    this.name = "RpcBusyError";
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let active = 0;
const waiting: (() => void)[] = [];
async function slot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENT) await new Promise<void>((r) => waiting.push(r));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    waiting.shift()?.();
  }
}

let busyCount = 0;
const markBusy = (on: boolean) => {
  busyCount = Math.max(0, busyCount + (on ? 1 : -1));
  setDevnetState({ rpcBusy: busyCount > 0 });
};

const cache = new Map<string, { at: number; ttl: number; status: number; text: string }>();
const inflight = new Map<string, Promise<{ status: number; text: string }>>();

function parse(init?: RequestInit): { method: string; key: string } | null {
  try {
    const body = typeof init?.body === "string" ? init.body : null;
    if (!body) return null;
    const j = JSON.parse(body);
    if (Array.isArray(j)) return null;
    // the request id differs every call; leave it out of the key
    return { method: j.method as string, key: `${j.method}:${JSON.stringify(j.params)}` };
  } catch {
    return null;
  }
}

async function attempt(url: string, init: RequestInit | undefined): Promise<{ status: number; text: string }> {
  let delay = 700;
  let waited = false;
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    try {
      const res = await slot(() => fetch(url, init));
      const text = await res.text();
      if (res.status !== 429 && res.status < 500) {
        if (waited) markBusy(false);
        return { status: res.status, text };
      }
      if (!waited) {
        waited = true;
        markBusy(true);
      }
      const ra = Number(res.headers.get("retry-after"));
      await sleep((Number.isFinite(ra) && ra > 0 ? ra * 1000 : delay) + Math.random() * 400);
    } catch {
      if (!waited) {
        waited = true;
        markBusy(true);
      }
      await sleep(delay + Math.random() * 400);
    }
    delay = Math.min(delay * 2, 8000);
  }
  if (waited) markBusy(false);
  throw new RpcBusyError();
}

/** Drop-in `fetch` for web3.js Connection. */
export async function rpcFetch(url: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const u = String(url);
  const p = parse(init);
  const ttl = p ? TTL_MS[p.method] : undefined;
  const respond = (r: { status: number; text: string }) => new Response(r.text, { status: r.status, headers: { "content-type": "application/json" } });

  if (p && ttl) {
    const hit = cache.get(p.key);
    if (hit && Date.now() - hit.at < hit.ttl) return respond(hit);
    let pending = inflight.get(p.key);
    if (!pending) {
      pending = attempt(u, init)
        .then((r) => {
          if (r.status === 200 && !r.text.includes('"error"')) cache.set(p.key, { at: Date.now(), ttl, ...r });
          return r;
        })
        .finally(() => inflight.delete(p.key));
      inflight.set(p.key, pending);
    }
    return respond(await pending);
  }
  const r = await attempt(u, init);
  if (p?.method === "sendTransaction" && r.status === 200) cache.clear(); // state changed: reads must be fresh
  return respond(r);
}

/** Forget cached reads (after a known change). */
export const clearRpcCache = () => cache.clear();

/** Turn any error into a short sentence for the UI: never JSON, never stack text. */
export function friendlyMessage(raw: string): string {
  const m = raw ?? "";
  if (/429|rate limit|too many requests|busy|failed to fetch|fetch failed|network|timeout|timed out|ECONN/i.test(m)) {
    return "Solana devnet is busy right now. The app keeps retrying; please wait a few seconds and try again if nothing changes.";
  }
  if (m.trim().startsWith("{") || m.includes('"jsonrpc"')) return "Solana devnet returned an unexpected answer. Please try again in a moment.";
  return m;
}
