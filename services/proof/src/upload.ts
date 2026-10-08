// Uploads the canonical manifest JSON to Arweave through Irys DEVNET (paid with Solana devnet SOL).
// Devnet data is temporary (about 60 days). Network code lives only in uploadManifest;
// buildTags and the helpers are pure and are what the tests cover.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { canonicalJson, manifestHash } from "./manifest.ts";

export const DEVNET_RPC = "https://api.devnet.solana.com";
export const DEVNET_GATEWAY = "https://devnet.irys.xyz";
/** Hard safety cap on how much SOL we will ever fund Irys with from this tool. */
export const MAX_FUND_LAMPORTS = 10_000_000; // 0.01 SOL

export interface Tag {
  name: string;
  value: string;
}

export interface UploadOptions {
  /** Path to a Solana keypair JSON (array of bytes). Default: ~/.config/solana/id.json */
  keypairPath?: string;
  rpcUrl?: string;
}

export interface UploadResult {
  id: string;
  url: string;
  sha256: string;
  spentLamports: number;
}

export function buildTags(sha256: string): Tag[] {
  return [
    { name: "Content-Type", value: "application/json" },
    { name: "App-Name", value: "Kvali" },
    { name: "Kvali-Manifest-SHA256", value: sha256 },
    { name: "Simulated", value: "true" },
  ];
}

export function gatewayUrl(id: string): string {
  return `${DEVNET_GATEWAY}/${id}`;
}

export async function uploadManifest(
  manifest: unknown,
  opts: UploadOptions = {},
): Promise<UploadResult> {
  const rpcUrl = opts.rpcUrl ?? DEVNET_RPC;
  if (!rpcUrl.includes("devnet")) throw new Error("refusing to upload: RPC is not devnet");
  const keyPath = opts.keypairPath ?? `${homedir()}/.config/solana/id.json`;
  const secret = Uint8Array.from(JSON.parse(readFileSync(keyPath, "utf8")) as number[]);

  const body = canonicalJson(manifest);
  const sha256 = manifestHash(manifest);

  const { Uploader } = await import("@irys/upload");
  const { Solana } = await import("@irys/upload-solana");
  const irys = await Uploader(Solana).withWallet(secret).withRpc(rpcUrl).devnet();

  const price = await irys.getPrice(Buffer.byteLength(body));
  let spent = 0;
  const balance = await irys.getLoadedBalance();
  if (balance.lt(price)) {
    const need = price.minus(balance).multipliedBy(1.1).integerValue();
    if (need.gt(MAX_FUND_LAMPORTS)) throw new Error("required funding exceeds 0.01 SOL cap");
    await irys.fund(need);
    spent = need.toNumber();
  }
  const receipt = await irys.upload(body, { tags: buildTags(sha256) });
  return { id: receipt.id, url: gatewayUrl(receipt.id), sha256, spentLamports: spent };
}
