// Real Kvali program on Solana DEVNET. Signs with the public demo keys. Mirrors scripts/devnet-demo.ts.
// Every function returns real transaction signatures; nothing here is simulated.
import "./polyfill";
import { BN, Program } from "@coral-xyz/anchor";
import { Connection, PublicKey, SystemProgram, Transaction, type Keypair, type TransactionInstruction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";

import { sha256Hex } from "@/geo/sha256";
import deploy from "./deploy.json";
import idl from "./idl.json";
import { keyFor, keys } from "./keys";

export const RPC_URL = "https://api.devnet.solana.com";
export const connection = new Connection(RPC_URL, "confirmed");
export const explorerTx = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
export const explorerAddr = (a: string) => `https://explorer.solana.com/address/${a}?cluster=devnet`;

export const PROGRAM_ID = new PublicKey(deploy.programId);
const MINT = new PublicKey(deploy.usdcMint);
const TREASURY = new PublicKey(deploy.treasury);
const POOL = new PublicKey(deploy.validatorPool);
const CONFIG = new PublicKey(deploy.configPda);
export const addresses = { programId: PROGRAM_ID, usdcMint: MINT, treasury: TREASURY, validatorPool: POOL, config: CONFIG };

// Anchor Program with a read-only provider: we build instructions and sign ourselves (no wallet adapter in the browser).
const program = new Program(idl as never, { connection } as never);
const M = program.methods as never as Record<string, (...a: unknown[]) => { accountsStrict: (a: object) => { remainingAccounts: (m: object[]) => { instruction: () => Promise<TransactionInstruction> }; instruction: () => Promise<TransactionInstruction> } }>;
const accountNs = program.account as never as Record<string, { fetch: (k: PublicKey) => Promise<any>; fetchNullable: (k: PublicKey) => Promise<any> }>;

const pda = (seeds: Uint8Array[]) => PublicKey.findProgramAddressSync(seeds, PROGRAM_ID)[0];
const te = new TextEncoder();
const u64le = (n: number | bigint) => {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, BigInt(n), true);
  return b;
};
export const pdas = {
  operator: (authority: PublicKey) => pda([te.encode("operator"), authority.toBytes()]),
  farmer: (authority: PublicKey) => pda([te.encode("farmer"), authority.toBytes()]),
  cert: (operator: PublicKey, drone: Uint8Array) => pda([te.encode("cert"), operator.toBytes(), drone]),
  job: (farmer: PublicKey, id: number | bigint) => pda([te.encode("job"), farmer.toBytes(), u64le(id)]),
  vault: (job: PublicKey) => pda([te.encode("vault"), job.toBytes()]),
};
const ata = (owner: PublicKey) => getAssociatedTokenAddressSync(MINT, owner);

const hexToBytes = (hex: string) => Array.from({ length: 32 }, (_, i) => parseInt(hex.slice(i * 2, i * 2 + 2), 16));
/** Hash any text to the 32 bytes the program stores. */
export const hash32 = (text: string) => hexToBytes(sha256Hex(text));
export const DRONE_SERIAL = "drone-serial-001";
const DRONE_HASH = Uint8Array.from(hash32(DRONE_SERIAL));
export const CHEMICAL_CODE = 7;

// ---- errors ---------------------------------------------------------------
export class ChainError extends Error {
  code: string;
  sig: string | null;
  constructor(code: string, message: string, sig: string | null = null) {
    super(message);
    this.name = "ChainError";
    this.code = code;
    this.sig = sig;
  }
}
const ERR_RE = /Error Code: (\w+)\. Error Number: (\d+)\. Error Message: ([^\n]*)/;
function toChainError(e: unknown, logs?: string[] | null, sig: string | null = null): ChainError {
  const text = [...(logs ?? []), (e as Error)?.message ?? String(e)].join("\n");
  const m = text.match(ERR_RE);
  if (m) return new ChainError(m[1], `${m[1]}: ${m[3].replace(/\.$/, "")}`, sig);
  if (/insufficient funds|0x1\b/i.test(text)) return new ChainError("InsufficientFunds", "Not enough funds for this step (devnet SOL or test USDC).", sig);
  return new ChainError("rpc", (e as Error)?.message ?? "Devnet request failed.", sig);
}

