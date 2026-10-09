// Kvali program tests (task k04). In-process LiteSVM only: see tests/harness.ts.
// Run from ~/kvali:  npm test

import { expect } from "chai";
import { Keypair } from "@solana/web3.js";
import {
  DRONE,
  Env,
  JOB,
  PROGRAM_DATA,
  START_BALANCE,
  expectErr,
  expectOk,
  hash,
  pda,
  settlementTs,
  usdc,
} from "./harness";

const [V0, V1, V2] = [0, 1, 2];

describe("kvali", () => {
  describe("setup sanity", () => {
    it("program is installed as upgradeable with the test admin as upgrade authority", () => {
      const env = new Env();
      const pd = env.svm.getAccount(PROGRAM_DATA)!;
      const data = Buffer.from(pd.data);
      expect(data.readUInt32LE(0)).to.equal(3); // ProgramData
      expect(data[12]).to.equal(1); // Some(authority)
      expect(Buffer.from(data.subarray(13, 45)).equals(env.admin.publicKey.toBuffer())).to.equal(true);
    });

    it("settlement.ts reference numbers for a $300 job with a $300 bond", () => {
      // These are the hard-coded expectations used below; this test checks they
      // still match what services/proof/src/settlement.ts computes.
      expect(settlementTs(JOB.amount, JOB.bond, "settled")).to.deep.equal({
        farmer: 0n, operator: usdc(585), kvali: usdc(9), validators: usdc(6),
      });
      expect(settlementTs(JOB.amount, JOB.bond, "challenge-upheld")).to.deep.equal({
        farmer: usdc(630), operator: 0n, kvali: 0n, validators: usdc(30),
      });
      expect(settlementTs(JOB.amount, JOB.bond, "challenge-rejected")).to.deep.equal({
        farmer: 0n, operator: usdc(615), kvali: usdc(9), validators: usdc(36),
      });
      expect(settlementTs(JOB.amount, JOB.bond, "expired")).to.deep.equal({
        farmer: usdc(600), operator: 0n, kvali: 0n, validators: 0n,
      });
    });
  });

  // 1 -----------------------------------------------------------------------
  describe("1. happy path", () => {
    it("post -> certify -> accept with bond -> proof (2 validators) -> settle after window: exact balances", async () => {
      const env = new Env();
      await env.ready();
      const j = await env.postJob();
      expectOk(j.r);
      expect(env.balance(j.vault)).to.equal(JOB.amount);
      expect(env.balance(env.farmerToken)).to.equal(START_BALANCE - JOB.amount);

      expectOk(await env.acceptJob(j.job));
      expect(env.balance(j.vault)).to.equal(JOB.amount + JOB.bond);
      expect(env.fetch("operator", pda.operator(env.operator.publicKey)).activeJob.equals(j.job)).to.equal(true);

      expectOk(await env.submitProof(j.job, [env.validators[V0], env.validators[V1]]));
      const job = env.fetch("job", j.job);
      expect(job.state).to.have.property("proofSubmitted");
      expect(BigInt(job.challengeDeadline.toString())).to.equal(env.now() + 60n);

      env.warp(61);
      expectOk(await env.settle(j.job)); // called by an outsider: permissionless

      const ref = settlementTs(JOB.amount, JOB.bond, "settled");
      expect(env.balance(env.operatorToken)).to.equal(START_BALANCE - JOB.bond + ref.operator);
      expect(env.balance(env.operatorToken)).to.equal(usdc(1285)); // 1000 - 300 + 585
      expect(env.balance(env.treasury)).to.equal(ref.kvali).and.equal(usdc(9));
      expect(env.balance(env.pool)).to.equal(ref.validators).and.equal(usdc(6));
      expect(env.balance(env.farmerToken)).to.equal(usdc(700));
      expect(env.balance(j.vault)).to.equal(0n);

      expect(env.fetch("job", j.job).state).to.have.property("released");
      const op = env.fetch("operator", pda.operator(env.operator.publicKey));
      expect(op.jobsCompleted).to.equal(1);
      expect(op.activeJob).to.equal(null);

      // Can't settle twice.
      expectErr(await env.settle(j.job), "InvalidState");
    });
  });

  // 2 -----------------------------------------------------------------------
  describe("2. bond too small", () => {
    it("bond of amount - 1 base unit fails with BondTooSmall; bond == amount passes", async () => {
      const env = new Env();
      await env.ready();
      const j = await env.postJob();
      expectOk(j.r);
      expectErr(await env.acceptJob(j.job, JOB.amount - 1n), "BondTooSmall");
      expectOk(await env.acceptJob(j.job, JOB.amount));
    });
  });

  // 3 -----------------------------------------------------------------------
  describe("3. validator threshold", () => {
    it("one validator signer fails with NotEnoughValidators", async () => {
      const env = new Env();
      await env.ready();
      const j = await env.postJob();
      expectOk(await env.acceptJob(j.job));
      expectErr(await env.submitProof(j.job, [env.validators[V0]]), "NotEnoughValidators");
    });

    it("the same validator listed twice still counts once", async () => {
      const env = new Env();
      await env.ready();
      const j = await env.postJob();
      expectOk(await env.acceptJob(j.job));
      expectErr(
        await env.submitProof(j.job, [env.validators[V0], env.validators[V0]]),
        "NotEnoughValidators",
      );
    });

    it("a signer outside the validator set doesn't count", async () => {
      const env = new Env();
      await env.ready();
      const j = await env.postJob();
      expectOk(await env.acceptJob(j.job));
      expectErr(await env.submitProof(j.job, [env.validators[V0], env.outsider]), "NotEnoughValidators");
    });
  });

  // 4 -----------------------------------------------------------------------
  describe("4. uncertified operator", () => {
    async function setup() {
      const env = new Env();
      await env.initConfig();
      expectOk(await env.registerOperator());
      const j = await env.postJob();
      expectOk(j.r);
      return { env, j };
    }

    it("no certificate at all fails (certificate account doesn't exist: AccountNotInitialized)", async () => {
      const { env, j } = await setup();
      expectErr(await env.acceptJob(j.job), "AccountNotInitialized");
    });

    it("meter error 5.01% (501 bps) fails with NotCertified", async () => {
      const { env, j } = await setup();
      expectOk(await env.issueCertificate(env.validators[V0], { meterErrorBps: 501 }));
      expectErr(await env.acceptJob(j.job), "NotCertified");
    });

    it("meter error exactly 5% (500 bps) is accepted", async () => {
      const { env, j } = await setup();
      expectOk(await env.issueCertificate(env.validators[V0], { meterErrorBps: 500 }));
      expectOk(await env.acceptJob(j.job));
    });

    it("operator failed the practical test fails with NotCertified", async () => {
      const { env, j } = await setup();
      expectOk(await env.issueCertificate(env.validators[V0], { passed: false }));
      expectErr(await env.acceptJob(j.job), "NotCertified");
    });

    it("expired certificate fails with NotCertified", async () => {
      const { env, j } = await setup();
      expectOk(await env.issueCertificate(env.validators[V0], { validUntil: env.now() + 100n }));
      env.warp(101);
      expectErr(await env.acceptJob(j.job), "NotCertified");
    });

    it("a certificate issued by a non-validator is refused (Unauthorized)", async () => {
      const { env } = await setup();
      expectErr(await env.issueCertificate(env.outsider), "Unauthorized");
    });
  });

  // 5 -----------------------------------------------------------------------
  describe("5. challenge upheld (farmer wins)", () => {
    it("farmer locks 20%, 2-of-3 panel upholds: farmer gets vault minus 10% panel fee", async () => {
      const env = new Env();
      await env.ready();
      const j = await env.provenJob();

      expectOk(await env.challenge(j.job));
      expect(env.balance(j.vault)).to.equal(usdc(660)); // 300 + 300 + 60
      expect(env.balance(env.farmerToken)).to.equal(usdc(640)); // 1000 - 300 - 60
      expect(BigInt(env.fetch("job", j.job).challengeBond.toString())).to.equal(usdc(60));

      // The window closing doesn't let anyone settle a challenged job.
      env.warp(61);
      expectErr(await env.settle(j.job), "InvalidState");

      // One panelist is not enough.
      expectErr(await env.resolveChallenge(j.job, true, [env.validators[V1]]), "NotEnoughValidators");
      expectOk(await env.resolveChallenge(j.job, true, [env.validators[V1], env.validators[V2]]));

      const ref = settlementTs(JOB.amount, JOB.bond, "challenge-upheld");
      expect(env.balance(env.farmerToken)).to.equal(usdc(640) + ref.farmer).and.equal(usdc(1270));
      expect(env.balance(env.operatorToken)).to.equal(usdc(700)); // bond lost
      expect(env.balance(env.treasury)).to.equal(ref.kvali).and.equal(0n);
      expect(env.balance(env.pool)).to.equal(ref.validators).and.equal(usdc(30));
      expect(env.balance(j.vault)).to.equal(0n);

      expect(env.fetch("job", j.job).state).to.have.property("refunded");
      expect(env.fetch("farmerProfile", pda.farmer(env.farmer.publicKey)).challengesWon).to.equal(1);
      const op = env.fetch("operator", pda.operator(env.operator.publicKey));
      expect(op.jobsFailed).to.equal(1);
      expect(op.activeJob).to.equal(null);
    });
  });

  // 6 -----------------------------------------------------------------------
  describe("6. challenge rejected (farmer loses)", () => {
    it("farmer's bond pays the panel fee and the operator: exact balances", async () => {
      const env = new Env();
      await env.ready();
      const j = await env.provenJob();
      expectOk(await env.challenge(j.job));
      expectOk(await env.resolveChallenge(j.job, false, [env.validators[V0], env.validators[V2]]));

      const ref = settlementTs(JOB.amount, JOB.bond, "challenge-rejected");
      expect(env.balance(env.operatorToken)).to.equal(usdc(700) + ref.operator).and.equal(usdc(1315));
      expect(env.balance(env.farmerToken)).to.equal(usdc(640)); // paid 300 + lost 60 bond
      expect(env.balance(env.treasury)).to.equal(ref.kvali).and.equal(usdc(9));
      expect(env.balance(env.pool)).to.equal(ref.validators).and.equal(usdc(36));
      expect(env.balance(j.vault)).to.equal(0n);

      expect(env.fetch("job", j.job).state).to.have.property("released");
      expect(env.fetch("farmerProfile", pda.farmer(env.farmer.publicKey)).challengesLost).to.equal(1);
      expect(env.fetch("operator", pda.operator(env.operator.publicKey)).jobsCompleted).to.equal(1);
    });

    it("a challenge after the window closes fails with WindowClosed", async () => {
      const env = new Env();
      await env.ready();
      const j = await env.provenJob();
      env.warp(61);
      expectErr(await env.challenge(j.job), "WindowClosed");
    });
  });

  // 7 -----------------------------------------------------------------------
  describe("7. certificate revocation is final (D15)", () => {
    it("a non-revoked certificate can be renewed", async () => {
      const env = new Env();
      await env.ready();
      const before = env.fetch("certificate", pda.cert(env.operator.publicKey, DRONE));
      env.warp(1000);
      const newUntil = env.now() + 500n * 86_400n;
      expectOk(await env.issueCertificate(env.validators[V1], { validUntil: newUntil, meterErrorBps: 200 }));
      const after = env.fetch("certificate", pda.cert(env.operator.publicKey, DRONE));
      expect(BigInt(after.validUntil.toString())).to.equal(newUntil);
      expect(after.meterErrorBps).to.equal(200);
      expect(after.issuedBy.equals(env.validators[V1].publicKey)).to.equal(true);
      expect(BigInt(after.issuedAt.toString()) > BigInt(before.issuedAt.toString())).to.equal(true);
    });

    it("an expired (not revoked) certificate can be renewed and used again", async () => {
      const env = new Env();
      await env.initConfig();
      expectOk(await env.registerOperator());
      expectOk(await env.issueCertificate(env.validators[V0], { validUntil: env.now() + 10n }));
      env.warp(20);
      const j = await env.postJob();
      expectErr(await env.acceptJob(j.job), "NotCertified");
      expectOk(await env.issueCertificate(env.validators[V0]));
      expectOk(await env.acceptJob(j.job));
    });

    it("revocation needs the panel threshold; once revoked, accept fails and re-issue fails with CertificateRevoked", async () => {
      const env = new Env();
      await env.ready();
      expectErr(await env.revokeCertificate([env.validators[V0]]), "NotEnoughValidators");
      expectOk(await env.revokeCertificate([env.validators[V0], env.validators[V1]]));
      expect(env.fetch("certificate", pda.cert(env.operator.publicKey, DRONE)).revoked).to.equal(true);

      const j = await env.postJob();
      expectErr(await env.acceptJob(j.job), "NotCertified");
      for (const v of env.validators) {
        expectErr(await env.issueCertificate(v), "CertificateRevoked");
      }
      // A new drone gets its own certificate.
      const drone2 = hash("drone-serial-002");
      expectOk(await env.issueCertificate(env.validators[V2], { drone: drone2 }));
      expectOk(await env.acceptJob(j.job, JOB.bond, { drone: drone2 }));
    });
  });

  // 8 -----------------------------------------------------------------------
  describe("8. spray deadline", () => {
    it("proof one second after spray_deadline fails with ProofAfterDeadline; reclaim_expired refunds the farmer", async () => {
      const env = new Env();
      await env.ready();
      const j = await env.postJob({ deadlineIn: 3600n });
      expectOk(await env.acceptJob(j.job));
      env.warp(3601);
      expectErr(
        await env.submitProof(j.job, [env.validators[V0], env.validators[V1]]),
        "ProofAfterDeadline",
      );
      expectOk(await env.reclaimExpired(j.job));
      const ref = settlementTs(JOB.amount, JOB.bond, "expired");
      expect(env.balance(env.farmerToken)).to.equal(usdc(700) + ref.farmer).and.equal(usdc(1300));
      expect(env.balance(env.operatorToken)).to.equal(usdc(700));
      expect(env.balance(env.treasury) + env.balance(env.pool)).to.equal(0n);
      expect(env.balance(j.vault)).to.equal(0n);
    });

    it("proof exactly at the deadline second is accepted; reclaim before the deadline fails", async () => {
      const env = new Env();
      await env.ready();
      const j = await env.postJob({ deadlineIn: 3600n });
      expectOk(await env.acceptJob(j.job));
      expectErr(await env.reclaimExpired(j.job), "DeadlineNotReached");
      env.warp(3600);
      expectOk(await env.submitProof(j.job, [env.validators[V0], env.validators[V1]]));
    });
  });

  // 9 -----------------------------------------------------------------------
  describe("9. covered area ceiling (105%)", () => {
    async function accepted() {
      const env = new Env();
      await env.ready();
      const j = await env.postJob(); // 1700 cha
      expectOk(await env.acceptJob(j.job));
      return { env, j };
    }
    const sig = (env: Env) => [env.validators[V0], env.validators[V1]];

    it("1786 cha (> 105% of 1700) fails with AreaExceedsPosted", async () => {
      const { env, j } = await accepted();
      expectErr(await env.submitProof(j.job, sig(env), { area: 1786, liters: 178_600n }), "AreaExceedsPosted");
    });

    it("exactly 105% (1785 cha) passes", async () => {
      const { env, j } = await accepted();
      expectOk(await env.submitProof(j.job, sig(env), { area: 1785, liters: 178_500n }));
    });

    it("below 95% (1614 cha) fails with InsufficientCoverage; exactly 95% (1615) passes", async () => {
      const { env, j } = await accepted();
      expectErr(await env.submitProof(j.job, sig(env), { area: 1614, liters: 161_400n }), "InsufficientCoverage");
      expectOk(await env.submitProof(j.job, sig(env), { area: 1615, liters: 161_500n }));
    });

    it("liters outside the ±15% rate band fail with RateOutOfBand", async () => {
      const { env, j } = await accepted();
      // 11.6 L/ha > 11.5 L/ha upper bound
      expectErr(await env.submitProof(j.job, sig(env), { liters: 197_200n }), "RateOutOfBand");
    });
  });

  // 10 ----------------------------------------------------------------------
  describe("10. conflict of interest: farmer/operator never count as validators", () => {
    async function conflicted() {
      const env = new Env();
      await env.ready();
      // Put the farmer and the operator into the validator set (2-of-5).
      expectOk(
        await env.setValidators(
          [...env.validators.map((v) => v.publicKey), env.farmer.publicKey, env.operator.publicKey],
          2,
          2,
        ),
      );
      return env;
    }

    it("proof signed by one validator + the job's farmer fails with NotEnoughValidators", async () => {
      const env = await conflicted();
      const j = await env.postJob();
      expectOk(await env.acceptJob(j.job));
      expectErr(await env.submitProof(j.job, [env.validators[V0], env.farmer]), "NotEnoughValidators");
    });

    it("proof signed by one validator + the job's operator fails; two independent validators pass", async () => {
      const env = await conflicted();
      const j = await env.postJob();
      expectOk(await env.acceptJob(j.job));
      expectErr(await env.submitProof(j.job, [env.validators[V0], env.operator]), "NotEnoughValidators");
      expectOk(await env.submitProof(j.job, [env.validators[V0], env.validators[V1]]));
    });

    it("challenge panel of one validator + the farmer (or operator) fails", async () => {
      const env = await conflicted();
      const j = await env.provenJob();
      expectOk(await env.challenge(j.job));
      expectErr(await env.resolveChallenge(j.job, true, [env.validators[V0], env.farmer]), "NotEnoughValidators");
      expectErr(await env.resolveChallenge(j.job, false, [env.validators[V0], env.operator]), "NotEnoughValidators");
      expectOk(await env.resolveChallenge(j.job, true, [env.validators[V0], env.validators[V2]]));
    });

    it("revocation: the certificate's own operator doesn't count toward the panel", async () => {
      const env = await conflicted();
      expectErr(await env.revokeCertificate([env.validators[V0], env.operator]), "NotEnoughValidators");
    });
  });

  // 11 ----------------------------------------------------------------------
  describe("11. farmer accepting own job", () => {
    it("fails with OperatorIsFarmer", async () => {
      const env = new Env();
      await env.ready();
      // The farmer is also a registered, certified operator.
      expectOk(await env.registerOperator(env.farmer));
      expectOk(await env.issueCertificate(env.validators[V0], { operator: env.farmer.publicKey }));
      const j = await env.postJob();
      expectErr(
        await env.acceptJob(j.job, JOB.bond, { op: env.farmer, opToken: env.farmerToken }),
        "OperatorIsFarmer",
      );
    });
  });

  // 12 ----------------------------------------------------------------------
  describe("12. initialize_config needs the upgrade authority", () => {
    it("non-authority fails (Unauthorized); authority succeeds; re-init fails", async () => {
      const env = new Env();
      expectErr(
        env.send([await env.initConfigIx(env.outsider.publicKey)], [env.outsider]),
        "Unauthorized",
      );
      expect(env.svm.getAccount(pda.config())).to.equal(null);

      expectOk(env.send([await env.initConfigIx(env.admin.publicKey)], [env.admin]));
      const cfg = env.fetch("config", pda.config());
      expect(cfg.admin.equals(env.admin.publicKey)).to.equal(true);
      expect(cfg.validatorCount).to.equal(3);
      expect(cfg.proofThreshold).to.equal(2);
      expect(cfg.panelThreshold).to.equal(2);
      expect(cfg.challengeWindowSecs.toNumber()).to.equal(60);
      expect(cfg.treasury.equals(env.treasury)).to.equal(true);
      expect(cfg.validatorPool.equals(env.pool)).to.equal(true);

      // Re-init: the config PDA already exists, so the system program refuses
      // to create it again (not an Anchor error code, a runtime failure).
      env.svm.expireBlockhash();
      const again = env.send([await env.initConfigIx(env.admin.publicKey, { window: 120 })], [env.admin]);
      expect(again.constructor.name).to.equal("FailedTransactionMetadata");
      const logs = (again as any).meta().logs().join("\n");
      expect(logs).to.match(/already in use/);
      expect(env.fetch("config", pda.config()).challengeWindowSecs.toNumber()).to.equal(60);
    });

    it("a program with no upgrade authority (deployed --final) can never initialise config", async () => {
      const env = new Env();
      const pd = env.svm.getAccount(PROGRAM_DATA)!;
      const data = Buffer.from(pd.data);
      data[12] = 0; // upgrade_authority = None
      env.svm.setAccount(PROGRAM_DATA, { ...pd, data });
      expectErr(env.send([await env.initConfigIx(env.admin.publicKey)], [env.admin]), "Unauthorized");
    });

    it("invalid validator sets are refused (InvalidValidatorSet)", async () => {
      const env = new Env();
      const v = env.validators.map((k) => k.publicKey);
      for (const opts of [
        { validators: [] as typeof v },
        { proof: 4 },
        { panel: 0 },
        { validators: [v[0], v[0], v[1]] },
        { validators: Array.from({ length: 8 }, () => Keypair.generate().publicKey) },
      ]) {
        expectErr(env.send([await env.initConfigIx(env.admin.publicKey, opts)], [env.admin]), "InvalidValidatorSet");
      }
    });
  });

  // 13 ----------------------------------------------------------------------
  describe("13. challenge window setting", () => {
    it("initialize_config with 59 s or 7 days + 1 s fails with InvalidChallengeWindow", async () => {
      const env = new Env();
      expectErr(env.send([await env.initConfigIx(env.admin.publicKey, { window: 59 })], [env.admin]), "InvalidChallengeWindow");
      expectErr(
        env.send([await env.initConfigIx(env.admin.publicKey, { window: 7 * 86_400 + 1 })], [env.admin]),
        "InvalidChallengeWindow",
      );
    });

    it("set_challenge_window: bounds, admin only, and only affects later proofs", async () => {
      const env = new Env();
      await env.ready();
      expectErr(await env.setChallengeWindow(env.admin, 59), "InvalidChallengeWindow");
      expectErr(await env.setChallengeWindow(env.admin, 7 * 86_400 + 1), "InvalidChallengeWindow");
      expectErr(await env.setChallengeWindow(env.outsider, 3600), "Unauthorized");
      expectErr(await env.setChallengeWindow(env.validators[V0], 3600), "Unauthorized");
      expectOk(await env.setChallengeWindow(env.admin, 7 * 86_400)); // upper bound allowed
      expectOk(await env.setChallengeWindow(env.admin, 60)); // lower bound allowed

      // Job A proved under a 60 s window.
      const a = await env.provenJob();
      const deadlineA = BigInt(env.fetch("job", a.job).challengeDeadline.toString());
      // Switch to 24 h: job A keeps its 60 s deadline.
      expectOk(await env.setChallengeWindow(env.admin, 86_400));
      expect(BigInt(env.fetch("job", a.job).challengeDeadline.toString())).to.equal(deadlineA);
      env.warp(61);
      expectOk(await env.settle(a.job));
    });

    it("settle before the window ends fails with WindowOpen, including at the deadline second", async () => {
      const env = new Env();
      await env.ready();
      const j = await env.provenJob();
      expectErr(await env.settle(j.job), "WindowOpen");
      env.warp(60); // now == challenge_deadline: still open
      expectErr(await env.settle(j.job), "WindowOpen");
      expectOk(await env.challenge(j.job)); // and the farmer may still challenge at that second
    });

    it("24 h window: settle at +1 h fails, at +24 h + 1 s succeeds", async () => {
      const env = new Env();
      await env.ready({ window: 86_400 });
      const j = await env.provenJob();
      env.warp(3600);
      expectErr(await env.settle(j.job), "WindowOpen");
      env.warp(86_400 - 3600 + 1);
      expectOk(await env.settle(j.job));
    });
  });

  // extra ---------------------------------------------------------------------
  describe("extra: fee rounding matches settlement.ts on an odd amount", () => {
    for (const outcome of ["settled", "challenge-upheld", "challenge-rejected"] as const) {
      it(`${outcome}: amount 123.456789 USDC, bond 150 USDC`, async () => {
        const env = new Env();
        await env.ready();
        const amount = 123_456_789n;
        const bond = usdc(150);
        const j = await env.postJob({ amount });
        expectOk(j.r);
        expectOk(await env.acceptJob(j.job, bond));
        expectOk(await env.submitProof(j.job, [env.validators[V0], env.validators[V1]]));
        const f0 = env.balance(env.farmerToken);
        const o0 = env.balance(env.operatorToken);
        let challengeBond = 0n;
        if (outcome === "settled") {
          env.warp(61);
          expectOk(await env.settle(j.job));
        } else {
          expectOk(await env.challenge(j.job));
          challengeBond = f0 - env.balance(env.farmerToken);
          expect(challengeBond).to.equal((amount * 2000n) / 10_000n);
          expectOk(
            await env.resolveChallenge(j.job, outcome === "challenge-upheld", [env.validators[V1], env.validators[V2]]),
          );
        }
        const ref = settlementTs(amount, bond, outcome);
        expect(env.balance(env.farmerToken)).to.equal(f0 - challengeBond + ref.farmer);
        expect(env.balance(env.operatorToken)).to.equal(o0 + ref.operator);
        expect(env.balance(env.treasury)).to.equal(ref.kvali);
        expect(env.balance(env.pool)).to.equal(ref.validators);
        expect(env.balance(j.vault)).to.equal(0n);
      });
    }
  });

  describe("extra: other guards", () => {
    it("OBSERVATION (not a k03 rule): a validator who is also an operator can certify their own drone", async () => {
      // Documents current behaviour. issue_certificate only checks that the
      // signer is in the validator set; it does not exclude the operator being
      // certified. The proof and challenge paths do exclude conflicted keys.
      const env = new Env();
      await env.initConfig({
        validators: [...env.validators.map((v) => v.publicKey), env.operator.publicKey],
      });
      expectOk(await env.registerOperator());
      expectOk(await env.issueCertificate(env.operator)); // self-issued
      const j = await env.postJob();
      expectOk(await env.acceptJob(j.job));
    });

    it("cancel_job refunds an unaccepted job; only the farmer may cancel", async () => {
      const env = new Env();
      await env.ready();
      const j = await env.postJob();
      expectErr(await env.cancelJob(j.job, env.outsider), "Unauthorized");
      expectOk(await env.cancelJob(j.job));
      expect(env.balance(env.farmerToken)).to.equal(START_BALANCE);
      expect(env.balance(j.vault)).to.equal(0n);
      expect(env.fetch("job", j.job).state).to.have.property("cancelled");
      expectErr(await env.acceptJob(j.job), "InvalidState");
    });

    it("an operator with an active job can't accept a second one (OperatorBusy)", async () => {
      const env = new Env();
      await env.ready();
      const a = await env.postJob();
      const b = await env.postJob();
      expectOk(await env.acceptJob(a.job));
      expectErr(await env.acceptJob(b.job), "OperatorBusy");
    });

    it("only the job's operator can submit its proof", async () => {
      const env = new Env();
      await env.ready();
      const j = await env.postJob();
      expectOk(await env.acceptJob(j.job));
      expectErr(
        await env.submitProof(j.job, [env.validators[V0], env.validators[V1]], { op: env.outsider }),
        "Unauthorized",
      );
    });
  });
  // 14 ----------------------------------------------------------------------
  describe("14. validator staking and slashing", () => {
    const MIN = usdc(500);

    /** Ready env; validators 0 and 1 stake `amounts`; min stake set to `min`. */
    async function staked(min: bigint, amounts: bigint[] = [MIN, MIN], slashBps = 10_000) {
      const env = new Env();
      await env.ready();
      for (let i = 0; i < amounts.length; i++) {
        if (amounts[i] > 0n) expectOk(await env.stake(env.validators[i], amounts[i]), `stake v${i}`);
      }
      expectOk(await env.setStakingParams(env.admin, min, 60, slashBps), "set_staking_params");
      return env;
    }
    const keys = (env: Env, idx: number[]) => idx.map((i) => env.validators[i].publicKey);

    async function acceptedJob(env: Env) {
      const j = await env.postJob();
      expectOk(j.r, "post_job");
      expectOk(await env.acceptJob(j.job), "accept_job");
      return j;
    }

    it("new config defaults: min 0, 7-day cooldown, 100% slash; set_staking_params is admin-only and bounded", async () => {
      const env = new Env();
      await env.ready();
      const c = env.fetch("config", pda.config());
      expect(c.minValidatorStake.toString()).to.equal("0");
      expect(c.unstakeCooldownSecs.toString()).to.equal(String(7 * 86_400));
      expect(c.slashBps).to.equal(10_000);
      expectErr(await env.setStakingParams(env.outsider, MIN), "Unauthorized");
      expectErr(await env.setStakingParams(env.admin, MIN, 59), "InvalidStakingParams");
      expectErr(await env.setStakingParams(env.admin, MIN, 60, 0), "InvalidStakingParams");
      expectErr(await env.setStakingParams(env.admin, MIN, 60, 10_001), "InvalidStakingParams");
      expectOk(await env.setStakingParams(env.admin, MIN, 60, 5_000));
      const c2 = env.fetch("config", pda.config());
      expect(c2.minValidatorStake.toString()).to.equal(MIN.toString());
      expect(c2.slashBps).to.equal(5_000);
    });

    it("stake: USDC moves into the program stake vault and adds up", async () => {
      const env = new Env();
      await env.ready();
      const v = env.validators[V0];
      expectOk(await env.stake(v, usdc(300)));
      expectOk(await env.stake(v, usdc(200)));
      const s = env.stakeOf(v);
      expect(s.amount.toString()).to.equal(MIN.toString());
      expect(s.totalStaked.toString()).to.equal(MIN.toString());
      expect(s.validator.equals(v.publicKey)).to.equal(true);
      expect(env.balance(pda.stakeVault())).to.equal(MIN);
      expect(env.balance(env.validatorToken(v))).to.equal(START_BALANCE - MIN);
      expectErr(await env.stake(v, 0n), "InvalidAmount");
    });

    it("min = 0 keeps the old flow: unstaked co-signers, no stake accounts, settle as before", async () => {
      const env = await staked(0n, [MIN, 0n]); // v0 staked, v1 not
      const j = await acceptedJob(env);
      expectOk(await env.submitProof(j.job, [env.validators[V0], env.validators[V1]]));
      env.warp(61);
      expectOk(await env.settle(j.job));
      expect(env.balance(env.operatorToken)).to.equal(usdc(1285));
      expect(env.stakeOf(env.validators[V0]).openCosigns).to.equal(0); // stake not presented: not locked
    });

    it("co-signing is blocked below the minimum stake and allowed at it", async () => {
      const env = await staked(MIN, [MIN, MIN - 1n]);
      const j = await acceptedJob(env);
      const signers = [env.validators[V0], env.validators[V1]];
      // Old clients (no stake accounts) can no longer co-sign once min > 0.
      expectErr(await env.submitProof(j.job, signers), "ValidatorStakeTooLow");
      // v1 is 1 base unit short.
      expectErr(await env.submitProof(j.job, signers, { stakes: keys(env, [V0, V1]) }), "ValidatorStakeTooLow");
      // v1 tops up the missing base unit.
      expectOk(await env.stake(env.validators[V1], 1n));
      // Not enough signers at all is still NotEnoughValidators.
      expectErr(await env.submitProof(j.job, [env.validators[V0]], { stakes: keys(env, [V0]) }), "NotEnoughValidators");
      expectOk(await env.submitProof(j.job, signers, { stakes: keys(env, [V0, V1]) }));
      for (const i of [V0, V1]) {
        const s = env.stakeOf(env.validators[i]);
        expect(s.openCosigns).to.equal(1);
        expect(s.proofsCosigned).to.equal(1);
      }
    });

    it("cooldown is enforced; an unstaking validator can't co-sign", async () => {
      const env = await staked(MIN, [MIN, MIN]);
      const v = env.validators[V0];
      expectErr(await env.withdrawStake(v), "UnstakeNotRequested");
      expectOk(await env.requestUnstake(v));
      expectErr(await env.requestUnstake(v), "UnstakeAlreadyRequested");
      expectErr(await env.stake(v, 1n), "UnstakePending");

      const j = await acceptedJob(env);
      expectErr(
        await env.submitProof(j.job, [v, env.validators[V1]], { stakes: keys(env, [V0, V1]) }),
        "ValidatorStakeTooLow",
      );

      expectErr(await env.withdrawStake(v), "CooldownNotElapsed");
      env.warp(59);
      expectErr(await env.withdrawStake(v), "CooldownNotElapsed");
      env.warp(1);
      expectOk(await env.withdrawStake(v));
      expect(env.balance(env.validatorToken(v))).to.equal(START_BALANCE);
      expect(env.stakeOf(v).amount.toString()).to.equal("0");
      expect(env.balance(pda.stakeVault())).to.equal(MIN); // v1's stake stays
      expectErr(await env.requestUnstake(v), "NothingStaked");
    });

    it("withdrawal is locked while a co-signed proof is open, until released after settlement", async () => {
      const env = await staked(MIN);
      const j = await acceptedJob(env);
      expectOk(await env.submitProof(j.job, [env.validators[V0], env.validators[V1]], { stakes: keys(env, [V0, V1]) }));
      const v = env.validators[V0];
      expectOk(await env.requestUnstake(v));
      env.warp(61);
      expectErr(await env.withdrawStake(v), "StakeLockedByOpenJobs");
      expectErr(await env.releaseCosign(j.job, v.publicKey), "InvalidState"); // not settled yet
      expectOk(await env.settle(j.job));
      expectOk(await env.releaseCosign(j.job, v.publicKey)); // permissionless
      expectErr(await env.releaseCosign(j.job, v.publicKey), "NothingToRelease");
      expectErr(await env.releaseCosign(j.job, env.validators[V2].publicKey), "AccountNotInitialized");
      expectOk(await env.withdrawStake(v));
      expect(env.balance(env.validatorToken(v))).to.equal(START_BALANCE);
    });

    it("challenge upheld: every staked co-signer is slashed to the farmer and can't co-sign again", async () => {
      const env = await staked(MIN);
      expectOk(await env.stake(env.validators[V2], MIN));
      const j = await acceptedJob(env);
      expectOk(await env.submitProof(j.job, [env.validators[V0], env.validators[V1]], { stakes: keys(env, [V0, V1]) }));
      expectOk(await env.challenge(j.job));
      const panel = [env.validators[V1], env.validators[V2]];

      // The panel can't skip slashing by leaving out a co-signer's stake or the vault.
      expectErr(await env.resolveChallenge(j.job, true, panel, { stakes: keys(env, [V0]), stakeVault: true }), "MissingStakeAccount");
      expectErr(await env.resolveChallenge(j.job, true, panel, { stakes: keys(env, [V0, V1]) }), "MissingStakeVault");
      expectOk(await env.resolveChallenge(j.job, true, panel, { stakes: keys(env, [V0, V1]), stakeVault: true }));

      const ref = settlementTs(JOB.amount, JOB.bond, "challenge-upheld");
      // Farmer: refund + operator bond - panel fee, plus 2 x 500 slashed stake.
      expect(env.balance(env.farmerToken)).to.equal(START_BALANCE - JOB.amount - usdc(60) + ref.farmer + 2n * MIN);
      expect(env.balance(env.farmerToken)).to.equal(usdc(2270));
      expect(env.balance(pda.stakeVault())).to.equal(MIN); // only v2's (non co-signer) stake left
      for (const i of [V0, V1]) {
        const s = env.stakeOf(env.validators[i]);
        expect(s.slashed).to.equal(true);
        expect(s.amount.toString()).to.equal("0");
        expect(s.totalSlashed.toString()).to.equal(MIN.toString());
        expect(s.timesSlashed).to.equal(1);
        expect(s.openCosigns).to.equal(0);
      }
      expect(env.stakeOf(env.validators[V2]).slashed).to.equal(false);

      // Slashed validators lose the right to co-sign, and can't re-stake.
      expectErr(await env.stake(env.validators[V0], MIN), "StakeSlashed");
      const j2 = await acceptedJob(env);
      expectErr(
        await env.submitProof(j2.job, [env.validators[V0], env.validators[V2]], { stakes: keys(env, [V0, V2]) }),
        "ValidatorStakeTooLow",
      );
    });

    it("partial slash (50%): the rest can be withdrawn after the cooldown", async () => {
      const env = await staked(MIN, [MIN, MIN], 5_000);
      const j = await acceptedJob(env);
      expectOk(await env.submitProof(j.job, [env.validators[V0], env.validators[V1]], { stakes: keys(env, [V0, V1]) }));
      expectOk(await env.challenge(j.job));
      expectOk(await env.resolveChallenge(j.job, true, [env.validators[V1], env.validators[V2]], { stakes: keys(env, [V0, V1]), stakeVault: true }));
      expect(env.balance(env.farmerToken)).to.equal(usdc(1770)); // 1270 + 2 x 250
      const v = env.validators[V0];
      expect(env.stakeOf(v).amount.toString()).to.equal(usdc(250).toString());
      expectOk(await env.requestUnstake(v));
      env.warp(60);
      expectOk(await env.withdrawStake(v));
      expect(env.balance(env.validatorToken(v))).to.equal(START_BALANCE - usdc(250));
    });

    it("challenge rejected (proof upheld): no slash, stake locks released", async () => {
      const env = await staked(MIN);
      const j = await acceptedJob(env);
      expectOk(await env.submitProof(j.job, [env.validators[V0], env.validators[V1]], { stakes: keys(env, [V0, V1]) }));
      expectOk(await env.challenge(j.job));
      expectOk(await env.resolveChallenge(j.job, false, [env.validators[V1], env.validators[V2]], { stakes: keys(env, [V0, V1]) }));
      expect(env.balance(env.operatorToken)).to.equal(usdc(1315)); // 1000 - 300 + 615
      expect(env.balance(pda.stakeVault())).to.equal(2n * MIN);
      for (const i of [V0, V1]) {
        const s = env.stakeOf(env.validators[i]);
        expect(s.slashed).to.equal(false);
        expect(s.amount.toString()).to.equal(MIN.toString());
        expect(s.openCosigns).to.equal(0);
      }
    });

    it("challenge upheld on a proof signed without stakes (min 0): old flow, nothing slashed", async () => {
      const env = await staked(0n);
      const j = await env.provenJob(); // no stake accounts presented
      expectOk(await env.challenge(j.job));
      expectOk(await env.resolveChallenge(j.job, true, [env.validators[V1], env.validators[V2]]));
      expect(env.balance(env.farmerToken)).to.equal(usdc(1270));
      expect(env.stakeOf(env.validators[V0]).slashed).to.equal(false);
    });

    it("migrate_config grows a pre-staking Config (372 bytes); admin only; idempotent", async () => {
      const env = new Env();
      await env.ready();
      const cfg = pda.config();
      const acc = env.svm.getAccount(cfg)!;
      const oldData = Buffer.from(acc.data).subarray(0, 372);
      env.svm.setAccount(cfg, { ...acc, data: oldData, lamports: Number(env.svm.minimumBalanceForRentExemption(372n)) });
      expect(env.svm.getAccount(cfg)!.data.length).to.equal(372);
      // Unmigrated config can't be used by the new layout.
      expect((await env.postJob()).r.constructor.name).to.equal("FailedTransactionMetadata");
      expectErr(await env.migrateConfig(env.outsider), "Unauthorized");
      expectOk(await env.migrateConfig());
      const after = env.svm.getAccount(cfg)!;
      expect(after.data.length).to.be.greaterThan(372);
      expect(BigInt(after.lamports) >= env.svm.minimumBalanceForRentExemption(BigInt(after.data.length))).to.equal(true);
      const c = env.fetch("config", cfg);
      expect(c.minValidatorStake.toString()).to.equal("0");
      expect(c.slashBps).to.equal(10_000);
      expect(c.validatorCount).to.equal(3);
      expect(c.challengeWindowSecs.toString()).to.equal("60");
      expectOk(await env.migrateConfig()); // no-op
      const j = await env.provenJob();
      env.warp(61);
      expectOk(await env.settle(j.job));
    });

    it("a job posted before the upgrade (no co-signer record) works at min 0, refuses co-signing at min > 0", async () => {
      const env = await staked(0n);
      const shrink = (job: any) => {
        const a = env.svm.getAccount(job)!;
        const base = a.data.length - 232; // drop the co-signer record
        env.svm.setAccount(job, { ...a, data: Buffer.from(a.data).subarray(0, base) });
      };
      const j = await acceptedJob(env);
      shrink(j.job);
      expectOk(await env.submitProof(j.job, [env.validators[V0], env.validators[V1]], { stakes: keys(env, [V0, V1]) }));
      expect(env.stakeOf(env.validators[V0]).openCosigns).to.equal(0); // nothing to record into
      expectOk(await env.challenge(j.job));
      expectOk(await env.resolveChallenge(j.job, true, [env.validators[V1], env.validators[V2]]));

      expectOk(await env.setStakingParams(env.admin, MIN));
      const j2 = await acceptedJob(env);
      shrink(j2.job);
      expectErr(
        await env.submitProof(j2.job, [env.validators[V0], env.validators[V1]], { stakes: keys(env, [V0, V1]) }),
        "JobPredatesStaking",
      );
    });
  });
});
