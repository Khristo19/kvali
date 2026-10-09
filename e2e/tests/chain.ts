import { expect } from "@playwright/test";

const RPC_URL = process.env.E2E_RPC_URL || "https://api.devnet.solana.com";
const SIG_RE = /\/tx\/([1-9A-HJ-NP-Za-km-z]{80,90})/;

export function signatureFromHref(href: string | null): string | null {
  const m = href?.match(SIG_RE);
  return m ? m[1] : null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface SigStatus {
  confirmationStatus?: "processed" | "confirmed" | "finalized" | null;
  err: unknown;
}

/** JSON-RPC call with backoff on HTTP 429 / 5xx / network errors (public devnet RPC is rate limited). */
async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  let delay = 2_000;
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(RPC_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { result?: T; error?: { message: string } };
      if (body.error) throw new Error(body.error.message);
      return body.result as T;
    } catch (e) {
      if (attempt >= 8) throw new Error(`RPC ${method} failed after ${attempt} attempts: ${(e as Error).message}`);
      await sleep(delay + Math.random() * 500);
      delay = Math.min(delay * 2, 30_000);
    }
  }
}

/** Assert every signature is finalized with err null (waits up to `timeoutMs` for finalization). */
export async function expectFinalized(signatures: string[], timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  let statuses: (SigStatus | null)[] = [];
  for (;;) {
    const r = await rpc<{ value: (SigStatus | null)[] }>("getSignatureStatuses", [signatures, { searchTransactionHistory: true }]);
    statuses = r.value;
    const pending = statuses.some((s) => !s || (s.err === null && s.confirmationStatus !== "finalized"));
    if (!pending || Date.now() > deadline) break;
    await sleep(5_000);
  }
  signatures.forEach((sig, i) => {
    const s = statuses[i];
    expect(s, `signature ${sig} not found on devnet`).not.toBeNull();
    expect(s!.err, `signature ${sig} has an error`).toBeNull();
    expect(s!.confirmationStatus, `signature ${sig} not finalized`).toBe("finalized");
  });
}
