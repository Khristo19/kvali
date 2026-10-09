// Test harness for the Kvali program.
//
// Runs the compiled program (target/deploy/kvali.so) inside LiteSVM, an
// in-process Solana runtime. Nothing here talks to a network: the Anchor
// client is only used to *build* instructions, and its Connection points at
// an unreachable local port. No devnet, no mainnet, no local validator.
//
// The program is installed as an UPGRADEABLE program (BPF Upgradeable
// Loader, Program + ProgramData accounts) whose upgrade authority is the
// test `admin` key, so the initialize_config upgrade-authority check is real.

import * as fs from "fs";
import * as path from "path";
import { execFileSync } from "child_process";
import { expect } from "chai";
import { AnchorProvider, BN, Program, Wallet } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  AccountLayout,
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
  createInitializeAccount3Instruction,
  createInitializeMint2Instruction,
  createMintToInstruction,
} from "@solana/spl-token";
import { Clock, FailedTransactionMetadata, LiteSVM, TransactionMetadata } from "litesvm";
import type { Kvali } from "../target/types/kvali";
export const ROOT = path.resolve(__dirname, "..");
const idlJson = JSON.parse(fs.readFileSync(path.join(ROOT, "target/idl/kvali.json"), "utf8"));
export const PROGRAM_ID = new PublicKey(idlJson.address);
export const UPGRADEABLE_LOADER = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
export const [PROGRAM_DATA] = PublicKey.findProgramAddressSync(
  [PROGRAM_ID.toBuffer()],
  UPGRADEABLE_LOADER,
);

export const usdc = (n: number) => BigInt(Math.round(n * 1_000_000));
export const bn = (x: bigint | number) => new BN(x.toString());
export const hash = (label: string) => {
  const b = Buffer.alloc(32);
  Buffer.from(label).copy(b);
  return Array.from(b);
};

/** Error name -> code, read from the IDL so tests assert both. */
export const ERRORS: Record<string, number> = Object.fromEntries(
  idlJson.errors.map((e: { name: string; code: number }) => [
    e.name.charAt(0).toUpperCase() + e.name.slice(1),
    e.code,
  ]),
);

// Anchor client used offline: builds instructions, never sends.
const offlineProvider = new AnchorProvider(
  new Connection("http://127.0.0.1:1"),
  new Wallet(Keypair.generate()),
  {},
);
export const program = new Program<Kvali>(idlJson as unknown as Kvali, offlineProvider);

export const START_TS = 1_791_000_000n; // ~ Oct 2026

export const pda = {
  config: () => PublicKey.findProgramAddressSync([Buffer.from("config")], PROGRAM_ID)[0],
  operator: (a: PublicKey) =>
    PublicKey.findProgramAddressSync([Buffer.from("operator"), a.toBuffer()], PROGRAM_ID)[0],
  farmer: (a: PublicKey) =>
    PublicKey.findProgramAddressSync([Buffer.from("farmer"), a.toBuffer()], PROGRAM_ID)[0],
  job: (farmer: PublicKey, id: bigint) => {
    const le = Buffer.alloc(8);
    le.writeBigUInt64LE(id);
    return PublicKey.findProgramAddressSync([Buffer.from("job"), farmer.toBuffer(), le], PROGRAM_ID)[0];
  },
  vault: (job: PublicKey) =>
    PublicKey.findProgramAddressSync([Buffer.from("vault"), job.toBuffer()], PROGRAM_ID)[0],
  stake: (v: PublicKey) =>
    PublicKey.findProgramAddressSync([Buffer.from("stake"), v.toBuffer()], PROGRAM_ID)[0],
  stakeVault: () => PublicKey.findProgramAddressSync([Buffer.from("stake_vault")], PROGRAM_ID)[0],
  cert: (op: PublicKey, drone: number[]) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("cert"), op.toBuffer(), Buffer.from(drone)],
      PROGRAM_ID,
    )[0],
};

export type Result = TransactionMetadata | FailedTransactionMetadata;

