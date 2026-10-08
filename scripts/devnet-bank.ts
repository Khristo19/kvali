// Public demo "bank" for the web demo (round 3). Devnet only. Idempotent.
//   ANCHOR_WALLET=~/.config/solana/id.json npx ts-node --transpile-only scripts/devnet-bank.ts            (create + fund)
//   ... scripts/devnet-bank.ts --topup                                                                      (refill later)
// The bank key lives in app/src/devnet/bank-key.json and is PUBLIC (it ships in the web build). It only holds devnet SOL and
// test USDC, which the app hands to each visitor's own burner wallet. The deploy wallet is loaded at runtime, never printed,
// and always keeps at least 0.3 SOL.
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, type TransactionInstruction } from "@solana/web3.js";
import { createAssociatedTokenAccountIdempotentInstruction, createMintToInstruction, getAssociatedTokenAddressSync, getAccount } from "@solana/spl-token";

const ROOT = path.resolve(__dirname, "..");
const URL = process.env.ANCHOR_PROVIDER_URL ?? "https://api.devnet.solana.com";
if (!URL.includes("devnet")) throw new Error("devnet only: ANCHOR_PROVIDER_URL must be a devnet RPC");
const BANK_FILE = path.join(ROOT, "app/src/devnet/bank-key.json");
const DEPLOY = JSON.parse(fs.readFileSync(path.join(ROOT, "deploy/devnet.json"), "utf8"));
const MINT = new PublicKey(DEPLOY.usdcMint);
const KEEP = 0.3 * LAMPORTS_PER_SOL; // the deploy wallet always keeps this much
const SOL_TARGET = Math.round(0.45 * LAMPORTS_PER_SOL);
const USDC_TARGET = 1_000_000n * 1_000_000n; // $1,000,000 (6 decimals)
const link = (s: string) => `https://explorer.solana.com/tx/${s}?cluster=devnet`;

async function main() {
  const topup = process.argv.includes("--topup");
  let file: { warning: string; pubkey: string; secretKey: number[] };
  if (fs.existsSync(BANK_FILE)) file = JSON.parse(fs.readFileSync(BANK_FILE, "utf8"));
  else {
    const k = Keypair.generate();
    file = { warning: "Devnet demo BANK key. Public. Holds only devnet SOL and test USDC. Never use on mainnet.", pubkey: k.publicKey.toBase58(), secretKey: Array.from(k.secretKey) };
    fs.writeFileSync(BANK_FILE, JSON.stringify(file, null, 2) + "\n");
    console.log("generated", BANK_FILE);
  }
  const bank = Keypair.fromSecretKey(Uint8Array.from(file.secretKey));
  const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync((process.env.ANCHOR_WALLET ?? "~/.config/solana/id.json").replace(/^~/, os.homedir()), "utf8"))));
  const conn = new Connection(URL, "confirmed");
  const bankAta = getAssociatedTokenAddressSync(MINT, bank.publicKey);

  const send = async (label: string, ixs: TransactionInstruction[]) => {
    const tx = new Transaction().add(...ixs);
    tx.feePayer = payer.publicKey;
    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
    tx.recentBlockhash = blockhash;
    tx.sign(payer);
    const sig = await conn.sendRawTransaction(tx.serialize());
    const c = await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
    if (c.value.err) throw new Error(`${label} failed: ${JSON.stringify(c.value.err)}`);
    console.log(`  ${label}: ${link(sig)}`);
  };

  const payerBal = await conn.getBalance(payer.publicKey);
  console.log(`deploy wallet: ${(payerBal / LAMPORTS_PER_SOL).toFixed(4)} SOL (keeps >= ${KEEP / LAMPORTS_PER_SOL})`);
  const bankSol = await conn.getBalance(bank.publicKey);
  const ixs: TransactionInstruction[] = [createAssociatedTokenAccountIdempotentInstruction(payer.publicKey, bankAta, bank.publicKey, MINT)];
  const have = (await conn.getAccountInfo(bankAta)) ? (await getAccount(conn, bankAta)).amount : 0n;
  if (have < USDC_TARGET) ixs.push(createMintToInstruction(MINT, bankAta, payer.publicKey, USDC_TARGET - have));
  await send("bank ATA + mint test USDC", ixs);

  const want = SOL_TARGET - bankSol;
  const spare = payerBal - KEEP - 10_000;
  if (want > 5_000_000 && spare > 0) {
    const amount = Math.min(want, spare);
    await send(`send ${(amount / LAMPORTS_PER_SOL).toFixed(3)} SOL to the bank`, [SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: bank.publicKey, lamports: amount })]);
  } else console.log(want > 5_000_000 ? "  deploy wallet has no spare SOL above the 0.3 reserve" : "  bank SOL already at target");
  if (!topup) console.log("(use --topup later to refill)");
  const after = (await getAccount(conn, bankAta)).amount;
  console.log(`BANK ${bank.publicKey.toBase58()}`);
  console.log(`  SOL  ${((await conn.getBalance(bank.publicKey)) / LAMPORTS_PER_SOL).toFixed(4)}`);
  console.log(`  USDC ${(Number(after) / 1e6).toLocaleString("en-US")}`);
  console.log(`deploy wallet left: ${((await conn.getBalance(payer.publicKey)) / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
}
main().catch((e) => { console.error("ERROR:", e.message ?? e); process.exit(1); });