// ---- sending --------------------------------------------------------------
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function confirm(sig: string, lastValid: number) {
  for (;;) {
    const st = (await connection.getSignatureStatuses([sig], { searchTransactionHistory: false })).value[0];
    if (st) {
      if (st.err) return st.err;
      if (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized") return null;
    }
    if ((await connection.getBlockHeight("confirmed")) > lastValid) throw new ChainError("expired", "The transaction was not confirmed in time. Try again.", sig);
    await sleep(700);
  }
}

/**
 * Sign with the acting key (fee payer) plus co-signers and send. `landFailure` sends without preflight so a refused
 * instruction still lands on chain with a shareable Explorer link (used for submit_proof).
 */
async function send(ixs: TransactionInstruction[], payer: Keypair, cosigners: Keypair[] = [], landFailure = false): Promise<string> {
  const tx = new Transaction().add(...ixs);
  tx.feePayer = payer.publicKey;
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  const all = [payer, ...cosigners.filter((c) => !c.publicKey.equals(payer.publicKey))];
  tx.sign(...all);
  let sig: string;
  try {
    sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: landFailure, preflightCommitment: "confirmed" });
  } catch (e) {
    const logs = (e as { logs?: string[] }).logs ?? (e as { transactionLogs?: string[] }).transactionLogs;
    throw toChainError(e, logs);
  }
  const err = await confirm(sig, lastValidBlockHeight);
  if (err) {
    const t = await connection.getTransaction(sig, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
    throw toChainError(JSON.stringify(err), t?.meta?.logMessages, sig);
  }
  return sig;
}

// ---- reads ----------------------------------------------------------------
export interface ChainJob {
  pda: string;
  vault: string;
  state: string;
  amount: bigint;
  bond: bigint;
  challengeBond: bigint;
  areaCha: number;
  litersMl: number;
  proofHash: string;
  fieldHash: string;
  sprayDeadline: number;
  challengeDeadline: number;
  vaultBalance: bigint;
}
export interface ChainSnapshot {
  at: number;
  slot: number;
  farmerSol: number;
  operatorSol: number;
  usdc: { farmer: bigint; operator: bigint; treasury: bigint; validatorPool: bigint };
  job: ChainJob | null;
}

const hex = (a: number[]) => a.map((b) => b.toString(16).padStart(2, "0")).join("");
const stateName = (s: object) => Object.keys(s)[0].replace(/^./, (c) => c.toUpperCase());

async function tokenBalance(a: PublicKey): Promise<bigint> {
  try {
    return BigInt((await connection.getTokenAccountBalance(a, "confirmed")).value.amount);
  } catch {
    return 0n; // account does not exist (e.g. the vault after the job ended)
  }
}

export async function readJob(chainJobId: number | bigint): Promise<ChainJob | null> {
  const key = pdas.job(keys.farmer.publicKey, chainJobId);
  const j = await accountNs.job.fetchNullable(key);
  if (!j) return null;
  const vault = pdas.vault(key);
  return {
    pda: key.toBase58(),
    vault: vault.toBase58(),
    state: stateName(j.state),
    amount: BigInt(j.amount.toString()),
    bond: BigInt(j.bondAmount.toString()),
    challengeBond: BigInt(j.challengeBond.toString()),
    areaCha: j.areaCha,
    litersMl: Number(j.litersMl.toString()),
    proofHash: hex(j.proofHash),
    fieldHash: hex(j.fieldHash),
    sprayDeadline: Number(j.sprayDeadline.toString()),
    challengeDeadline: Number(j.challengeDeadline.toString()),
    vaultBalance: await tokenBalance(vault),
  };
}