export function expectOk(r: Result, what = "transaction") {
  if (r instanceof FailedTransactionMetadata) {
    throw new Error(`${what} failed: ${r.err()}\n${r.meta().logs().join("\n")}`);
  }
}

/** Asserts the transaction failed with the given Anchor error name (and its code). */
export function expectErr(r: Result, name: string) {
  if (!(r instanceof FailedTransactionMetadata)) {
    throw new Error(`expected ${name}, but the transaction succeeded`);
  }
  const logs = r.meta().logs().join("\n");
  const m = logs.match(/Error Code: (\w+)\. Error Number: (\d+)/);
  expect(m, `no Anchor error in logs:\n${logs}`).to.not.equal(null);
  expect(m![1]).to.equal(name);
  if (ERRORS[name] !== undefined) expect(Number(m![2])).to.equal(ERRORS[name]);
}

/** Runs services/proof/src/settlement.ts (Node 22 type stripping) for the same inputs. */
export function settlementTs(amount: bigint, bond: bigint, outcome: string) {
  const script =
    `import { computeSettlement } from ${JSON.stringify(path.join(ROOT, "services/proof/src/settlement.ts"))};` +
    `const p = computeSettlement(${amount}n, ${bond}n, ${JSON.stringify(outcome)});` +
    `console.log(JSON.stringify(Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v.toString()]))));`;
  // The mocha run disables Node's type stripping (ts-node compiles the tests);
  // the child process needs it back to load settlement.ts as-is.
  const env = { ...process.env, NODE_OPTIONS: "" };
  const out = execFileSync(process.execPath, ["--no-warnings", "--input-type=module", "-e", script], {
    encoding: "utf8",
    env,
  });
  const o = JSON.parse(out.trim());
  return {
    farmer: BigInt(o.farmer),
    operator: BigInt(o.operator),
    kvali: BigInt(o.kvali),
    validators: BigInt(o.validators),
  };
}

export const DRONE = hash("drone-serial-001");
export const JOB = {
  amount: usdc(300),
  bond: usdc(300),
  area: 1700, // 17 ha
  rate: 10_000, // 10 L/ha
  tolerance: 1500, // ±15%
  liters: 170_000n, // 170 L over 17 ha = exactly 10 L/ha
};
export const START_BALANCE = usdc(1000);

export class Env {
  svm: LiteSVM;
  admin = Keypair.generate();
  farmer = Keypair.generate();
  operator = Keypair.generate();
  validators = [Keypair.generate(), Keypair.generate(), Keypair.generate()];
  outsider = Keypair.generate();
  mint = Keypair.generate();
  farmerToken!: PublicKey;
  operatorToken!: PublicKey;
  treasury!: PublicKey;
  pool!: PublicKey;
  outsiderToken!: PublicKey;
  nextJobId = 1n;

  constructor() {
    this.svm = new LiteSVM();
    const c = this.svm.getClock();
    c.unixTimestamp = START_TS;
    this.svm.setClock(c);
    for (const k of [this.admin, this.farmer, this.operator, this.outsider, ...this.validators]) {
      this.svm.airdrop(k.publicKey, BigInt(100 * LAMPORTS_PER_SOL));
    }
    this.deployUpgradeable(this.admin.publicKey);
    this.createMint();
    this.farmerToken = this.createTokenAccount(this.farmer.publicKey, START_BALANCE);
    this.operatorToken = this.createTokenAccount(this.operator.publicKey, START_BALANCE);
    this.outsiderToken = this.createTokenAccount(this.outsider.publicKey, START_BALANCE);
    this.treasury = this.createTokenAccount(Keypair.generate().publicKey, 0n);
    this.pool = this.createTokenAccount(Keypair.generate().publicKey, 0n);
  }

