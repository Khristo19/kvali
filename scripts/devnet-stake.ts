// Validator staking on Solana DEVNET. Devnet only; refuses any other RPC. Idempotent.
//
//   npx ts-node --transpile-only scripts/devnet-stake.ts                 migrate Config if needed, demo params, stake the 3 demo validators
//   npx ts-node --transpile-only scripts/devnet-stake.ts --amount 500    stake target per validator in USDC (default 500)
//   npx ts-node --transpile-only scripts/devnet-stake.ts --set-min 500   only change min_validator_stake (USDC; 0 = staking off)
//   npx ts-node --transpile-only scripts/devnet-stake.ts --status        print the staking state, send nothing
//
// Needs ANCHOR_WALLET = deploy wallet (admin + test-USDC mint authority), loaded at runtime, never printed.
// The validators are the PUBLIC demo keys (app/src/devnet/demo-keys.json); they pay their own stake-account rent.
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID, createAssociatedTokenAccountIdempotentInstruction, createMintToInstruction, getAccount, getAssociatedTokenAddressSync,
} from "@solana/spl-token";

const ROOT = path.resolve(__dirname, "..");
const URL = process.env.ANCHOR_PROVIDER_URL ?? "https://api.devnet.solana.com";
if (!URL.includes("devnet")) throw new Error("devnet only: ANCHOR_PROVIDER_URL must be a devnet RPC");
const args = process.argv.slice(2);
const arg = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const SET_MIN = arg("--set-min");
const STATUS = args.includes("--status");
const AMOUNT = Number(arg("--amount") ?? 500);
const DEMO_COOLDOWN_SECS = 60; // D14-style demo value; real deployments use days
const CONFIG_V1_LEN = 372;
const MIN_VALIDATOR_SOL = 0.02 * LAMPORTS_PER_SOL;
const usdc = (n: number) => BigInt(Math.round(n * 1_000_000));
const fmt = (b: bigint | BN | number) => `$${(Number(b.toString()) / 1e6).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
const link = (s: string) => `https://explorer.solana.com/tx/${s}?cluster=devnet`;

