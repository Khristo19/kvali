// Mirrors `finish` / `challenge` in programs/kvali/src/lib.rs: who gets
// what when a job ends. Used by the app and the pixel simulation to show
// payouts, and by tests to check the fees are always covered.

export const KVALI_FEE_BPS = 300n;
export const VALIDATOR_FEE_BPS = 200n;
export const PANEL_FEE_BPS = 1_000n;
export const CHALLENGE_BOND_BPS = 2_000n;
const BPS = 10_000n;

export type Outcome =
  | "settled" // proof passed, no challenge
  | "challenge-rejected" // farmer challenged and lost
  | "challenge-upheld" // farmer challenged and won
  | "expired"; // operator never delivered a proof

export interface Payout {
  farmer: bigint;
  operator: bigint;
  kvali: bigint;
  validators: bigint;
}

/** All amounts in USDC base units (6 decimals). */
export function computeSettlement(amount: bigint, bond: bigint, outcome: Outcome): Payout {
  const challenged = outcome === "challenge-rejected" || outcome === "challenge-upheld";
  const challengeBond = challenged ? (amount * CHALLENGE_BOND_BPS) / BPS : 0n;
  const vault = amount + bond + challengeBond;

  const operatorWins = outcome === "settled" || outcome === "challenge-rejected";
  let kvali = 0n;
  let validators = 0n;
  if (operatorWins) {
    kvali = (amount * KVALI_FEE_BPS) / BPS;
    validators = (amount * VALIDATOR_FEE_BPS) / BPS;
  }
  if (challenged) validators += (amount * PANEL_FEE_BPS) / BPS;

  const payout = vault - kvali - validators;
  if (payout < 0n) throw new Error("vault does not cover fees");
  return {
    farmer: operatorWins ? 0n : payout,
    operator: operatorWins ? payout : 0n,
    kvali,
    validators,
  };
}