  /** Installs kvali.so under the BPF Upgradeable Loader with `authority`. */
  deployUpgradeable(authority: PublicKey) {
    const so = fs.readFileSync(path.join(ROOT, "target/deploy/kvali.so"));
    // UpgradeableLoaderState::ProgramData { slot: u64, upgrade_authority: Option<Pubkey> }
    const pd = Buffer.alloc(45 + so.length);
    pd.writeUInt32LE(3, 0);
    pd.writeBigUInt64LE(0n, 4);
    pd[12] = 1;
    authority.toBuffer().copy(pd, 13);
    so.copy(pd, 45);
    this.svm.setAccount(PROGRAM_DATA, {
      lamports: Number(this.svm.minimumBalanceForRentExemption(BigInt(pd.length))),
      data: pd,
      owner: UPGRADEABLE_LOADER,
      executable: false,
    });
    // UpgradeableLoaderState::Program { programdata_address }
    const prog = Buffer.alloc(36);
    prog.writeUInt32LE(2, 0);
    PROGRAM_DATA.toBuffer().copy(prog, 4);
    this.svm.setAccount(PROGRAM_ID, {
      lamports: Number(this.svm.minimumBalanceForRentExemption(36n)),
      data: prog,
      owner: UPGRADEABLE_LOADER,
      executable: true,
    });
  }

  // ---- generic -----------------------------------------------------------

  send(ixs: TransactionInstruction[], signers: Keypair[]): Result {
    const tx = new Transaction();
    tx.recentBlockhash = this.svm.latestBlockhash();
    tx.feePayer = signers[0].publicKey;
    tx.add(...ixs);
    tx.sign(...signers);
    const r = this.svm.sendTransaction(tx);
    this.svm.expireBlockhash();
    return r;
  }

  now(): bigint {
    return this.svm.getClock().unixTimestamp;
  }

  warp(secs: number | bigint) {
    const c: Clock = this.svm.getClock();
    c.unixTimestamp = c.unixTimestamp + BigInt(secs);
    c.slot = c.slot + 1n;
    this.svm.setClock(c);
  }

  balance(acc: PublicKey): bigint {
    const a = this.svm.getAccount(acc);
    if (!a) throw new Error(`no account ${acc.toBase58()}`);
    return AccountLayout.decode(Buffer.from(a.data)).amount;
  }

  fetch<T extends "config" | "job" | "operator" | "certificate" | "farmerProfile" | "validatorStake">(
    name: T,
    addr: PublicKey,
  ): any {
    const a = this.svm.getAccount(addr);
    if (!a) return null;
    return program.coder.accounts.decode(name, Buffer.from(a.data));
  }

  // ---- token setup -------------------------------------------------------

  createMint() {
    const lamports = Number(this.svm.minimumBalanceForRentExemption(BigInt(MINT_SIZE)));
    expectOk(
      this.send(
        [
          SystemProgram.createAccount({
            fromPubkey: this.admin.publicKey,
            newAccountPubkey: this.mint.publicKey,
            lamports,
            space: MINT_SIZE,
            programId: TOKEN_PROGRAM_ID,
          }),
          createInitializeMint2Instruction(this.mint.publicKey, 6, this.admin.publicKey, null),
        ],
        [this.admin, this.mint],
      ),
      "create mint",
    );
  }

  createTokenAccount(owner: PublicKey, amount: bigint): PublicKey {
    const acc = Keypair.generate();
    const lamports = Number(this.svm.minimumBalanceForRentExemption(BigInt(AccountLayout.span)));
    const ixs = [
      SystemProgram.createAccount({
        fromPubkey: this.admin.publicKey,
        newAccountPubkey: acc.publicKey,
        lamports,
        space: AccountLayout.span,
        programId: TOKEN_PROGRAM_ID,
      }),
      createInitializeAccount3Instruction(acc.publicKey, this.mint.publicKey, owner),
    ];
    if (amount > 0n) {
      ixs.push(createMintToInstruction(this.mint.publicKey, acc.publicKey, this.admin.publicKey, amount));
    }
    expectOk(this.send(ixs, [this.admin, acc]), "create token account");
    return acc.publicKey;
  }