async function main() {
  const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync((process.env.ANCHOR_WALLET ?? "~/.config/solana/id.json").replace(/^~/, os.homedir()), "utf8"))));
  const conn = new Connection(URL, "confirmed");
  const provider = new anchor.AnchorProvider(conn, new anchor.Wallet(payer), { commitment: "confirmed" });
  const program = new Program(JSON.parse(fs.readFileSync(path.join(ROOT, "target/idl/kvali.json"), "utf8")), provider);
  const M = program.methods as any;
  const A = program.account as any;
  const DEPLOY = path.join(ROOT, "deploy/devnet.json");
  const dep = JSON.parse(fs.readFileSync(DEPLOY, "utf8"));
  if (program.programId.toBase58() !== dep.programId) throw new Error("IDL program id does not match deploy/devnet.json");
  const MINT = new PublicKey(dep.usdcMint);
  const pda = (seeds: Buffer[]) => PublicKey.findProgramAddressSync(seeds, program.programId)[0];
  const configPda = pda([Buffer.from("config")]);
  const stakeVault = pda([Buffer.from("stake_vault")]);
  const stakePda = (v: PublicKey) => pda([Buffer.from("stake"), v.toBuffer()]);

  const demo = JSON.parse(fs.readFileSync(path.join(ROOT, "app/src/devnet/demo-keys.json"), "utf8")).keys as { role: string; secretKey: number[] }[];
  const kp = (role: string) => Keypair.fromSecretKey(Uint8Array.from(demo.find((k) => k.role === role)!.secretKey));
  const validators: [string, Keypair][] = [["operator-side", kp("validator-operator-side")], ["farmer-side", kp("validator-farmer-side")], ["neutral", kp("validator-neutral")]];

  const txs: Record<string, string> = dep.staking?.txs ?? {};
  const send = async (label: string, ixs: TransactionInstruction[], signers: Keypair[]) => {
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

  const printState = async () => {
    const cfg = await A.config.fetch(configPda);
    console.log(`config: min_validator_stake ${fmt(cfg.minValidatorStake)}, unstake cooldown ${cfg.unstakeCooldownSecs} s, slash ${cfg.slashBps / 100}%`);
    const out: any[] = [];
    for (const [seat, v] of validators) {
      const s = await A.validatorStake.fetchNullable(stakePda(v.publicKey));
      const row = s
        ? { seat, validator: v.publicKey.toBase58(), stakePda: stakePda(v.publicKey).toBase58(), amount: s.amount.toString(), slashed: s.slashed, unstaking: s.unstakeRequestedAt.toString() !== "0", openCosigns: s.openCosigns }
        : { seat, validator: v.publicKey.toBase58(), stakePda: stakePda(v.publicKey).toBase58(), amount: "0", slashed: false, unstaking: false, openCosigns: 0 };
      console.log(`  ${seat.padEnd(14)} ${row.validator}  staked ${fmt(BigInt(row.amount))}${row.slashed ? "  SLASHED" : ""}${row.unstaking ? "  unstaking" : ""}  open co-signs ${row.openCosigns}`);
      out.push(row);
    }
    const vault = (await conn.getAccountInfo(stakeVault)) ? (await getAccount(conn, stakeVault)).amount : 0n;
    console.log(`  stake vault ${stakeVault.toBase58()}: ${fmt(vault)}`);
    return { cfg, out };
  };

  // 1. Config migration (pre-staking Config is 372 bytes)
  const info = await conn.getAccountInfo(configPda);
  if (!info) throw new Error("Config not initialised on devnet");
  if (STATUS) { await printState(); return; }
  let fresh = false;
  if (info.data.length === CONFIG_V1_LEN) {
    const ix = await M.migrateConfig().accountsStrict({ admin: payer.publicKey, config: configPda, systemProgram: SystemProgram.programId }).instruction();
    await send("migrate_config", [ix], []);
    fresh = true;
  } else console.log(`  Config already migrated (${info.data.length} bytes)`);

  const cfg = await A.config.fetch(configPda);
  const setParams = async (label: string, min: bigint, cooldown: number, slashBps: number) => {
    const ix = await M.setStakingParams(new BN(min.toString()), new BN(cooldown), slashBps).accountsStrict({ admin: payer.publicKey, config: configPda }).instruction();
    await send(label, [ix], []);
  };

  // --set-min: only flip the minimum stake.
  if (SET_MIN !== undefined) {
    const min = usdc(Number(SET_MIN));
    await setParams(`set_staking_params (min ${fmt(min)})`, min, Number(cfg.unstakeCooldownSecs), cfg.slashBps);
    const { out } = await printState();
    if (min > 0n) {
      const ok = out.filter((r) => !r.slashed && !r.unstaking && BigInt(r.amount) >= min).length;
      if (ok < 2) console.warn(`WARNING: only ${ok} demo validator(s) have an active stake >= ${fmt(min)}; proofs need 2.`);
    }
    save(dep, txs, out, DEPLOY);
    return;
  }

  // 2. Demo staking params: keep min (0 until the app passes stake accounts), 60 s cooldown, 100% slash.
  if (fresh || Number(cfg.unstakeCooldownSecs) !== DEMO_COOLDOWN_SECS) {
    await setParams(`set_staking_params (min ${fmt(cfg.minValidatorStake)}, cooldown ${DEMO_COOLDOWN_SECS} s)`, BigInt(cfg.minValidatorStake.toString()), DEMO_COOLDOWN_SECS, cfg.slashBps);
  }

  // 3. Stake each demo validator up to AMOUNT test USDC.
  const target = usdc(AMOUNT);
  for (const [seat, v] of validators) {
    const s = await A.validatorStake.fetchNullable(stakePda(v.publicKey));
    if (s?.slashed) { console.log(`  ${seat}: slashed, skipped`); continue; }
    if (s && s.unstakeRequestedAt.toString() !== "0") { console.log(`  ${seat}: unstaking, skipped`); continue; }
    const have = BigInt(s?.amount.toString() ?? "0");
    if (have >= target) { console.log(`  ${seat}: already staked ${fmt(have)}`); continue; }
    const add = target - have;
    const tok = getAssociatedTokenAddressSync(MINT, v.publicKey);
    const bal = (await conn.getAccountInfo(tok)) ? (await getAccount(conn, tok)).amount : 0n;
    const ixs: TransactionInstruction[] = [];
    const sol = await conn.getBalance(v.publicKey);
    if (sol < MIN_VALIDATOR_SOL) ixs.push(SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: v.publicKey, lamports: MIN_VALIDATOR_SOL - sol }));
    ixs.push(createAssociatedTokenAccountIdempotentInstruction(payer.publicKey, tok, v.publicKey, MINT));
    if (bal < add) ixs.push(createMintToInstruction(MINT, tok, payer.publicKey, add - bal));
    ixs.push(await M.stakeValidator(new BN(add.toString())).accountsStrict({
      validator: v.publicKey, config: configPda, stake: stakePda(v.publicKey), stakeVault, usdcMint: MINT,
      validatorToken: tok, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
    }).instruction());
    await send(`stake_validator ${seat} (${fmt(add)} test USDC)`, ixs, [v]);
  }

  const { out } = await printState();
  save(dep, txs, out, DEPLOY);
  console.log(`deploy wallet: ${((await conn.getBalance(payer.publicKey)) / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
}

function save(dep: any, txs: Record<string, string>, stakes: any[], file: string) {
  dep.staking = { date: new Date().toISOString(), note: "demo validators staked with test USDC; min_validator_stake 0 keeps the pre-staking flow", stakeVault: undefined as string | undefined, stakes, txs };
  dep.staking.stakeVault = PublicKey.findProgramAddressSync([Buffer.from("stake_vault")], new PublicKey(dep.programId))[0].toBase58();
  fs.writeFileSync(file, JSON.stringify(dep, null, 2) + "\n");
}

main().catch((e) => { console.error("ERROR:", e.message ?? e); process.exit(1); });
