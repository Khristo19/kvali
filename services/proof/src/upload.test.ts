import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTags, gatewayUrl, DEVNET_GATEWAY } from "./upload.ts";

test("buildTags carries content type, app, hash and simulated flag", () => {
  const tags = buildTags("abc123");
  const get = (n: string) => tags.find((t) => t.name === n)?.value;
  assert.equal(get("Content-Type"), "application/json");
  assert.equal(get("App-Name"), "Kvali");
  assert.equal(get("Kvali-Manifest-SHA256"), "abc123");
  assert.equal(get("Simulated"), "true");
});

test("gatewayUrl points at the devnet gateway", () => {
  assert.equal(gatewayUrl("xyz"), `${DEVNET_GATEWAY}/xyz`);
});