  // ---- program instructions ----------------------------------------------

  async initConfigIx(
    signer: PublicKey,
    opts: { validators?: PublicKey[]; proof?: number; panel?: number; window?: number } = {},
  ) {
    return program.methods
      .initializeConfig(
        opts.validators ?? this.validators.map((v) => v.publicKey),
        opts.proof ?? 2,
        opts.panel ?? 2,
        bn(opts.window ?? 60),
      )
      .accountsStrict({
        admin: signer,
        config: pda.config(),
        program: PROGRAM_ID,
        programData: PROGRAM_DATA,
        usdcMint: this.mint.publicKey,
        treasury: this.treasury,
        validatorPool: this.pool,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
  }

  async initConfig(opts: Parameters<Env["initConfigIx"]>[1] = {}) {
    expectOk(this.send([await this.initConfigIx(this.admin.publicKey, opts)], [this.admin]), "initialize_config");
  }

  async setChallengeWindow(signer: Keypair, secs: number) {
    const ix = await program.methods
      .setChallengeWindow(bn(secs))
      .accountsStrict({ admin: signer.publicKey, config: pda.config() })
      .instruction();
    return this.send([ix], [signer]);
  }

  async setValidators(validators: PublicKey[], proof: number, panel: number) {
    const ix = await program.methods
      .setValidators(validators, proof, panel)
      .accountsStrict({ admin: this.admin.publicKey, config: pda.config() })
      .instruction();
    return this.send([ix], [this.admin]);
  }

  async registerOperator(op: Keypair = this.operator) {
    const ix = await program.methods
      .registerOperator()
      .accountsStrict({
        authority: op.publicKey,
        operator: pda.operator(op.publicKey),
        systemProgram: SystemProgram.programId,
      })
      .instruction();
    return this.send([ix], [op]);
  }

  async issueCertificate(
    validator: Keypair,
    opts: {
      operator?: PublicKey;
      drone?: number[];
      meterErrorBps?: number;
      passed?: boolean;
      validUntil?: bigint;
    } = {},
  ) {
    const op = opts.operator ?? this.operator.publicKey;
    const drone = opts.drone ?? DRONE;
    const ix = await program.methods
      .issueCertificate(
        drone,
        opts.meterErrorBps ?? 120,
        opts.passed ?? true,
        hash("calibration-report"),
        bn(opts.validUntil ?? this.now() + 365n * 86_400n),
      )
      .accountsStrict({
        validator: validator.publicKey,
        config: pda.config(),
        operatorAuthority: op,
        certificate: pda.cert(op, drone),
        systemProgram: SystemProgram.programId,
      })
      .instruction();
    return this.send([ix], [validator]);
  }

  async revokeCertificate(signers: Keypair[], op = this.operator.publicKey, drone = DRONE) {
    const ix = await program.methods
      .revokeCertificate()
      .accountsStrict({ caller: signers[0].publicKey, config: pda.config(), certificate: pda.cert(op, drone) })
      .remainingAccounts(signers.map((s) => ({ pubkey: s.publicKey, isSigner: true, isWritable: false })))
      .instruction();
    return this.send([ix], signers);
  }

  async postJob(
    opts: { amount?: bigint; area?: number; deadlineIn?: bigint; farmer?: Keypair; farmerToken?: PublicKey } = {},
  ) {
    const farmer = opts.farmer ?? this.farmer;
    const id = this.nextJobId++;
    const job = pda.job(farmer.publicKey, id);
    const ix = await program.methods
      .postJob(
        bn(id),
        bn(opts.amount ?? JOB.amount),
        hash("field-geojson"),
        7,
        JOB.rate,
        JOB.tolerance,
        opts.area ?? JOB.area,
        bn(this.now() + (opts.deadlineIn ?? 7n * 86_400n)),
      )
      .accountsStrict({
        farmer: farmer.publicKey,
        config: pda.config(),
        usdcMint: this.mint.publicKey,
        farmerToken: opts.farmerToken ?? this.farmerToken,
        farmerProfile: pda.farmer(farmer.publicKey),
        job,
        vault: pda.vault(job),
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
    const r = this.send([ix], [farmer]);
    return { r, job, vault: pda.vault(job), id };
  }

  async acceptJob(
    job: PublicKey,
    bond: bigint = JOB.bond,
    opts: { op?: Keypair; opToken?: PublicKey; drone?: number[] } = {},
  ) {
    const op = opts.op ?? this.operator;
    const ix = await program.methods
      .acceptJob(bn(bond))
      .accountsStrict({
        authority: op.publicKey,
        certificate: pda.cert(op.publicKey, opts.drone ?? DRONE),
        operator: pda.operator(op.publicKey),
        config: pda.config(),
        job,
        vault: pda.vault(job),
        usdcMint: this.mint.publicKey,
        operatorToken: opts.opToken ?? this.operatorToken,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .instruction();
    return this.send([ix], [op]);
  }

  async submitProof(
    job: PublicKey,
    signers: Keypair[],
    opts: { liters?: bigint; area?: number; op?: Keypair; stakes?: PublicKey[] } = {},
  ) {
    const op = opts.op ?? this.operator;
    const ix = await program.methods
      .submitProof(hash("proof-manifest"), bn(opts.liters ?? JOB.liters), opts.area ?? JOB.area)
      .accountsStrict({ authority: op.publicKey, config: pda.config(), job })
      .remainingAccounts([
        ...signers.map((s) => ({ pubkey: s.publicKey, isSigner: true, isWritable: false })),
        ...(opts.stakes ?? []).map((v) => ({ pubkey: pda.stake(v), isSigner: false, isWritable: true })),
      ])
      .instruction();
    const all = [op, ...signers.filter((s) => !s.publicKey.equals(op.publicKey))];
    return this.send([ix], all);
  }

  async challenge(job: PublicKey) {
    const ix = await program.methods
      .challenge(hash("farmer-evidence"))
      .accountsStrict({
        farmer: this.farmer.publicKey,
        config: pda.config(),
        job,
        vault: pda.vault(job),
        usdcMint: this.mint.publicKey,
        farmerToken: this.farmerToken,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .instruction();
    return this.send([ix], [this.farmer]);
  }

  private settleAccounts(job: PublicKey, caller: PublicKey, withOperator = true) {
    return {
      caller,
      config: pda.config(),
      job,
      vault: pda.vault(job),
      usdcMint: this.mint.publicKey,
      farmerToken: this.farmerToken,
      farmerProfile: pda.farmer(this.farmer.publicKey),
      operator: withOperator ? pda.operator(this.operator.publicKey) : null,
      operatorToken: withOperator ? this.operatorToken : null,
      treasuryToken: this.treasury,
      validatorPoolToken: this.pool,
      tokenProgram: TOKEN_PROGRAM_ID,
    };
  }

  /** Permissionless: called by an outsider to prove anyone can settle. */
  async settle(job: PublicKey, caller: Keypair = this.outsider) {
    const ix = await program.methods
      .settle()
      .accountsStrict(this.settleAccounts(job, caller.publicKey))
      .instruction();
    return this.send([ix], [caller]);
  }

  async resolveChallenge(
    job: PublicKey,
    upheld: boolean,
    panel: Keypair[],
    opts: { stakes?: PublicKey[]; stakeVault?: boolean } = {},
  ) {
    const ix = await program.methods
      .resolveChallenge(upheld, hash("inspection-report"))
      .accountsStrict(this.settleAccounts(job, panel[0].publicKey))
      .remainingAccounts([
        ...panel.map((s) => ({ pubkey: s.publicKey, isSigner: true, isWritable: false })),
        ...(opts.stakes ?? []).map((v) => ({ pubkey: pda.stake(v), isSigner: false, isWritable: true })),
        ...(opts.stakeVault ? [{ pubkey: pda.stakeVault(), isSigner: false, isWritable: true }] : []),
      ])
      .instruction();
    return this.send([ix], panel);
  }

  // ---- staking -------------------------------------------------------------

  /** Token accounts of the test validators, created on first use. */
  validatorTokens = new Map<string, PublicKey>();
  validatorToken(v: Keypair): PublicKey {
    const k = v.publicKey.toBase58();
    if (!this.validatorTokens.has(k)) this.validatorTokens.set(k, this.createTokenAccount(v.publicKey, START_BALANCE));
    return this.validatorTokens.get(k)!;
  }

  async setStakingParams(signer: Keypair, minStake: bigint, cooldown = 60, slashBps = 10_000) {
    const ix = await program.methods
      .setStakingParams(bn(minStake), bn(cooldown), slashBps)
      .accountsStrict({ admin: signer.publicKey, config: pda.config() })
      .instruction();
    return this.send([ix], [signer]);
  }

  async migrateConfig(signer: Keypair = this.admin) {
    const ix = await program.methods
      .migrateConfig()
      .accountsStrict({ admin: signer.publicKey, config: pda.config(), systemProgram: SystemProgram.programId })
      .instruction();
    return this.send([ix], [signer]);
  }

  async stake(v: Keypair, amount: bigint) {
    const ix = await program.methods
      .stakeValidator(bn(amount))
      .accountsStrict({
        validator: v.publicKey,
        config: pda.config(),
        stake: pda.stake(v.publicKey),
        stakeVault: pda.stakeVault(),
        usdcMint: this.mint.publicKey,
        validatorToken: this.validatorToken(v),
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
    return this.send([ix], [v]);
  }

  async requestUnstake(v: Keypair) {
    const ix = await program.methods
      .requestUnstake()
      .accountsStrict({ validator: v.publicKey, config: pda.config(), stake: pda.stake(v.publicKey) })
      .instruction();
    return this.send([ix], [v]);
  }

  async withdrawStake(v: Keypair) {
    const ix = await program.methods
      .withdrawStake()
      .accountsStrict({
        validator: v.publicKey,
        config: pda.config(),
        stake: pda.stake(v.publicKey),
        stakeVault: pda.stakeVault(),
        usdcMint: this.mint.publicKey,
        validatorToken: this.validatorToken(v),
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .instruction();
    return this.send([ix], [v]);
  }

  async releaseCosign(job: PublicKey, v: PublicKey, caller: Keypair = this.outsider) {
    const ix = await program.methods
      .releaseCosign()
      .accountsStrict({ caller: caller.publicKey, job, stake: pda.stake(v) })
      .instruction();
    return this.send([ix], [caller]);
  }

  stakeOf(v: Keypair) {
    return this.fetch("validatorStake", pda.stake(v.publicKey));
  }

  async reclaimExpired(job: PublicKey, caller: Keypair = this.outsider) {
    const ix = await program.methods
      .reclaimExpired()
      .accountsStrict(this.settleAccounts(job, caller.publicKey))
      .instruction();
    return this.send([ix], [caller]);
  }

  async cancelJob(job: PublicKey, caller: Keypair = this.farmer) {
    const ix = await program.methods
      .cancelJob()
      .accountsStrict(this.settleAccounts(job, caller.publicKey, false))
      .instruction();
    return this.send([ix], [caller]);
  }

  /** Config + registered operator + valid certificate: ready to post and accept jobs. */
  async ready(opts: Parameters<Env["initConfigIx"]>[1] = {}) {
    await this.initConfig(opts);
    expectOk(await this.registerOperator(), "register_operator");
    expectOk(await this.issueCertificate(this.validators[0]), "issue_certificate");
  }

  /** Posts and accepts a job, then submits a proof signed by validators 0 and 1. */
  async provenJob() {
    const j = await this.postJob();
    expectOk(j.r, "post_job");
    expectOk(await this.acceptJob(j.job), "accept_job");
    expectOk(await this.submitProof(j.job, [this.validators[0], this.validators[1]]), "submit_proof");
    return j;
  }
}
