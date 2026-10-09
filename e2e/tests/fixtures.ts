import { test as base, expect } from "@playwright/test";

/**
 * `test` with a console guard: any console error or uncaught page error fails the test,
 * except React error #418 (hydration, known and harmless) and transient public-RPC failures
 * (HTTP 429 / CORS noise from api.devnet.solana.com, KNOWN_ISSUES trap 7), which are recorded as warnings.
 */
export const test = base.extend<{ consoleGuard: void }>({
  consoleGuard: [
    async ({ page }, use, testInfo) => {
      const errors: string[] = [];
      const rpcNoise: string[] = [];
      const isRpcNoise = (text: string, url = "") =>
        /solana\.com|helius|rpc/i.test(url + text) && /429|Too Many Requests|CORS|Failed to load resource|ERR_FAILED|net::/i.test(text);
      page.on("console", (m) => {
        if (m.type() !== "error") return;
        const text = m.text();
        if (/#418|Minified React error 418/.test(text)) return;
        if (isRpcNoise(text, m.location().url)) rpcNoise.push(text);
        else errors.push(`[console] ${text} (${m.location().url})`);
      });
      page.on("pageerror", (e) => {
        if (/#418|Minified React error 418/.test(e.message)) return;
        errors.push(`[pageerror] ${e.message}`);
      });
      await use();
      if (rpcNoise.length) {
        testInfo.annotations.push({ type: "warning", description: `${rpcNoise.length} public-RPC console error(s) ignored (429/CORS): ${rpcNoise[0].slice(0, 160)}` });
      }
      expect(errors, "page console errors / uncaught exceptions (React #418 is ignored)").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
