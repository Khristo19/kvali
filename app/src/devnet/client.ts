// Real Kvali program on Solana DEVNET. Signs with the public demo keys. Mirrors scripts/devnet-demo.ts.
// Every function returns real transaction signatures; nothing here is simulated.
import "./polyfill";
import { BN, Program, utils } from "@coral-xyz/anchor";
import { Connection, PublicKey, SystemProgram, Transaction, type Keypair, type TransactionInstruction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, createAssociatedTokenAccountIdempotentInstruction, createTransferInstruction, getAssociatedTokenAddressSync } from "@solana/spl-token";

import { sha256Hex } from "@/geo/sha256";
import deploy from "./deploy.json";
import idl from "./idl.json";
import { keyFor, keys } from "./keys";
import { friendlyMessage, rpcFetch } from "./rpc";

export const RPC_URL = "https://api.devnet.solana.com";
export const connection = new Connection(RPC_URL, { commitment: "confirmed", fetch: rpcFetch as unknown as typeof fetch, disableRetryOnRateLimit: true });
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

const anchorBs58 = utils.bytes.bs58;
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
  stake: (validator: PublicKey) => pda([te.encode("stake"), validator.toBytes()]),
  stakeVault: () => pda([te.encode("stake_vault")]),
};
const ata = (owner: PublicKey) => getAssociatedTokenAddressSync(MINT, owner);

const hexToBytes = (hex: string) => Array.from({ length: 32 }, (_, i) => parseInt(hex.slice(i * 2, i * 2 + 2), 16));
/** Hash any text to the 32 bytes the program stores. */
export const hash32 = (text: string) => hexToBytes(sha256Hex(text));
export const DRONE_SERIAL = "drone-serial-001";
const DRONE_HASH = Uint8Array.from(hash32(DRONE_SERIAL));
export const CHEMICAL_CODE = 7;
const ALL_VALIDATORS = ["validator-operator-side", "validator-farmer-side", "validator-neutral"];

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
  return new ChainError("rpc", friendlyMessage((e as Error)?.message ?? "Devnet request failed."), sig);
}

