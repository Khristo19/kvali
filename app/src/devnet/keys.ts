// Devnet keys.
//  - Validators: the 3 PUBLIC demo validator keys (they are the on-chain validator set). Devnet only, never real money.
//  - Farmer and operator: a BURNER keypair generated in THIS browser (localStorage "kvali.burners.v1"), so visitors never share
//    a key (the program allows one active job per operator). It is funded by the public demo BANK key. Devnet only.
//  - Bank: PUBLIC key (bank-key.json) holding devnet SOL and test USDC; hands them to new burners.
import "./polyfill";
import { Keypair } from "@solana/web3.js";

import bankRaw from "./bank-key.json";
import raw from "./demo-keys.json";

export const DEMO_KEYS_WARNING = raw.warning;

type Role = "validator-operator-side" | "validator-farmer-side" | "validator-neutral";
const kp = (role: Role) => {
  const e = raw.keys.find((k) => k.role === role);
  if (!e) throw new Error(`demo key missing: ${role}`);
  return Keypair.fromSecretKey(Uint8Array.from(e.secretKey));
};

// ---- burners ----
const BKEY = "kvali.burners.v1";
type BurnerRole = "farmer" | "operator";
const cache: Partial<Record<BurnerRole, Keypair>> = {};
let loadedFromStorage = false;
const memory: Partial<Record<BurnerRole, number[]>> = {};

function load() {
  if (loadedFromStorage) return;
  loadedFromStorage = true;
  try {
    const p = JSON.parse(globalThis.localStorage?.getItem(BKEY) ?? "null") as Partial<Record<BurnerRole, number[]>> | null;
    if (p?.farmer?.length === 64) memory.farmer = p.farmer;
    if (p?.operator?.length === 64) memory.operator = p.operator;
  } catch {
    /* storage blocked: burners live in memory for this tab */
  }
}
function save() {
  try {
    globalThis.localStorage?.setItem(BKEY, JSON.stringify(memory));
  } catch {
    /* ignore */
  }
}

/** This browser's own wallet for a role. Generated on first use (no network). */
export function burner(role: BurnerRole): Keypair {
  load();
  const hit = cache[role];
  if (hit) return hit;
  let secret = memory[role];
  if (!secret) {
    secret = Array.from(Keypair.generate().secretKey);
    memory[role] = secret;
    save();
  }
  return (cache[role] = Keypair.fromSecretKey(Uint8Array.from(secret)));
}
export function hasBurner(role: BurnerRole): boolean {
  load();
  return !!memory[role];
}
/** Forget this browser's burner wallets (Reset demo). */
export function resetBurners() {
  load();
  delete memory.farmer;
  delete memory.operator;
  delete cache.farmer;
  delete cache.operator;
  try {
    globalThis.localStorage?.removeItem(BKEY);
  } catch {
    /* ignore */
  }
}

export const bankKey = Keypair.fromSecretKey(Uint8Array.from(bankRaw.secretKey));

export const keys = {
  get farmer() {
    return burner("farmer");
  },
  get operator() {
    return burner("operator");
  },
  vOperatorSide: kp("validator-operator-side"),
  vFarmerSide: kp("validator-farmer-side"),
  vNeutral: kp("validator-neutral"),
  bank: bankKey,
};

/** Engine wallet / validator ids (src/engine/scenario.ts) -> signing key. */
export function keyFor(id: string): Keypair {
  switch (id) {
    case "farmer-group-1":
      return keys.farmer;
    case "operator-1":
      return keys.operator;
    case "validator-operator-side":
      return keys.vOperatorSide;
    case "validator-farmer-side":
      return keys.vFarmerSide;
    case "validator-neutral":
      return keys.vNeutral;
    default:
      throw new Error(`no demo key for ${id}`);
  }
}