export async function readSnapshot(chainJobId: number | bigint | null): Promise<ChainSnapshot> {
  const [farmer, operator, treasury, validatorPool, job, slot, fs, os] = await Promise.all([
    tokenBalance(ata(keys.farmer.publicKey)),
    tokenBalance(ata(keys.operator.publicKey)),
    tokenBalance(TREASURY),
    tokenBalance(POOL),
    chainJobId === null ? Promise.resolve(null) : readJob(chainJobId),
    connection.getSlot("confirmed"),
    connection.getBalance(keys.farmer.publicKey),
    connection.getBalance(keys.operator.publicKey),
  ]);
  return { at: Date.now(), slot, farmerSol: fs / 1e9, operatorSol: os / 1e9, usdc: { farmer, operator, treasury, validatorPool }, job };
}

/** Quick reachability probe for the mode switch. */
export async function probe(timeoutMs = 6000): Promise<boolean> {
  try {
    await Promise.race([connection.getLatestBlockhash("confirmed"), sleep(timeoutMs).then(() => Promise.reject(new Error("timeout")))]);
    return true;
  } catch {
    return false;
  }
}

// ---- actions --------------------------------------------------------------
const settleAccounts = (job: PublicKey, caller: PublicKey) => ({
  caller, config: CONFIG, job, vault: pdas.vault(job), usdcMint: MINT, farmerToken: ata(keys.farmer.publicKey),
  farmerProfile: pdas.farmer(keys.farmer.publicKey), operator: pdas.operator(keys.operator.publicKey),
  operatorToken: ata(keys.operator.publicKey), treasuryToken: TREASURY, validatorPoolToken: POOL, tokenProgram: TOKEN_PROGRAM_ID,
});
const signerMetas = (ks: Keypair[]) => ks.map((s) => ({ pubkey: s.publicKey, isSigner: true, isWritable: false }));

/** Farmer posts a job and locks `amount` (USDC base units) in the vault. Returns the on-chain job id. */
export async function postJob(p: { amount: bigint; fieldHashHex: string; areaCha: number; targetRateMlPerHa: number; toleranceBps: number; sprayDeadline: number }) {
  const farmer = keys.farmer;
  const id = Date.now();
  const job = pdas.job(farmer.publicKey, id);
  const ix = await M.postJob(new BN(id), new BN(p.amount.toString()), hexToBytes(p.fieldHashHex), CHEMICAL_CODE, p.targetRateMlPerHa, p.toleranceBps, p.areaCha, new BN(p.sprayDeadline))
    .accountsStrict({
      farmer: farmer.publicKey, config: CONFIG, usdcMint: MINT, farmerToken: ata(farmer.publicKey), farmerProfile: pdas.farmer(farmer.publicKey),
      job, vault: pdas.vault(job), tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
    }).instruction();
  return { chainJobId: id, sig: await send([ix], farmer) };
}

/** Frees the operator if an earlier job (for example a refused pump-off job) is stuck past its spray deadline. Returns the reclaim signature or null. */
async function clearStuckJob(): Promise<string | null> {
  const op = await accountNs.operator.fetchNullable(pdas.operator(keys.operator.publicKey));
  if (!op?.activeJob) return null;
  const stuck: PublicKey = op.activeJob;
  const sj = await accountNs.job.fetch(stuck);
  if (Number(sj.sprayDeadline.toString()) >= Math.floor(Date.now() / 1000) - 5) return null;
  const ix = await M.reclaimExpired().accountsStrict(settleAccounts(stuck, keys.operator.publicKey)).instruction();
  return send([ix], keys.operator);
}

export async function acceptJob(chainJobId: number, bond: bigint) {
  const operator = keys.operator;
  await clearStuckJob();
  const job = pdas.job(keys.farmer.publicKey, chainJobId);
  const ix = await M.acceptJob(new BN(bond.toString())).accountsStrict({
    authority: operator.publicKey, certificate: pdas.cert(operator.publicKey, DRONE_HASH), operator: pdas.operator(operator.publicKey), config: CONFIG,
    job, vault: pdas.vault(job), usdcMint: MINT, operatorToken: ata(operator.publicKey), tokenProgram: TOKEN_PROGRAM_ID,
  }).instruction();
  return send([ix], operator);
}

