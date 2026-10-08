// Devnet setup for Kvali (task k05). Idempotent. Devnet only.
// Run: ANCHOR_PROVIDER_URL=https://api.devnet.solana.com ANCHOR_WALLET=~/.config/solana/id.json \
//      npx ts-node scripts/devnet-setup.ts
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";
import { createMint, getOrCreateAssociatedTokenAccount } from "@solana/spl-token";

const ROOT = path.resolve(__dirname, "..");
const KEYS = path.join(ROOT, "keys");
const load = (f: string) =>
  Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(path.join(KEYS, f), "utf8"))));
const UPGRADEABLE_LOADER = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
const CHALLENGE_WINDOW_SECS = 60;

async function main() {
  const url = process.env.ANCHOR_PROVIDER_URL ?? "";
  if (!url.includes("devnet")) throw new Error("devnet only: set ANCHOR_PROVIDER_URL to a devnet RPC");
  const walletPath = (process.env.ANCHOR_WALLET ?? "~/.config/solana/id.json").replace(/^~/, os.homedir());
  const admin = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(walletPath, "utf8"))));
  const provider = new anchor.AnchorProvider(
    new anchor.web3.Connection(url, "confirmed"), new anchor.Wallet(admin), { commitment: "confirmed" });
  anchor.setProvider(provider);
  const conn = provider.connection;

  const idl = JSON.parse(fs.readFileSync(path.join(ROOT, "target/idl/kvali.json"), "utf8"));
  const program = new Program(idl, provider);
  const programId = program.programId;
  const [programData] = PublicKey.findProgramAddressSync([programId.toBuffer()], UPGRADEABLE_LOADER);
  const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], programId);

  const mintKp = load("usdc-mint.json");
  const treasuryOwner = load("treasury-owner.json");
  const validators = [
    { seat: "operator-side", kp: load("validator-operator-side.json") },
    { seat: "farmer-side", kp: load("validator-farmer-side.json") },
    { seat: "neutral", kp: load("validator-neutral.json") },
  ];

  // Test USDC mint (6 decimals, mint authority = deploy wallet)
  if (!(await conn.getAccountInfo(mintKp.publicKey))) {
    await createMint(conn, admin, admin.publicKey, null, 6, mintKp);
    console.log("created mint", mintKp.publicKey.toBase58());
  }
  // Treasury (owned by treasury-owner) and validator pool (owned by deploy wallet): plain ATAs
  const treasury = await getOrCreateAssociatedTokenAccount(conn, admin, mintKp.publicKey, treasuryOwner.publicKey);
  const pool = await getOrCreateAssociatedTokenAccount(conn, admin, mintKp.publicKey, admin.publicKey);

  let initSig: string | null = null;
  if (await conn.getAccountInfo(configPda)) {
    console.log("Config already exists, skipping initialize_config");
  } else {
    initSig = await (program.methods as any)
      .initializeConfig(validators.map((v) => v.kp.publicKey), 2, 2, new BN(CHALLENGE_WINDOW_SECS))
      .accounts({
        admin: admin.publicKey, config: configPda, program: programId, programData,
        usdcMint: mintKp.publicKey, treasury: treasury.address, validatorPool: pool.address,
      })
      .rpc();
    console.log("initialize_config", initSig);
  }

  const cfg = await (program.account as any).config.fetch(configPda);
  const fields = JSON.parse(JSON.stringify(cfg, (_k, v) => (v && v.toBase58 ? v.toBase58() : v)));
  console.log("Config:", JSON.stringify(fields, (_k, v) => (v && v.type === "BN" ? v : v), 2));

  // Merge into deploy/devnet.json (keeps existing deploy signature fields)
  const outPath = path.join(ROOT, "deploy/devnet.json");
  const prev = fs.existsSync(outPath) ? JSON.parse(fs.readFileSync(outPath, "utf8")) : {};
  const out = {
    ...prev,
    network: "devnet",
    programId: programId.toBase58(),
    programData: programData.toBase58(),
    upgradeAuthority: admin.publicKey.toBase58(),
    usdcMint: mintKp.publicKey.toBase58(),
    treasury: treasury.address.toBase58(),
    treasuryOwner: treasuryOwner.publicKey.toBase58(),
    validatorPool: pool.address.toBase58(),
    validatorPoolOwner: admin.publicKey.toBase58(),
    configPda: configPda.toBase58(),
    validators: validators.map((v) => ({ seat: v.seat, pubkey: v.kp.publicKey.toBase58() })),
    farmer: load("farmer.json").publicKey.toBase58(),
    operator: load("operator.json").publicKey.toBase58(),
    proofThreshold: 2, panelThreshold: 2,
    challengeWindowSecs: CHALLENGE_WINDOW_SECS,
    initializeConfigTx: initSig ?? prev.initializeConfigTx ?? null,
  };
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n");
}
main().catch((e) => { console.error(e); process.exit(1); });
