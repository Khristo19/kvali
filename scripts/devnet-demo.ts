// Kvali end-to-end demo on Solana DEVNET (task k08). Devnet only; refuses any other network.
//
//   npm run demo:devnet                  scenarios A (honest, settled) and B (pump-off record, rejected)
//   npm run demo:devnet -- --challenge   also scenario C (farmer challenges, panel upholds, refund)
//   npm run demo:devnet -- --dry-run     print the plan, send nothing
//
// The 60 s challenge window is real; there is no skip option.
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execFileSync } from "child_process";
import { createHash } from "crypto";
import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import {
  Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, TransactionInstruction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID, createMintToInstruction, getAccount, getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
} from "@solana/spl-token";

const ROOT = path.resolve(__dirname, "..");
const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const CHALLENGE = args.includes("--challenge");
if (args.includes("--skip-wait")) throw new Error("--skip-wait is not allowed: the challenge window is real.");

const URL = process.env.ANCHOR_PROVIDER_URL ?? "https://api.devnet.solana.com";
if (!URL.includes("devnet")) throw new Error("devnet only: ANCHOR_PROVIDER_URL must be a devnet RPC");
const MIN_PAYER_LAMPORTS = 0.3 * LAMPORTS_PER_SOL;

const sha = (s: string) => Array.from(createHash("sha256").update(s).digest());
const usdc = (n: number) => BigInt(Math.round(n * 1_000_000));
const fmt = (b: bigint) => `$${(Number(b) / 1e6).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
const bn = (x: bigint | number) => new BN(x.toString());
const link = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const dep = JSON.parse(fs.readFileSync(path.join(ROOT, "deploy/devnet.json"), "utf8"));
const MINT = new PublicKey(dep.usdcMint);
const TREASURY = new PublicKey(dep.treasury);
const POOL = new PublicKey(dep.validatorPool);

function proofFor(sample: string) {
  const out = execFileSync(process.execPath, ["--no-warnings", path.join(ROOT, "scripts/demo-proof.mjs"), sample], {
    encoding: "utf8", env: { ...process.env, NODE_OPTIONS: "" },
  });
  return JSON.parse(out);
}

const results: any = { network: "devnet", programId: dep.programId, scenarios: {}, txs: [] as any[] };
const step = (n: string, text: string) => process.stdout.write(`${n} ${text} … `);

async function main() {
  const payer = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync((process.env.ANCHOR_WALLET ?? "~/.config/solana/id.json").replace(/^~/, os.homedir()), "utf8"))));
  const conn = new Connection(URL, "confirmed");
  const provider = new anchor.AnchorProvider(conn, new anchor.Wallet(payer), { commitment: "confirmed" });
  anchor.setProvider(provider);
  const program = new Program(JSON.parse(fs.readFileSync(path.join(ROOT, "target/idl/kvali.json"), "utf8")), provider);
  const M = program.methods as any;
  const PID = program.programId;
  if (PID.toBase58() !== dep.programId) throw new Error("IDL program id does not match deploy/devnet.json");

  // Demo keys (public by design, app/src/devnet/demo-keys.json); create them with scripts/devnet-demo-keys.ts
  const demo = JSON.parse(fs.readFileSync(path.join(ROOT, "app/src/devnet/demo-keys.json"), "utf8")).keys as { role: string; secretKey: number[] }[];
  const demoKp = (role: string) => Keypair.fromSecretKey(Uint8Array.from(demo.find((k) => k.role === role)!.secretKey));
  const farmer = demoKp("farmer"), operator = demoKp("operator");
  const vOp = demoKp("validator-operator-side"), vFarm = demoKp("validator-farmer-side"), vNeutral = demoKp("validator-neutral");
  const farmerToken = getAssociatedTokenAddressSync(MINT, farmer.publicKey);
  const operatorToken = getAssociatedTokenAddressSync(MINT, operator.publicKey);

  const pda = (seeds: Buffer[]) => PublicKey.findProgramAddressSync(seeds, PID)[0];
  const configPda = pda([Buffer.from("config")]);
  const operatorPda = pda([Buffer.from("operator"), operator.publicKey.toBuffer()]);
  const farmerPda = pda([Buffer.from("farmer"), farmer.publicKey.toBuffer()]);
  const DRONE = sha("drone-serial-001");
  const certPda = pda([Buffer.from("cert"), operator.publicKey.toBuffer(), Buffer.from(DRONE)]);
  const jobPda = (id: bigint) => {
    const le = Buffer.alloc(8); le.writeBigUInt64LE(id);
    return pda([Buffer.from("job"), farmer.publicKey.toBuffer(), le]);
  };
  const vaultPda = (job: PublicKey) => pda([Buffer.from("vault"), job.toBuffer()]);

  const honest = proofFor("record-honest");
  const pumpOff = proofFor("record-pump-off");
  const terms = honest.job;
  const AMOUNT = usdc(300), BOND = usdc(300);

  const plan = [
    "Setup: fund farmer/operator/validator with a little devnet SOL; mint test USDC; register operator; issue calibration certificate",
    `Scenario A (honest): post ${terms.areaCha / 100} ha job, lock $300 -> accept with $300 bond -> submit proof (hash ${honest.hash.slice(0, 16)}…, 2 validators) -> wait 60 s window -> settle`,
    `Scenario B (pump-off): post + accept a second job -> submit_proof with ${pumpOff.litersMl} ml over ${terms.areaCha / 100} ha (${pumpOff.verdict.appliedRateMlPerHa} ml/ha) -> program rejects it (RateOutOfBand)`,
    CHALLENGE ? "Scenario C (--challenge): honest proof, farmer challenges with 20% bond, panel (farmer-side + neutral) upholds -> refund" : "Scenario C: off (pass --challenge to run)",
  ];
  console.log("\nKvali devnet demo\n=================");
  console.log(`program ${PID.toBase58()}  (devnet)\n`);
  if (DRY) {
    plan.forEach((p) => console.log(" - " + p));
    console.log("\n--dry-run: no transactions sent.");
    return;
  }

  // ---- plumbing ----------------------------------------------------------
  const payerBal = async () => BigInt(await conn.getBalance(payer.publicKey));
  const startSol = await payerBal();
  async function send(label: string, ixs: TransactionInstruction[], signers: Keypair[], opts: { allowFail?: boolean } = {}) {
    if (Number(await payerBal()) < MIN_PAYER_LAMPORTS) throw new Error("payer below 0.3 SOL: stopping");
    const tx = new Transaction();
    tx.add(...ixs);
    tx.feePayer = payer.publicKey;
    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
    tx.recentBlockhash = blockhash;
    const all = [payer, ...signers.filter((s) => !s.publicKey.equals(payer.publicKey))];
    tx.sign(...all);
    // skipPreflight so that a rejected instruction still lands on chain with a shareable link.
    const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: !!opts.allowFail });
    const conf = await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
    let err: string | null = null;
    if (conf.value.err) {
      const t = await conn.getTransaction(sig, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
      const logs = (t?.meta?.logMessages ?? []).join("\n");
      const m = logs.match(/Error Code: (\w+)\. Error Number: (\d+)\. Error Message: ([^\n]*)/);
      err = m ? `${m[1]} (code ${m[2]}): ${m[3].replace(/\.$/, "")}` : JSON.stringify(conf.value.err);
    }
    results.txs.push({ label, signature: sig, explorer: link(sig), ok: !err, error: err });
    if (err && !opts.allowFail) throw new Error(`${label} failed: ${err}`);
    return { sig, err };
  }
  const tokBal = async (a: PublicKey) => (await getAccount(conn, a)).amount;
  const balances = async () => ({ operator: await tokBal(operatorToken), treasury: await tokBal(TREASURY), validatorPool: await tokBal(POOL), farmer: await tokBal(farmerToken) });
  const show = (o: Record<string, bigint>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, fmt(v)]));
  const settleAccounts = (job: PublicKey, caller: PublicKey) => ({
    caller, config: configPda, job, vault: vaultPda(job), usdcMint: MINT, farmerToken, farmerProfile: farmerPda,
    operator: operatorPda, operatorToken, treasuryToken: TREASURY, validatorPoolToken: POOL, tokenProgram: TOKEN_PROGRAM_ID,
  });
  const signerMetas = (ks: Keypair[]) => ks.map((s) => ({ pubkey: s.publicKey, isSigner: true, isWritable: false }));

  async function postJob(label: string, deadlineSecs: number) {
    const id = BigInt(Date.now());
    const job = jobPda(id);
    const ix = await M.postJob(bn(id), bn(AMOUNT), sha(honest.manifest.field_hash ?? "field"), 7, terms.rate, terms.tolerance, terms.areaCha,
      bn(Math.floor(Date.now() / 1000) + deadlineSecs))
      .accountsStrict({ farmer: farmer.publicKey, config: configPda, usdcMint: MINT, farmerToken, farmerProfile: farmerPda, job, vault: vaultPda(job),
        tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId }).instruction();
    const r = await send(label, [ix], [farmer]);
    return { id, job, sig: r.sig };
  }
  async function acceptJob(label: string, job: PublicKey) {
    const ix = await M.acceptJob(bn(BOND)).accountsStrict({ authority: operator.publicKey, certificate: certPda, operator: operatorPda, config: configPda,
      job, vault: vaultPda(job), usdcMint: MINT, operatorToken, tokenProgram: TOKEN_PROGRAM_ID }).instruction();
    return (await send(label, [ix], [operator])).sig;
  }
  async function submitProof(label: string, job: PublicKey, hashHex: string, liters: number, area: number, allowFail = false) {
    const cosigners = [vOp, vNeutral];
    const ix = await M.submitProof(Array.from(Buffer.from(hashHex, "hex")), bn(liters), area)
      .accountsStrict({ authority: operator.publicKey, config: configPda, job }).remainingAccounts(signerMetas(cosigners)).instruction();
    return send(label, [ix], [operator, ...cosigners], { allowFail });
  }
  async function waitWindow(job: PublicKey) {
    const j = await (program.account as any).job.fetch(job);
    const end = Number(j.challengeDeadline.toString());
    for (;;) {
      const left = end + 2 - Math.floor(Date.now() / 1000); // +2 s: the program needs clock > deadline
      if (left <= 0) break;
      process.stdout.write(`\r      challenge window open: ${String(left).padStart(2)} s left (anyone may challenge; after it, anyone may settle)   `);
      await sleep(1000);
    }
    process.stdout.write("\r" + " ".repeat(100) + "\r");
  }
  async function settleJob(label: string, job: PublicKey) {
    for (let i = 0; i < 8; i++) {
      const ix = await M.settle().accountsStrict(settleAccounts(job, payer.publicKey)).instruction();
      try {
        // preflight catches WindowOpen (clock skew) without spending a fee
        return (await send(label, [ix], [])).sig;
      } catch (e: any) {
        if (!String(e).includes("WindowOpen") && !String(e).includes("0x1783") && i === 7) throw e;
        await sleep(3000);
      }
    }
    throw new Error("settle never succeeded");
  }

  // ---- setup (idempotent) -------------------------------------------------
  console.log("Setup (skipped where it already exists)");
  const need = async (who: Keypair, name: string, target: number) => {
    const have = await conn.getBalance(who.publicKey);
    if (have >= target * LAMPORTS_PER_SOL) { console.log(`   ${name} has ${(have / LAMPORTS_PER_SOL).toFixed(3)} SOL, ok`); return; }
    const ix = SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: who.publicKey, lamports: Math.round(target * LAMPORTS_PER_SOL) - have });
    const r = await send(`fund ${name}`, [ix], []);
    console.log(`   funded ${name} to ${target} SOL  ${link(r.sig)}`);
  };
  await need(farmer, "farmer", 0.03);
  await need(operator, "operator", 0.01);
  await need(vOp, "validator operator-side (pays certificate rent)", 0.005);

  const ataIxs = [
    createAssociatedTokenAccountIdempotentInstruction(payer.publicKey, farmerToken, farmer.publicKey, MINT),
    createAssociatedTokenAccountIdempotentInstruction(payer.publicKey, operatorToken, operator.publicKey, MINT),
  ];
  const mintIxs: TransactionInstruction[] = [];
  const fHave = (await conn.getAccountInfo(farmerToken)) ? await tokBal(farmerToken) : 0n;
  const oHave = (await conn.getAccountInfo(operatorToken)) ? await tokBal(operatorToken) : 0n;
  if (fHave < usdc(400)) mintIxs.push(createMintToInstruction(MINT, farmerToken, payer.publicKey, usdc(1000) - fHave));
  if (oHave < usdc(400)) mintIxs.push(createMintToInstruction(MINT, operatorToken, payer.publicKey, usdc(1000) - oHave));
  if (mintIxs.length) {
    const r = await send("mint test USDC", [...ataIxs, ...mintIxs], []);
    console.log(`   minted test USDC (farmer/operator topped up to $1,000)  ${link(r.sig)}`);
  } else console.log("   farmer and operator already hold test USDC, ok");

  if (!(await conn.getAccountInfo(operatorPda))) {
    const ix = await M.registerOperator().accountsStrict({ authority: operator.publicKey, operator: operatorPda, systemProgram: SystemProgram.programId }).instruction();
    const r = await send("register operator", [ix], [operator]);
    console.log(`   operator registered  ${link(r.sig)}`);
  } else console.log("   operator already registered, ok");

  let cert: any = null;
  try { cert = await (program.account as any).certificate.fetch(certPda); } catch { /* none yet */ }
  if (!cert || cert.revoked || Number(cert.validUntil.toString()) < Date.now() / 1000 + 3600) {
    const ix = await M.issueCertificate(DRONE, 200, true, sha("calibration-report-demo-drone-001"), bn(Math.floor(Date.now() / 1000) + 365 * 86400))
      .accountsStrict({ validator: vOp.publicKey, config: configPda, operatorAuthority: operator.publicKey, certificate: certPda, systemProgram: SystemProgram.programId }).instruction();
    const r = await send("issue calibration certificate", [ix], [vOp]);
    console.log(`   calibration certificate issued (meter error 2%)  ${link(r.sig)}`);
    results.certificateTx = r.sig;
  } else console.log("   calibration certificate already valid, ok");

  // An earlier run's scenario B leaves its job accepted until the spray deadline passes; clear it first.
  const opAcc = await (program.account as any).operator.fetch(operatorPda);
  if (opAcc.activeJob) {
    const stuck: PublicKey = opAcc.activeJob;
    const sj = await (program.account as any).job.fetch(stuck);
    const left = Number(sj.sprayDeadline.toString()) - Date.now() / 1000;
    if (left > 0) throw new Error(`operator still has an active job (${stuck.toBase58()}) whose spray deadline is in ${Math.ceil(left)} s; re-run after that`);
    const ix = await M.reclaimExpired().accountsStrict(settleAccounts(stuck, payer.publicKey)).instruction();
    const r = await send("reclaim expired job from an earlier run", [ix], []);
    console.log(`   cleared last run's rejected job via reclaim_expired (deadline passed, farmer refunded plus the bond)  ${link(r.sig)}`);
  }

  // ---- Scenario A ---------------------------------------------------------
  console.log("\nScenario A: an honest spray job");
  const before = await balances();
  step("1/7", `Farmer posts a ${terms.areaCha / 100} ha job and locks $300 in escrow`);
  const A = await postJob("A post_job", 86400);
  console.log(`✓ tx: ${link(A.sig)}`);
  step("2/7", "Operator accepts and locks a $300 bond (calibration certificate checked on chain)");
  const aAccept = await acceptJob("A accept_job", A.job);
  console.log(`✓ tx: ${link(aAccept)}`);
  const afterAccept = await balances();

  step("3/7", `Proof manifest built from the (simulated) flight record: SHA-256 ${honest.hash.slice(0, 16)}…`);
  console.log(`✓ ${honest.verdict.appliedRateMlPerHa / 1000} L/ha applied vs ${terms.rate / 1000} L/ha target, coverage ${honest.verdict.coverageBps / 100}%`);
  step("4/7", "Operator submits the proof hash, co-signed by 2 of 3 validators (operator-side + neutral)");
  const aProof = await submitProof("A submit_proof", A.job, honest.hash, honest.litersMl, honest.areaCha);
  console.log(`✓ tx: ${link(aProof.sig)}`);
  console.log(`      on-chain check passed: ${(honest.litersMl / 1000).toFixed(1)} L over ${honest.areaCha / 100} ha = ${honest.verdict.appliedRateMlPerHa} ml/ha, inside the ±15% band`);
  step("5/7", "Challenge window (60 s) starts; nobody objects");
  console.log("");
  await waitWindow(A.job);
  step("6/7", "Anyone calls settle: operator is paid, bond returned, fees split");
  const aSettle = await settleJob("A settle", A.job);
  console.log(`✓ tx: ${link(aSettle)}`);
  const after = await balances();
  const exp = honest.settled;
  const d = {
    operator: after.operator - afterAccept.operator, treasury: after.treasury - before.treasury, validatorPool: after.validatorPool - before.validatorPool,
  };
  const ok = d.operator === BigInt(exp.operator) && d.treasury === BigInt(exp.kvali) && d.validatorPool === BigInt(exp.validators);
  console.log("      balances (USDC)        before        after        change   settlement.ts expects");
  const row = (n: string, b: bigint, a: bigint, e: string) => console.log(`      ${n.padEnd(20)} ${fmt(b).padStart(11)} ${fmt(a).padStart(12)} ${fmt(a - b).padStart(13)} ${fmt(BigInt(e)).padStart(14)}`);
  row("operator (post-bond)", afterAccept.operator, after.operator, exp.operator);
  row("treasury (3%)", before.treasury, after.treasury, exp.kvali);
  row("validator pool (2%)", before.validatorPool, after.validatorPool, exp.validators);
  step("7/7", "On-chain payouts match services/proof/src/settlement.ts for $300");
  console.log(ok ? "✓" : "✗ MISMATCH");
  results.scenarios.A = {
    jobId: A.id.toString(), job: A.job.toBase58(), vault: vaultPda(A.job).toBase58(), manifestHash: honest.hash, manifest: honest.manifest,
    txs: { postJob: A.sig, acceptJob: aAccept, submitProof: aProof.sig, settle: aSettle },
    balancesUsdc: { operatorAfterBondLocked: show({ v: afterAccept.operator }).v, operatorAfterSettle: show({ v: after.operator }).v,
      treasuryBefore: show({ v: before.treasury }).v, treasuryAfter: show({ v: after.treasury }).v,
      poolBefore: show({ v: before.validatorPool }).v, poolAfter: show({ v: after.validatorPool }).v },
    expectedFromSettlementTs: { operatorPayout: exp.operator, treasury: exp.kvali, validatorPool: exp.validators, unit: "USDC base units (6 decimals)" },
    matchesSettlementTs: ok,
  };
  if (!ok) throw new Error("balances do not match settlement.ts");

  // ---- Scenario C (optional) ------------------------------------------------
  if (CHALLENGE) {
    console.log("\nScenario C: the farmer challenges and the panel upholds");
    const b0 = await balances();
    step("1/5", "Farmer posts and operator accepts a new job");
    const C = await postJob("C post_job", 86400);
    const cAcc = await acceptJob("C accept_job", C.job);
    console.log(`✓ tx: ${link(C.sig)}  ${link(cAcc)}`);
    step("2/5", "Operator submits an honest-looking proof");
    const cProof = await submitProof("C submit_proof", C.job, honest.hash, honest.litersMl, honest.areaCha);
    console.log(`✓ tx: ${link(cProof.sig)}`);
    step("3/5", "Farmer challenges inside the window, locking a $60 challenge bond (20%)");
    const chIx = await M.challenge(sha("farmer-evidence-photos-and-tank-readings")).accountsStrict({ farmer: farmer.publicKey, config: configPda, job: C.job,
      vault: vaultPda(C.job), usdcMint: MINT, farmerToken, tokenProgram: TOKEN_PROGRAM_ID }).instruction();
    const ch = await send("C challenge", [chIx], [farmer]);
    console.log(`✓ tx: ${link(ch.sig)}`);
    step("4/5", "Panel (farmer-side + neutral validators) inspects the field and upholds the challenge");
    const panel = [vFarm, vNeutral];
    const rIx = await M.resolveChallenge(true, sha("inspection-report-demo")).accountsStrict(settleAccounts(C.job, vFarm.publicKey))
      .remainingAccounts(signerMetas(panel)).instruction();
    const rs = await send("C resolve_challenge", [rIx], panel);
    console.log(`✓ tx: ${link(rs.sig)}`);
    const b1 = await balances();
    const e = honest.upheld;
    const okC = b1.farmer - b0.farmer === BigInt(e.farmer) - AMOUNT - usdc(60) && b1.validatorPool - b0.validatorPool === BigInt(e.validators);
    step("5/5", `Farmer refunded ($${Number(e.farmer) / 1e6} incl. challenge bond and forfeited operator bond share), pool +${fmt(BigInt(e.validators))}`);
    console.log(`✓ farmer net ${fmt(b1.farmer - b0.farmer)} ; operator net ${fmt(b1.operator - b0.operator)} ; pool ${fmt(b1.validatorPool - b0.validatorPool)}`);
    results.scenarios.C = { jobId: C.id.toString(), job: C.job.toBase58(), txs: { postJob: C.sig, acceptJob: cAcc, submitProof: cProof.sig, challenge: ch.sig, resolveChallenge: rs.sig },
      expectedFromSettlementTs: e, observedNetBaseUnits: { farmer: (b1.farmer - b0.farmer).toString(), operator: (b1.operator - b0.operator).toString(), validatorPool: (b1.validatorPool - b0.validatorPool).toString() } };
    if (!okC) throw new Error("scenario C balances do not match settlement.ts");
  }

  // ---- Scenario B ---------------------------------------------------------
  console.log("\nScenario B: a pump-off record (the drone flew the pattern but sprayed almost nothing)");
  step("1/4", "Farmer posts a second 17 ha job ($300 escrow, short spray deadline so it can be refunded soon)");
  const B = await postJob("B post_job", 150);
  console.log(`✓ tx: ${link(B.sig)}`);
  step("2/4", "Operator accepts with a $300 bond");
  const bAccept = await acceptJob("B accept_job", B.job);
  console.log(`✓ tx: ${link(bAccept)}`);
  step("3/4", `Operator submits the pump-off record: ${pumpOff.litersMl} ml over ${pumpOff.areaCha / 100} ha = ${pumpOff.verdict.appliedRateMlPerHa} ml/ha vs 10,000 target`);
  const bProof = await submitProof("B submit_proof (pump-off)", B.job, pumpOff.hash, pumpOff.litersMl, pumpOff.areaCha, true);
  console.log(bProof.err ? `✗ REJECTED BY THE PROGRAM  tx: ${link(bProof.sig)}` : "UNEXPECTEDLY ACCEPTED");
  console.log(`      on-chain error: ${bProof.err}`);
  step("4/4", "What happens next");
  const bj = await (program.account as any).job.fetch(B.job);
  console.log(`job stays "Accepted", $300 + $300 bond stay locked, nothing is paid.`);
  console.log(`      After the spray deadline (${new Date(Number(bj.sprayDeadline.toString()) * 1000).toISOString()}) anyone calls reclaim_expired:`);
  console.log("      the farmer gets the $300 escrow back plus the operator's $300 bond (no fees taken). The next demo run does this automatically.");
  const bOk = !!bProof.err && bProof.err.startsWith("RateOutOfBand");
  results.scenarios.B = { jobId: B.id.toString(), job: B.job.toBase58(), manifestHashOfRejectedRecord: pumpOff.hash,
    txs: { postJob: B.sig, acceptJob: bAccept, submitProofRejected: bProof.sig }, rejectedWith: bProof.err, appliedRateMlPerHa: pumpOff.verdict.appliedRateMlPerHa,
    nextStep: "reclaim_expired after the spray deadline refunds the farmer", sprayDeadline: new Date(Number(bj.sprayDeadline.toString()) * 1000).toISOString() };
  if (!bOk) throw new Error("scenario B did not fail with RateOutOfBand");

  // ---- summary --------------------------------------------------------------
  const endSol = await payerBal();
  results.sol = { payerStart: startSol.toString(), payerEnd: endSol.toString(), spentSol: Number(startSol - endSol) / LAMPORTS_PER_SOL, payerLeftSol: Number(endSol) / LAMPORTS_PER_SOL };
  results.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(ROOT, "deploy/demo-run-latest.json"), JSON.stringify(results, null, 2) + "\n");
  console.log("\nSummary");
  console.log(`   A: honest job settled; operator paid, treasury +3%, validators +2%, matches settlement.ts: ${ok}`);
  console.log(`   B: pump-off proof rejected on chain with ${bProof.err}`);
  console.log(`   payer SOL spent this run: ${results.sol.spentSol.toFixed(4)}  left: ${results.sol.payerLeftSol.toFixed(4)}`);
  console.log(`   ${results.txs.length} transactions; results written to deploy/demo-run-latest.json`);
}
main().catch((e) => { console.error("\nERROR:", e.message ?? e); process.exit(1); });