// ---- sending --------------------------------------------------------------
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function confirm(sig: string, lastValid: number) {
  let polls = 0;
  const giveUp = Date.now() + 150_000;
  for (;;) {
    try {
      const st = (await connection.getSignatureStatuses([sig], { searchTransactionHistory: false })).value[0];
      if (st) {
        if (st.err) return st.err;
        if (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized") return null;
      }
      if (++polls % 4 === 0 && (await connection.getBlockHeight("confirmed")) > lastValid) throw new ChainError("expired", "The transaction was not confirmed in time. Try again.", sig);
    } catch (e) {
      if (e instanceof ChainError) throw e;
      // the node is rate-limiting us: the transaction may well have landed, keep asking for a while
      if (Date.now() > giveUp) throw new ChainError("rpc", friendlyMessage((e as Error).message), sig);
    }
    await sleep(1200);
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
  chainJobId: number;
  farmer: string;
  operator: string;
  targetRateMlPerHa: number;
  toleranceBps: number;
  areaCoveredCha: number;
  createdAt: number;
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
  operatorRegistered: boolean;
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

async function decodeJob(key: PublicKey, j: any): Promise<ChainJob> {
  const vault = pdas.vault(key);
  return {
    chainJobId: Number(j.jobId.toString()),
    farmer: j.farmer.toBase58(),
    operator: j.operator.toBase58(),
    targetRateMlPerHa: j.targetRateMlPerHa,
    toleranceBps: j.toleranceBps,
    areaCoveredCha: j.areaCoveredCha,
    createdAt: Number(j.createdAt.toString()),
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

export async function readJob(chainJobId: number | bigint, farmer?: string | PublicKey): Promise<ChainJob | null> {
  const key = pdas.job(farmer ? new PublicKey(farmer) : farmerOf(), chainJobId);
  const j = await accountNs.job.fetchNullable(key);
  return j ? decodeJob(key, j) : null;
}

// Job account layout (after the 8-byte discriminator): farmer @8, operator @40, ... state byte @288 (0 = Posted).
const OFF_FARMER = 8, OFF_OPERATOR = 40, OFF_STATE = 288;
const b58 = (bytes: number[]) => anchorBs58.encode(Uint8Array.from(bytes));
const jobsWhere = async (offset: number, bytesB58: string): Promise<ChainJob[]> => {
  const rows: { publicKey: PublicKey; account: any }[] = await (program.account as any).job.all([{ memcmp: { offset, bytes: bytesB58 } }]);
  return Promise.all(rows.map((r) => decodeJob(r.publicKey, r.account)));
};

/** Open (Posted, not yet past their spray-by time) job accounts of every visitor, newest first. Filtered on the node by state. */
export async function listOpenJobs(): Promise<ChainJob[]> {
  const jobs = await jobsWhere(OFF_STATE, b58([0]));
  const now = Math.floor(Date.now() / 1000);
  return jobs.filter((j) => j.sprayDeadline > now).sort((a, b) => b.createdAt - a.createdAt);
}

/** Every job that involves THIS browser's wallets (as farmer or as operator), newest first. Used to restore state from the chain alone. */
export async function findMyJobs(): Promise<ChainJob[]> {
  const [asFarmer, asOperator] = await Promise.all([
    jobsWhere(OFF_FARMER, keys.farmer.publicKey.toBase58()),
    jobsWhere(OFF_OPERATOR, keys.operator.publicKey.toBase58()),
  ]);
  const all = new Map<string, ChainJob>();
  [...asFarmer, ...asOperator].forEach((j) => all.set(j.pda, j));
  return [...all.values()].sort((a, b) => b.createdAt - a.createdAt);
}

/** The job the demo operator currently holds on chain (accepted, not finished), if any. */
export async function readOperatorActiveJob(): Promise<ChainJob | null> {
  const op = await accountNs.operator.fetchNullable(pdas.operator(keys.operator.publicKey));
  if (!op?.activeJob) return null;
  const key: PublicKey = op.activeJob;
  const j = await accountNs.job.fetchNullable(key);
  return j ? decodeJob(key, j) : null;
}

export async function readSnapshot(chainJobId: number | bigint | null): Promise<ChainSnapshot> {
  const [farmer, operator, treasury, validatorPool, job, slot, fs, os, opAcct] = await Promise.all([
    tokenBalance(ata(keys.farmer.publicKey)),
    tokenBalance(ata(keys.operator.publicKey)),
    tokenBalance(TREASURY),
    tokenBalance(POOL),
    chainJobId === null ? Promise.resolve(null) : readJob(chainJobId),
    connection.getSlot("confirmed"),
    connection.getBalance(keys.farmer.publicKey),
    connection.getBalance(keys.operator.publicKey),
    accountNs.operator.fetchNullable(pdas.operator(keys.operator.publicKey)),
  ]);
  return { at: Date.now(), slot, operatorRegistered: !!opAcct, farmerSol: fs / 1e9, operatorSol: os / 1e9, usdc: { farmer, operator, treasury, validatorPool }, job };
}

/** Quick reachability probe for the mode switch. */
export async function probe(timeoutMs = 30000): Promise<boolean> {
  try {
    await Promise.race([connection.getLatestBlockhash("confirmed"), sleep(timeoutMs).then(() => Promise.reject(new Error("timeout")))]);
    return true;
  } catch {
    return false;
  }
}

// ---- actions --------------------------------------------------------------
// The job's farmer is whoever posted it: this browser's burner for its own jobs, another visitor's for jobs adopted from the chain.
let jobFarmer: PublicKey | null = null;
export function setJobFarmer(farmer: string | PublicKey | null) {
  jobFarmer = farmer ? new PublicKey(farmer) : null;
}
const farmerOf = () => jobFarmer ?? keys.farmer.publicKey;

/** The accounts a settle-like instruction needs, taken from the job account itself (farmer and operator may be other visitors). */
async function jobCtx(chainJobId: number) {
  const key = pdas.job(farmerOf(), chainJobId);
  const j = await accountNs.job.fetch(key);
  const farmer: PublicKey = j.farmer;
  const operator: PublicKey = j.operator;
  const hasOperator = !operator.equals(PublicKey.default);
  return { key, farmer, operator, hasOperator };
}
async function settleAccounts(chainJobId: number, caller: PublicKey) {
  const c = await jobCtx(chainJobId);
  return {
    caller, config: CONFIG, job: c.key, vault: pdas.vault(c.key), usdcMint: MINT, farmerToken: ata(c.farmer),
    farmerProfile: pdas.farmer(c.farmer), operator: c.hasOperator ? pdas.operator(c.operator) : null,
    operatorToken: c.hasOperator ? ata(c.operator) : null, treasuryToken: TREASURY, validatorPoolToken: POOL, tokenProgram: TOKEN_PROGRAM_ID,
  };
}
const signerMetas = (ks: Keypair[]) => ks.map((s) => ({ pubkey: s.publicKey, isSigner: true, isWritable: false }));
const stakeMeta = (validator: PublicKey) => ({ pubkey: pdas.stake(validator), isSigner: false, isWritable: true });
/** Stake accounts (writable) of the validators that have staked, in the order given; validators without a stake are skipped. */
async function stakeMetasFor(ks: Keypair[]) {
  const have = await Promise.all(ks.map((k) => accountNs.validatorStake.fetchNullable(pdas.stake(k.publicKey))));
  return ks.filter((_, i) => !!have[i]).map((k) => stakeMeta(k.publicKey));
}

// ---- validator staking (D16) ------------------------------------------------
export interface StakeInfo {
  validator: string;
  stakePda: string;
  amount: bigint;
  slashed: boolean;
  /** Unix seconds when unstaking was requested, 0 = not requested. */
  unstakeRequestedAt: number;
  openCosigns: number;
  proofsCosigned: number;
}
export interface StakingParams {
  minStake: bigint;
  cooldownSecs: number;
  slashBps: number;
}
export async function readStakingParams(): Promise<StakingParams> {
  const c = await accountNs.config.fetch(CONFIG);
  return { minStake: BigInt(c.minValidatorStake.toString()), cooldownSecs: Number(c.unstakeCooldownSecs.toString()), slashBps: c.slashBps };
}
/** Stake of each validator id (null = never staked). */
export async function readStakes(ids: string[]): Promise<Record<string, StakeInfo | null>> {
  const rows = await Promise.all(
    ids.map(async (id) => {
      const v = keyFor(id).publicKey;
      const s = await accountNs.validatorStake.fetchNullable(pdas.stake(v));
      const info: StakeInfo | null = s
        ? {
            validator: v.toBase58(),
            stakePda: pdas.stake(v).toBase58(),
            amount: BigInt(s.amount.toString()),
            slashed: !!s.slashed,
            unstakeRequestedAt: Number(s.unstakeRequestedAt.toString()),
            openCosigns: s.openCosigns,
            proofsCosigned: s.proofsCosigned,
          }
        : null;
      return [id, info] as const;
    }),
  );
  return Object.fromEntries(rows);
}
/** Add test USDC to a demo validator's stake (the public bank tops up its token account first). The bank pays the fee. */
export async function stakeMore(validatorId: string, amount: bigint) {
  const v = keyFor(validatorId);
  const tok = ata(v.publicKey);
  const have = await tokenBalance(tok);
  const ixs: TransactionInstruction[] = [createAssociatedTokenAccountIdempotentInstruction(keys.bank.publicKey, tok, v.publicKey, MINT)];
  if (have < amount) ixs.push(createTransferInstruction(ata(keys.bank.publicKey), tok, keys.bank.publicKey, amount - have));
  ixs.push(
    await M.stakeValidator(new BN(amount.toString())).accountsStrict({
      validator: v.publicKey, config: CONFIG, stake: pdas.stake(v.publicKey), stakeVault: pdas.stakeVault(), usdcMint: MINT,
      validatorToken: tok, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
    }).instruction(),
  );
  return send(ixs, keys.bank, [v]);
}
/** Permissionless, after the job is Released: frees one co-signer's lock on its stake. Throws NothingToRelease if already freed. */
export async function releaseCosign(chainJobId: number, validatorId: string) {
  const key = pdas.job(farmerOf(), chainJobId);
  const ix = await M.releaseCosign().accountsStrict({ caller: keys.bank.publicKey, job: key, stake: pdas.stake(keyFor(validatorId).publicKey) }).instruction();
  return send([ix], keys.bank);
}

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
  const sig = await send([ix], farmer);
  jobFarmer = farmer.publicKey;
  return { chainJobId: id, sig };
}

/** Frees this browser's operator if an earlier job of its own is stuck past its spray deadline. Returns the reclaim signature or null. */
async function clearStuckJob(): Promise<string | null> {
  const op = await accountNs.operator.fetchNullable(pdas.operator(keys.operator.publicKey));
  if (!op?.activeJob) return null;
  const stuck: PublicKey = op.activeJob;
  const sj = await accountNs.job.fetch(stuck);
  if (Number(sj.sprayDeadline.toString()) >= Math.floor(Date.now() / 1000) - 5) return null;
  const prev = jobFarmer;
  jobFarmer = sj.farmer;
  try {
    const ix = await M.reclaimExpired().accountsStrict(await settleAccounts(Number(sj.jobId.toString()), keys.bank.publicKey)).instruction();
    return await send([ix], keys.bank);
  } finally {
    jobFarmer = prev;
  }
}

export async function acceptJob(chainJobId: number, bond: bigint) {
  const operator = keys.operator;
  await clearStuckJob();
  const job = pdas.job(farmerOf(), chainJobId);
  const ix = await M.acceptJob(new BN(bond.toString())).accountsStrict({
    authority: operator.publicKey, certificate: pdas.cert(operator.publicKey, DRONE_HASH), operator: pdas.operator(operator.publicKey), config: CONFIG,
    job, vault: pdas.vault(job), usdcMint: MINT, operatorToken: ata(operator.publicKey), tokenProgram: TOKEN_PROGRAM_ID,
  }).instruction();
  return send([ix], operator);
}

/** The operator submits the proof hash; the listed validators co-sign in the same transaction (2 of 3 needed). */
export async function submitProof(chainJobId: number, p: { proofHashHex: string; litersMl: number; areaCoveredCha: number; validatorIds: string[] }) {
  const job = pdas.job(farmerOf(), chainJobId);
  const cos = p.validatorIds.map(keyFor);
  // Co-signers' stake accounts (writable) follow the signers; with a minimum stake set the program requires them.
  const ix = await M.submitProof(hexToBytes(p.proofHashHex), new BN(p.litersMl), p.areaCoveredCha)
    .accountsStrict({ authority: keys.operator.publicKey, config: CONFIG, job }).remainingAccounts([...signerMetas(cos), ...(await stakeMetasFor(cos))]).instruction();
  return send([ix], keys.operator, cos, true);
}

/** Anyone may settle after the window (the public bank pays the fee). Retries a few seconds if the cluster clock is a hair behind. */
export async function settle(chainJobId: number) {
  const payer = keys.bank;
  let last: unknown;
  for (let i = 0; i < 8; i++) {
    const ix = await M.settle().accountsStrict(await settleAccounts(chainJobId, payer.publicKey)).instruction();
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
  const job = pdas.job(farmerOf(), chainJobId);
  const ix = await M.challenge(hash32(evidenceText)).accountsStrict({
    farmer: keys.farmer.publicKey, config: CONFIG, job, vault: pdas.vault(job), usdcMint: MINT, farmerToken: ata(keys.farmer.publicKey), tokenProgram: TOKEN_PROGRAM_ID,
  }).instruction();
  return send([ix], keys.farmer);
}

export async function resolveChallenge(chainJobId: number, p: { validatorIds: string[]; upheld: boolean; reportText: string }) {
  const panel = p.validatorIds.map(keyFor);
  // Every demo validator's stake account + the stake vault: rejected rulings release the proof's co-signers, upheld ones would slash them.
  const stakes = await stakeMetasFor(ALL_VALIDATORS.map(keyFor));
  const extra = stakes.length ? [...stakes, { pubkey: pdas.stakeVault(), isSigner: false, isWritable: true }] : [];
  const ix = await M.resolveChallenge(p.upheld, hash32(p.reportText)).accountsStrict(await settleAccounts(chainJobId, panel[0].publicKey)).remainingAccounts([...signerMetas(panel), ...extra]).instruction();
  return send([ix], panel[0], panel);
}

/** After the spray-by deadline anyone may return payment and bond. The public bank pays the fee. */
export async function reclaimExpired(chainJobId: number) {
  const ix = await M.reclaimExpired().accountsStrict(await settleAccounts(chainJobId, keys.bank.publicKey)).instruction();
  return send([ix], keys.bank);
}

export async function cancelJob(chainJobId: number) {
  const ix = await M.cancelJob().accountsStrict(await settleAccounts(chainJobId, keys.farmer.publicKey)).instruction();
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

const IX_ACTION: Record<string, string> = {
  PostJob: "postJob", AcceptJob: "acceptJob", SubmitProof: "submitProof", Settle: "settle", Challenge: "challenge",
  ResolveChallenge: "resolveChallenge", ReclaimExpired: "reclaimExpired", CancelJob: "cancelJob",
};

/** The successful Kvali transactions that touched a job account, read from the chain (signature, kind, block time). Oldest first. */
export async function jobTxs(jobPda: string): Promise<{ action: string; sig: string; time?: number }[]> {
  const sigs = await connection.getSignaturesForAddress(new PublicKey(jobPda), { limit: 25 }, "confirmed");
  const rows = await Promise.all(
    sigs
      .filter((s) => !s.err)
      .map(async (s) => {
        try {
          const t = await connection.getTransaction(s.signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
          const log = (t?.meta?.logMessages ?? []).map((l) => l.match(/Instruction: (\w+)/)?.[1]).find((n) => n && IX_ACTION[n]);
          return log ? { action: IX_ACTION[log], sig: s.signature, time: t?.blockTime ?? s.blockTime ?? undefined } : null;
        } catch {
          return null;
        }
      }),
  );
  const out = rows.filter((r): r is { action: string; sig: string; time: number | undefined } => !!r);
  return out.sort((a, b) => (a.time ?? 0) - (b.time ?? 0));
}

// ---- wallet provisioning (burner wallets funded by the public bank) ---------
const sizeOf = (name: string) => ((program.account as any)[name]?.size as number | undefined) ?? 200;
const rent = (bytes: number) => connection.getMinimumBalanceForRentExemption(bytes);
export const TOKEN_ACCOUNT_BYTES = 165;
/** Extra bytes after the Anchor Job fields: the co-signer record (1 + 7 x 33). */
const JOB_RECORD_BYTES = 232;

export async function walletState(owner: PublicKey) {
  const [sol, usdc, opAcct] = await Promise.all([connection.getBalance(owner), tokenBalance(ata(owner)), accountNs.operator.fetchNullable(pdas.operator(owner))]);
  return { sol, usdc, registered: !!opAcct };
}

/** Lamports one farmer / operator needs. Farmer: token account + profile + (job + vault) per job. Operator: token account + operator account. */
export async function lamportsNeeded() {
  const [tok, job, profile, operator] = await Promise.all([rent(TOKEN_ACCOUNT_BYTES), rent(8 + sizeOf("job") + JOB_RECORD_BYTES), rent(8 + sizeOf("farmerProfile")), rent(8 + sizeOf("operator"))]);
  const fees = 50_000;
  return {
    farmerOneJob: tok + profile + job + tok + fees,
    farmerTarget: tok + profile + 3 * (job + tok) + 10 * fees,
    operatorMin: tok + operator + 5 * fees,
    operatorTarget: tok + operator + 20 * fees,
    validatorMin: Math.round((await rent(8 + sizeOf("certificate"))) * 2),
  };
}

export async function sendSol(from: Keypair, to: PublicKey, lamports: number) {
  return send([SystemProgram.transfer({ fromPubkey: from.publicKey, toPubkey: to, lamports })], from);
}

/** Bank signs as token owner, the new wallet pays the fee and its own token account. Works even if the bank has no SOL. */
export async function sendUsdcFromBank(to: Keypair, amount: bigint) {
  const ixs = [
    createAssociatedTokenAccountIdempotentInstruction(to.publicKey, ata(to.publicKey), to.publicKey, MINT),
    createTransferInstruction(ata(keys.bank.publicKey), ata(to.publicKey), keys.bank.publicKey, amount),
  ];
  return send(ixs, to, [keys.bank]);
}

/** register_operator (signed by the new operator) + issue_certificate (signed by the public demo validator who pays the certificate rent). */
export async function registerAndCertify() {
  const operator = keys.operator;
  const v = keys.vOperatorSide;
  const drone = DRONE_HASH;
  const ixs: TransactionInstruction[] = [];
  const opKey = pdas.operator(operator.publicKey);
  if (!(await accountNs.operator.fetchNullable(opKey))) {
    ixs.push(await M.registerOperator().accountsStrict({ authority: operator.publicKey, operator: opKey, systemProgram: SystemProgram.programId }).instruction());
  }
  ixs.push(
    await M.issueCertificate(Array.from(drone), 200, true, hash32("calibration-report-demo-drone-001"), new BN(Math.floor(Date.now() / 1000) + 365 * 86400))
      .accountsStrict({ validator: v.publicKey, config: CONFIG, operatorAuthority: operator.publicKey, certificate: pdas.cert(operator.publicKey, drone), systemProgram: SystemProgram.programId }).instruction(),
  );
  return send(ixs, operator, [v]);
}

export async function certificateValid(): Promise<boolean> {
  const c = await accountNs.certificate.fetchNullable(pdas.cert(keys.operator.publicKey, DRONE_HASH));
  return !!c && !c.revoked && Number(c.validUntil.toString()) > Date.now() / 1000 + 86400;
}

export async function airdrop(to: PublicKey, sol: number) {
  const sig = await connection.requestAirdrop(to, Math.round(sol * 1e9));
  const bh = await connection.getLatestBlockhash("confirmed");
  await connection.confirmTransaction({ signature: sig, ...bh }, "confirmed");
  return sig;
}