/** The operator submits the proof hash; the listed validators co-sign in the same transaction (2 of 3 needed). */
export async function submitProof(chainJobId: number, p: { proofHashHex: string; litersMl: number; areaCoveredCha: number; validatorIds: string[] }) {
  const job = pdas.job(keys.farmer.publicKey, chainJobId);
  const cos = p.validatorIds.map(keyFor);
  const ix = await M.submitProof(hexToBytes(p.proofHashHex), new BN(p.litersMl), p.areaCoveredCha)
    .accountsStrict({ authority: keys.operator.publicKey, config: CONFIG, job }).remainingAccounts(signerMetas(cos)).instruction();
  return send([ix], keys.operator, cos, true);
}

/** Anyone may settle after the window. Retries a few seconds if the cluster clock is a hair behind. */
export async function settle(chainJobId: number) {
  const job = pdas.job(keys.farmer.publicKey, chainJobId);
  const payer = keys.farmer;
  let last: unknown;
  for (let i = 0; i < 8; i++) {
    const ix = await M.settle().accountsStrict(settleAccounts(job, payer.publicKey)).instruction();
    try {
      return await send([ix], payer);
    } catch (e) {
      last = e;
      if (!(e instanceof ChainError) || e.code !== "WindowOpen") throw e;
      await sleep(2500);
    }
  }
  throw last;
}

export async function challenge(chainJobId: number, evidenceText: string) {
  const job = pdas.job(keys.farmer.publicKey, chainJobId);
  const ix = await M.challenge(hash32(evidenceText)).accountsStrict({
    farmer: keys.farmer.publicKey, config: CONFIG, job, vault: pdas.vault(job), usdcMint: MINT, farmerToken: ata(keys.farmer.publicKey), tokenProgram: TOKEN_PROGRAM_ID,
  }).instruction();
  return send([ix], keys.farmer);
}

export async function resolveChallenge(chainJobId: number, p: { validatorIds: string[]; upheld: boolean; reportText: string }) {
  const job = pdas.job(keys.farmer.publicKey, chainJobId);
  const panel = p.validatorIds.map(keyFor);
  const ix = await M.resolveChallenge(p.upheld, hash32(p.reportText)).accountsStrict(settleAccounts(job, panel[0].publicKey)).remainingAccounts(signerMetas(panel)).instruction();
  return send([ix], panel[0], panel);
}

export async function reclaimExpired(chainJobId: number) {
  const job = pdas.job(keys.farmer.publicKey, chainJobId);
  const ix = await M.reclaimExpired().accountsStrict(settleAccounts(job, keys.farmer.publicKey)).instruction();
  return send([ix], keys.farmer);
}

export async function cancelJob(chainJobId: number) {
  const job = pdas.job(keys.farmer.publicKey, chainJobId);
  const ix = await M.cancelJob().accountsStrict(settleAccounts(job, keys.farmer.publicKey)).instruction();
  return send([ix], keys.farmer);
}

/** Calibration certificate for a drone, issued by a demo validator (the setup script already did this for the demo drone). */
export async function issueCertificate(p: { droneSerial: string; meterErrorBps: number; validUntil: number }) {
  const v = keys.vOperatorSide;
  const drone = Uint8Array.from(hash32(p.droneSerial));
  const ix = await M.issueCertificate(Array.from(drone), p.meterErrorBps, true, hash32("calibration-report"), new BN(p.validUntil))
    .accountsStrict({ validator: v.publicKey, config: CONFIG, operatorAuthority: keys.operator.publicKey, certificate: pdas.cert(keys.operator.publicKey, drone), systemProgram: SystemProgram.programId }).instruction();
  return send([ix], v);
}

export async function revokeCertificate(validatorIds: string[]) {
  const panel = validatorIds.map(keyFor);
  const ix = await M.revokeCertificate().accountsStrict({ caller: panel[0].publicKey, config: CONFIG, certificate: pdas.cert(keys.operator.publicKey, DRONE_HASH) })
    .remainingAccounts(signerMetas(panel)).instruction();
  return send([ix], panel[0], panel);
}
