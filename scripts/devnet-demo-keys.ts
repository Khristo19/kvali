// Demo devnet keys for the public web build (task w09). Devnet only; refuses any other RPC. Idempotent.
//   npx ts-node --transpile-only scripts/devnet-demo-keys.ts      (needs ANCHOR_WALLET = deploy wallet, loaded at runtime, never printed)
// Writes app/src/devnet/demo-keys.json: PUBLIC by design (farmer, operator, 3 validators). Never reuse these keys anywhere real.
// The deploy wallet is only used as payer / admin / mint authority here; it is never copied into the app.
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { createHash } from "crypto";
import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";
import { createAssociatedTokenAccountIdempotentInstruction, createMintToInstruction, getAssociatedTokenAddressSync, getAccount } from "@solana/spl-token";

const ROOT = path.resolve(__dirname, "..");
const URL = process.env.ANCHOR_PROVIDER_URL ?? "https://api.devnet.solana.com";
if (!URL.includes("devnet")) throw new Error("devnet only: ANCHOR_PROVIDER_URL must be a devnet RPC");
const KEYS_FILE = path.join(ROOT, "app/src/devnet/demo-keys.json");
const DEPLOY = path.join(ROOT, "deploy/devnet.json");
const MIN_PAYER = 0.3 * LAMPORTS_PER_SOL;
const link = (s: string) => `https://explorer.solana.com/tx/${s}?cluster=devnet`;
const sha = (s: string) => Array.from(createHash("sha256").update(s).digest());
const usdc = (n: number) => BigInt(n) * 1_000_000n;

type Entry = { role: string; pubkey: string; secretKey: number[] };
const ROLES = ["farmer", "operator", "validator-operator-side", "validator-farmer-side", "validator-neutral"];

