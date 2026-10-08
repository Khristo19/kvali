// Gives this browser's burner wallets what they need on devnet: SOL for fees and rent, test USDC, and (operator) the on-chain
// operator account plus a calibration certificate. Everything comes from the public demo bank. Idempotent: checks first, sends only what is missing.
import { PublicKey } from "@solana/web3.js";

import * as chain from "./client";
import { keys } from "./keys";
import { getDevnetState, setDevnetState } from "./mode";

type Role = "farmer" | "operator";
const USDC_TARGET = 1_000n * 1_000_000n; // $1,000
const USDC_LOW = 400n * 1_000_000n;
const inflight: Partial<Record<Role, Promise<void>>> = {};

const say = (msg: string | null, ok = false) => setDevnetState({ walletNote: msg, walletOk: ok });

async function provision(role: Role) {
  const kp = role === "farmer" ? keys.farmer : keys.operator;
  const need = await chain.lamportsNeeded();
  const w = await chain.walletState(kp.publicKey);
  const lowSol = role === "farmer" ? w.sol < need.farmerOneJob : w.sol < (w.registered ? 1_000_000 : need.operatorMin); // a registered operator only pays fees
  const lowUsdc = w.usdc < USDC_LOW;
  const certOk = role === "farmer" ? true : w.registered && (await chain.certificateValid());
  if (!lowSol && !lowUsdc && certOk) {
    if (getDevnetState().walletNote) say(null); // sign-up showed "setting up" but nothing was needed
    return;
  }

  const steps = [lowSol && "funding with test SOL", lowUsdc && "adding test USDC", role === "operator" && !certOk && "registering you and issuing the drone certificate"].filter(Boolean) as string[];
  let n = 0;
  const step = () => say(`Setting up your devnet wallet… ${++n}/${steps.length}: ${steps[n - 1]}`);
  // 1. SOL from the bank (the demo validator that pays the certificate rent is topped up too)
  if (lowSol) {
    step();
    const target = role === "farmer" ? need.farmerTarget : need.operatorTarget;
    const amount = Math.max(target - w.sol, 0);
    try {
      await chain.sendSol(keys.bank, kp.publicKey, amount);
    } catch {
      // The bank is short on SOL: try the public devnet faucet instead.
      try {
        await chain.airdrop(kp.publicKey, 0.1);
      } catch {
        throw new Error("The demo wallet bank is out of devnet SOL and the public faucet is busy. Please try again in a minute, or tell the presenter to run the bank top-up.");
      }
    }
  }
  if (role === "operator") {
    const vSol = await chain.connection.getBalance(keys.vOperatorSide.publicKey);
    if (vSol < need.validatorMin) {
      try {
        await chain.sendSol(keys.bank, keys.vOperatorSide.publicKey, need.validatorMin * 3);
      } catch {
        /* certificate step below reports it */
      }
    }
  }
  // 2. test USDC
  if (lowUsdc) {
    step();
  }
  if (lowUsdc) await chain.sendUsdcFromBank(kp, USDC_TARGET - w.usdc);
  // 3. operator account + certificate
  if (role === "operator" && !certOk) {
    step();
    const sig = await chain.registerAndCertify();
    try {
      globalThis.localStorage?.setItem("kvali.certsig.v1", sig);
    } catch {
      /* ignore */
    }
  }
  say(`Your devnet ${role} wallet is funded and ready ✓`, true);
  setTimeout(() => setDevnetState({ walletNote: null, walletOk: false }), 5000);
  setDevnetState({ walletReadyAt: Date.now() });
}

/** Make sure the wallet of a role is funded (and the operator certified). Safe to call before every action; concurrent calls share one run. */
export function ensureWallet(role: Role): Promise<void> {
  const running = inflight[role];
  if (running) return running;
  const p = provision(role)
    .catch((e) => {
      say(null);
      throw e;
    })
    .finally(() => {
      delete inflight[role];
    });
  inflight[role] = p;
  return p;
}

export const addressOfRole = (role: Role): PublicKey => (role === "farmer" ? keys.farmer.publicKey : keys.operator.publicKey);
