// Demo devnet keys. PUBLIC by design: they ship in the web build and only hold devnet SOL and test USDC.
// Never use them on mainnet. The project's own keys and the deploy wallet are NOT here.
import "./polyfill";
import { Keypair } from "@solana/web3.js";

import raw from "./demo-keys.json";

export const DEMO_KEYS_WARNING = raw.warning;

type Role = "farmer" | "operator" | "validator-operator-side" | "validator-farmer-side" | "validator-neutral";

const kp = (role: Role) => {
  const e = raw.keys.find((k) => k.role === role);
  if (!e) throw new Error(`demo key missing: ${role}`);
  return Keypair.fromSecretKey(Uint8Array.from(e.secretKey));
};

export const keys = {
  farmer: kp("farmer"),
  operator: kp("operator"),
  vOperatorSide: kp("validator-operator-side"),
  vFarmerSide: kp("validator-farmer-side"),
  vNeutral: kp("validator-neutral"),
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