async function main() {
  // keys (never regenerated if the file exists)
  let file: any;
  if (fs.existsSync(KEYS_FILE)) file = JSON.parse(fs.readFileSync(KEYS_FILE, "utf8"));
  else {
    file = {
      warning: "Devnet demo keys. Public. Never use on mainnet.",
      note: "Anyone can use these keys. They only hold devnet SOL and test USDC.",
      keys: ROLES.map((role) => { const k = Keypair.generate(); return { role, pubkey: k.publicKey.toBase58(), secretKey: Array.from(k.secretKey) }; }),
    };
    fs.mkdirSync(path.dirname(KEYS_FILE), { recursive: true });
    fs.writeFileSync(KEYS_FILE, JSON.stringify(file, null, 2) + "\n");
    console.log("generated", KEYS_FILE);
  }
  const kp = (role: string) => Keypair.fromSecretKey(Uint8Array.from((file.keys as Entry[]).find((k) => k.role === role)!.secretKey));
  const farmer = kp("farmer"), operator = kp("operator");
  const vOp = kp("validator-operator-side"), vFarm = kp("validator-farmer-side"), vNeutral = kp("validator-neutral");

  const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync((process.env.ANCHOR_WALLET ?? "~/.config/solana/id.json").replace(/^~/, os.homedir()), "utf8"))));
  const conn = new Connection(URL, "confirmed");
  const provider = new anchor.AnchorProvider(conn, new anchor.Wallet(payer), { commitment: "confirmed" });
  const program = new Program(JSON.parse(fs.readFileSync(path.join(ROOT, "target/idl/kvali.json"), "utf8")), provider);
  const M = program.methods as any;
  const dep = JSON.parse(fs.readFileSync(DEPLOY, "utf8"));
  const MINT = new PublicKey(dep.usdcMint);
  const PID = program.programId;
  const pda = (seeds: Buffer[]) => PublicKey.findProgramAddressSync(seeds, PID)[0];
  const configPda = pda([Buffer.from("config")]);
  const operatorPda = pda([Buffer.from("operator"), operator.publicKey.toBuffer()]);
  const DRONE = sha("drone-serial-001");
  const certPda = pda([Buffer.from("cert"), operator.publicKey.toBuffer(), Buffer.from(DRONE)]);

  const bal = await conn.getBalance(payer.publicKey);
  console.log(`deploy wallet balance: ${(bal / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
  const want = [farmer, operator, vOp, vFarm, vNeutral].reduce((s, k) => s, 0);
  void want;
  const txs: Record<string, string> = dep.demoKeysSetup?.txs ?? {};
  const send = async (label: string, ixs: TransactionInstruction[], signers: Keypair[]) => {
    if ((await conn.getBalance(payer.publicKey)) < MIN_PAYER) throw new Error("payer below 0.3 SOL: stopping");
    const tx = new Transaction().add(...ixs);
    tx.feePayer = payer.publicKey;
    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
    tx.recentBlockhash = blockhash;
    tx.sign(payer, ...signers.filter((s) => !s.publicKey.equals(payer.publicKey)));
    const sig = await conn.sendRawTransaction(tx.serialize());
    const c = await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
    if (c.value.err) throw new Error(`${label} failed: ${JSON.stringify(c.value.err)}`);
    txs[label] = sig;
    console.log(`  ${label}  ${link(sig)}`);
    return sig;
  };

  // 1. SOL (top up to target)
  const targets: [Keypair, string, number][] = [[farmer, "farmer", 0.06], [operator, "operator", 0.05], [vOp, "validator-operator-side", 0.06], [vFarm, "validator-farmer-side", 0.03], [vNeutral, "validator-neutral", 0.03]];
  const need = targets.map(([k, n, t]) => ({ k, n, lam: Math.max(0, Math.round(t * LAMPORTS_PER_SOL) - 0) })).filter(() => true);
  let totalNeeded = 0;
  const topups: { k: Keypair; n: string; lam: number }[] = [];
  for (const [k, n, t] of targets) {
    const have = await conn.getBalance(k.publicKey);
    const lam = Math.round(t * LAMPORTS_PER_SOL) - have;
    if (lam > 0) { topups.push({ k, n, lam }); totalNeeded += lam; }
  }
  void need;
  if (bal - totalNeeded < MIN_PAYER) {
    const short = (MIN_PAYER + totalNeeded + 0.02 * LAMPORTS_PER_SOL - bal) / LAMPORTS_PER_SOL;
    throw new Error(`deploy wallet too low: send at least ${short.toFixed(2)} SOL to ${payer.publicKey.toBase58()}`);
  }
  if (topups.length) await send("fund demo keys (SOL)", topups.map((t) => SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: t.k.publicKey, lamports: t.lam })), []);

  // 2. ATAs + test USDC
  const fTok = getAssociatedTokenAddressSync(MINT, farmer.publicKey), oTok = getAssociatedTokenAddressSync(MINT, operator.publicKey);
  const have = async (a: PublicKey) => ((await conn.getAccountInfo(a)) ? (await getAccount(conn, a)).amount : 0n);
  const fH = await have(fTok), oH = await have(oTok);
  const ixs: TransactionInstruction[] = [
    createAssociatedTokenAccountIdempotentInstruction(payer.publicKey, fTok, farmer.publicKey, MINT),
    createAssociatedTokenAccountIdempotentInstruction(payer.publicKey, oTok, operator.publicKey, MINT),
  ];
  if (fH < usdc(1000)) ixs.push(createMintToInstruction(MINT, fTok, payer.publicKey, usdc(5000) - fH));
  if (oH < usdc(1000)) ixs.push(createMintToInstruction(MINT, oTok, payer.publicKey, usdc(5000) - oH));
  if (ixs.length > 2 || !(await conn.getAccountInfo(fTok)) || !(await conn.getAccountInfo(oTok))) await send("mint test USDC ($5,000 each)", ixs, []);
  else console.log("  test USDC already there");

  // 3. validator set
  const cfg = await (program.account as any).config.fetch(configPda);
  const want3 = [vOp, vFarm, vNeutral].map((k) => k.publicKey.toBase58());
  const cur = (cfg.validators as PublicKey[]).map((p) => p.toBase58());
  if (JSON.stringify(cur) !== JSON.stringify(want3)) {
    const ix = await M.setValidators([vOp, vFarm, vNeutral].map((k) => k.publicKey), 2, 2).accountsStrict({ admin: payer.publicKey, config: configPda }).instruction();
    await send("set_validators (demo keys)", [ix], []);
  } else console.log("  validator set already the demo keys");

  // 4. operator + certificate
  if (!(await conn.getAccountInfo(operatorPda))) {
    const ix = await M.registerOperator().accountsStrict({ authority: operator.publicKey, operator: operatorPda, systemProgram: SystemProgram.programId }).instruction();
    await send("register_operator", [ix], [operator]);
  } else console.log("  operator already registered");
  let cert: any = null;
  try { cert = await (program.account as any).certificate.fetch(certPda); } catch { /* none */ }
  if (!cert || cert.revoked || Number(cert.validUntil.toString()) < Date.now() / 1000 + 30 * 86400) {
    const ix = await M.issueCertificate(DRONE, 200, true, sha("calibration-report-demo-drone-001"), new BN(Math.floor(Date.now() / 1000) + 365 * 86400))
      .accountsStrict({ validator: vOp.publicKey, config: configPda, operatorAuthority: operator.publicKey, certificate: certPda, systemProgram: SystemProgram.programId }).instruction();
    await send("issue_certificate (demo drone, meter error 2%)", [ix], [vOp]);
  } else console.log("  calibration certificate already valid");

  // 5. deploy/devnet.json
  dep.validators = [
    { seat: "operator-side", pubkey: vOp.publicKey.toBase58() },
    { seat: "farmer-side", pubkey: vFarm.publicKey.toBase58() },
    { seat: "neutral", pubkey: vNeutral.publicKey.toBase58() },
  ];
  dep.farmer = farmer.publicKey.toBase58();
  dep.operator = operator.publicKey.toBase58();
  dep.demoKeysSetup = { date: new Date().toISOString(), note: "validators, farmer and operator are PUBLIC demo keys (app/src/devnet/demo-keys.json)", txs };
  fs.writeFileSync(DEPLOY, JSON.stringify(dep, null, 2) + "\n");
  console.log(`deploy wallet left: ${((await conn.getBalance(payer.publicKey)) / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
}
main().catch((e) => { console.error("ERROR:", e.message ?? e); process.exit(1); });
