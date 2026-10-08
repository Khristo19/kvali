//! Kvali (proof of spray) — escrowed, volume-verified agricultural spray jobs.
//!
//! Nobody's word settles a job — not the farmer's, not the operator's, not
//! ours. A proof co-signed by M-of-N data validators that passes the on-chain
//! rate and coverage checks pays out automatically after a challenge window.
//! A farmer can challenge only by locking a challenge bond; a panel of field
//! validators rules, and the loser pays.
//!
//! The job's USDC vault holds the farmer's payment, the operator's bond and,
//! if challenged, the farmer's challenge bond. The winner receives all of it.
//!
//! v1: the validator set is permissioned (set by admin). v2: validators join by
//! staking USDC and are assigned at random. See docs/DECISIONS.md.
//!
//! Compiles with `anchor build` (k02, rules tightened in k03) but is not yet
//! covered by tests (k04):
//! do not trust it with real funds until it is.

use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};

// Kept in sync with target/deploy/kvali-keypair.json by `anchor keys sync`.
declare_id!("2TWg6cMa7bxFa8y7HHoDXZecNJxcbYrUAqwfrg5T8FPK");

/// Default challenge window for real jobs (24 h). The live value is
/// `Config::challenge_window_secs`, set by the admin (60 s on the demo
/// deployment, D14).
pub const CHALLENGE_WINDOW_SECS: i64 = 24 * 60 * 60;
/// Shortest allowed challenge window (1 minute, demo use).
pub const MIN_CHALLENGE_WINDOW_SECS: i64 = 60;
/// Longest allowed challenge window (7 days).
pub const MAX_CHALLENGE_WINDOW_SECS: i64 = 7 * 24 * 60 * 60;
/// A proof may claim at most 105% of the posted area (GPS / swath slack).
pub const MAX_AREA_OVERSHOOT_PCT: u64 = 105;
/// A farmer's challenge bond, as a share of the job amount (20%).
pub const CHALLENGE_BOND_BPS: u64 = 2_000;
/// Proof must cover at least 95% of the posted area.
pub const MIN_COVERAGE_BPS: u64 = 9_500;
pub const BPS: u64 = 10_000;
pub const MAX_VALIDATORS: usize = 7;
/// Taken from the job amount when the operator is paid (total fee 5%).
pub const KVALI_FEE_BPS: u64 = 300;
/// 1% to data validators + 1% to the field spot-check pool.
pub const VALIDATOR_FEE_BPS: u64 = 200;
/// Paid to the validator pool out of the loser's funds when a challenge is
/// resolved. Always covered: the loser's bond is at least 20% of the job.
pub const PANEL_FEE_BPS: u64 = 1_000;
/// A drone's flow meter may disagree with the weighed tank by at most 5%
/// in its calibration test (docs/CALIBRATION.md).
pub const MAX_METER_ERROR_BPS: u16 = 500;

#[program]
pub mod kvali {
    use super::*;

    pub fn initialize_config(
        ctx: Context<InitializeConfig>,
        validators: Vec<Pubkey>,
        proof_threshold: u8,
        panel_threshold: u8,
        challenge_window_secs: i64,
    ) -> Result<()> {
        check_challenge_window(challenge_window_secs)?;
        let config = &mut ctx.accounts.config;
        config.challenge_window_secs = challenge_window_secs;
        config.admin = ctx.accounts.admin.key();
        config.usdc_mint = ctx.accounts.usdc_mint.key();
        config.treasury = ctx.accounts.treasury.key();
        config.validator_pool = ctx.accounts.validator_pool.key();
        config.bump = ctx.bumps.config;
        apply_validator_set(config, validators, proof_threshold, panel_threshold)
    }

    /// v1 governance: admin replaces the validator set. Move admin to a
    /// multisig before mainnet.
    pub fn set_validators(
        ctx: Context<SetValidators>,
        validators: Vec<Pubkey>,
        proof_threshold: u8,
        panel_threshold: u8,
    ) -> Result<()> {
        apply_validator_set(
            &mut ctx.accounts.config,
            validators,
            proof_threshold,
            panel_threshold,
        )
    }

    /// Admin changes the challenge window (60 s ..= 7 days). Applies to
    /// proofs submitted afterwards; open windows keep their deadline.
    pub fn set_challenge_window(
        ctx: Context<SetValidators>,
        challenge_window_secs: i64,
    ) -> Result<()> {
        check_challenge_window(challenge_window_secs)?;
        ctx.accounts.config.challenge_window_secs = challenge_window_secs;
        Ok(())
    }

    pub fn register_operator(ctx: Context<RegisterOperator>) -> Result<()> {
        let operator = &mut ctx.accounts.operator;
        operator.authority = ctx.accounts.authority.key();
        operator.jobs_completed = 0;
        operator.jobs_failed = 0;
        operator.active_job = None;
        operator.bump = ctx.bumps.operator;
        Ok(())
    }

    /// Farmer posts a job and funds the escrow vault with `amount` USDC.
    #[allow(clippy::too_many_arguments)]
    pub fn post_job(
        ctx: Context<PostJob>,
        job_id: u64,
        amount: u64,
        field_hash: [u8; 32],
        chemical_code: u16,
        target_rate_ml_per_ha: u32,
        tolerance_bps: u16,
        area_cha: u32,
        spray_deadline: i64,
    ) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        require!(amount > 0, KvaliError::InvalidAmount);
        require!(area_cha > 0, KvaliError::InvalidArea);
        require!(target_rate_ml_per_ha > 0, KvaliError::InvalidRate);
        require!((tolerance_bps as u64) < BPS, KvaliError::InvalidRate);
        require!(spray_deadline > now, KvaliError::InvalidDeadline);

        let profile = &mut ctx.accounts.farmer_profile;
        if profile.authority == Pubkey::default() {
            profile.authority = ctx.accounts.farmer.key();
            profile.bump = ctx.bumps.farmer_profile;
        }
        profile.jobs_posted = profile
            .jobs_posted
            .checked_add(1)
            .ok_or(KvaliError::MathOverflow)?;

        let job = &mut ctx.accounts.job;
        job.farmer = ctx.accounts.farmer.key();
        job.operator = Pubkey::default();
        job.job_id = job_id;
        job.amount = amount;
        job.bond_amount = 0;
        job.challenge_bond = 0;
        job.field_hash = field_hash;
        job.chemical_code = chemical_code;
        job.target_rate_ml_per_ha = target_rate_ml_per_ha;
        job.tolerance_bps = tolerance_bps;
        job.area_cha = area_cha;
        job.drone_hash = [0; 32];
        job.proof_hash = [0; 32];
        job.evidence_hash = [0; 32];
        job.report_hash = [0; 32];
        job.liters_ml = 0;
        job.area_covered_cha = 0;
        job.state = JobState::Posted;
        job.created_at = now;
        job.spray_deadline = spray_deadline;
        job.challenge_deadline = 0;
        job.bump = ctx.bumps.job;
        job.vault_bump = ctx.bumps.vault;

        token_interface::transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.farmer_token.to_account_info(),
                    mint: ctx.accounts.usdc_mint.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.farmer.to_account_info(),
                },
            ),
            amount,
            ctx.accounts.usdc_mint.decimals,
        )
    }

    /// Farmer withdraws a job nobody has accepted yet.
    pub fn cancel_job<'info>(ctx: Context<'_, '_, '_, 'info, Settle<'info>>) -> Result<()> {
        require!(
            ctx.accounts.job.state == JobState::Posted,
            KvaliError::InvalidState
        );
        require_keys_eq!(
            ctx.accounts.caller.key(),
            ctx.accounts.job.farmer,
            KvaliError::Unauthorized
        );
        let total = ctx.accounts.vault.amount;
        transfer_from_vault(&ctx, ctx.accounts.farmer_token.to_account_info(), total)?;
        ctx.accounts.job.state = JobState::Cancelled;
        Ok(())
    }

    /// A field validator records a calibration test for one operator + drone
    /// (docs/CALIBRATION.md). Re-running the test renews the certificate,
    /// unless a validator panel has revoked it: a revocation is final for
    /// that operator + drone pair (one validator cannot undo a panel).
    pub fn issue_certificate(
        ctx: Context<IssueCertificate>,
        drone_hash: [u8; 32],
        meter_error_bps: u16,
        operator_passed: bool,
        report_hash: [u8; 32],
        valid_until: i64,
    ) -> Result<()> {
        let config = &ctx.accounts.config;
        let set = &config.validators[..config.validator_count as usize];
        require!(
            set.contains(&ctx.accounts.validator.key()),
            KvaliError::Unauthorized
        );
        require!(
            valid_until > Clock::get()?.unix_timestamp,
            KvaliError::InvalidDeadline
        );

        let cert = &mut ctx.accounts.certificate;
        // init_if_needed: a fresh account has revoked == false, so this only
        // trips when re-issuing over a revoked certificate.
        require!(!cert.revoked, KvaliError::CertificateRevoked);
        cert.operator = ctx.accounts.operator_authority.key();
        cert.drone_hash = drone_hash;
        cert.meter_error_bps = meter_error_bps;
        cert.operator_passed = operator_passed;
        cert.report_hash = report_hash;
        cert.issued_by = ctx.accounts.validator.key();
        cert.issued_at = Clock::get()?.unix_timestamp;
        cert.valid_until = valid_until;
        cert.revoked = false;
        cert.bump = ctx.bumps.certificate;
        Ok(())
    }

    /// A validator panel withdraws a certificate, e.g. after a spot check
    /// shows the drone's meter no longer matches reality.
    /// The certificate's own operator never counts toward the panel.
    pub fn revoke_certificate(ctx: Context<RevokeCertificate>) -> Result<()> {
        let signers = count_validator_signers(
            &ctx.accounts.config,
            ctx.remaining_accounts,
            &[ctx.accounts.certificate.operator],
        );
        require!(
            signers >= ctx.accounts.config.panel_threshold as usize,
            KvaliError::NotEnoughValidators
        );
        ctx.accounts.certificate.revoked = true;
        Ok(())
    }

    /// Operator accepts and locks a bond of at least the job amount. The
    /// drone they will fly must hold a valid calibration certificate.
    pub fn accept_job(ctx: Context<AcceptJob>, bond_amount: u64) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let cert = &ctx.accounts.certificate;
        require!(
            !cert.revoked
                && cert.operator_passed
                && cert.valid_until > now
                && cert.meter_error_bps <= MAX_METER_ERROR_BPS,
            KvaliError::NotCertified
        );

        let job = &mut ctx.accounts.job;
        let operator = &mut ctx.accounts.operator;
        require!(job.state == JobState::Posted, KvaliError::InvalidState);
        require_keys_neq!(
            ctx.accounts.authority.key(),
            job.farmer,
            KvaliError::OperatorIsFarmer
        );
        require!(bond_amount >= job.amount, KvaliError::BondTooSmall);
        require!(operator.active_job.is_none(), KvaliError::OperatorBusy);
        require!(now < job.spray_deadline, KvaliError::DeadlinePassed);

        job.operator = ctx.accounts.authority.key();
        job.drone_hash = cert.drone_hash;
        job.bond_amount = bond_amount;
        job.state = JobState::Accepted;
        operator.active_job = Some(job.key());

        token_interface::transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.operator_token.to_account_info(),
                    mint: ctx.accounts.usdc_mint.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.authority.to_account_info(),
                },
            ),
            bond_amount,
            ctx.accounts.usdc_mint.decimals,
        )
    }

    /// Operator submits the proof. At least `proof_threshold` data validators
    /// must co-sign (passed as signer remaining accounts). The program itself
    /// re-checks the liters-per-hectare band and coverage. Validators who
    /// are the job's farmer or operator do not count. Must land no later than
    /// the spray deadline (after it, only `reclaim_expired` applies).
    pub fn submit_proof(
        ctx: Context<SubmitProof>,
        proof_hash: [u8; 32],
        liters_ml: u64,
        area_covered_cha: u32,
    ) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let window = ctx.accounts.config.challenge_window_secs;
        let signers = count_validator_signers(
            &ctx.accounts.config,
            ctx.remaining_accounts,
            &[ctx.accounts.job.farmer, ctx.accounts.job.operator],
        );
        require!(
            signers >= ctx.accounts.config.proof_threshold as usize,
            KvaliError::NotEnoughValidators
        );

        let job = &mut ctx.accounts.job;
        require!(job.state == JobState::Accepted, KvaliError::InvalidState);
        require!(now <= job.spray_deadline, KvaliError::ProofAfterDeadline);
        require!(area_covered_cha > 0, KvaliError::InvalidArea);

        // Upper bound: at most MAX_AREA_OVERSHOOT_PCT of the posted area.
        let covered_pct = (area_covered_cha as u64)
            .checked_mul(100)
            .ok_or(KvaliError::MathOverflow)?;
        let max_pct = (job.area_cha as u64)
            .checked_mul(MAX_AREA_OVERSHOOT_PCT)
            .ok_or(KvaliError::MathOverflow)?;
        require!(covered_pct <= max_pct, KvaliError::AreaExceedsPosted);

        // Coverage: at least MIN_COVERAGE_BPS of the posted area.
        let covered_bps = (area_covered_cha as u64)
            .checked_mul(BPS)
            .ok_or(KvaliError::MathOverflow)?;
        let min_bps = (job.area_cha as u64)
            .checked_mul(MIN_COVERAGE_BPS)
            .ok_or(KvaliError::MathOverflow)?;
        require!(covered_bps >= min_bps, KvaliError::InsufficientCoverage);

        // Applied rate in ml/ha. area is in hundredths of a hectare.
        // u128 cannot overflow here: every factor is at most 64 bits wide.
        let bps = BPS as u128;
        let applied = (liters_ml as u128) * 100 / (area_covered_cha as u128);
        let target = job.target_rate_ml_per_ha as u128;
        let tol = job.tolerance_bps as u128;
        let lo = target * (bps - tol) / bps;
        let hi = target * (bps + tol) / bps;
        require!(applied >= lo && applied <= hi, KvaliError::RateOutOfBand);

        job.proof_hash = proof_hash;
        job.liters_ml = liters_ml;
        job.area_covered_cha = area_covered_cha;
        job.state = JobState::ProofSubmitted;
        job.challenge_deadline = now.checked_add(window).ok_or(KvaliError::MathOverflow)?;
        Ok(())
    }

    /// Permissionless: once the challenge window closes unchallenged, the
    /// operator receives payment plus their bond back. No approval needed.
    pub fn settle<'info>(ctx: Context<'_, '_, '_, 'info, Settle<'info>>) -> Result<()> {
        require!(
            ctx.accounts.job.state == JobState::ProofSubmitted,
            KvaliError::InvalidState
        );
        require!(
            Clock::get()?.unix_timestamp > ctx.accounts.job.challenge_deadline,
            KvaliError::WindowOpen
        );
        finish(ctx, Recipient::Operator, JobState::Released, false)
    }

    /// Farmer challenges within the window by locking a challenge bond
    /// (20% of the job) and committing to their evidence. Funds freeze until
    /// the field-validator panel rules.
    pub fn challenge(ctx: Context<Challenge>, evidence_hash: [u8; 32]) -> Result<()> {
        let job = &mut ctx.accounts.job;
        require!(job.state == JobState::ProofSubmitted, KvaliError::InvalidState);
        require!(
            Clock::get()?.unix_timestamp <= job.challenge_deadline,
            KvaliError::WindowClosed
        );
        let bond = job
            .amount
            .checked_mul(CHALLENGE_BOND_BPS)
            .ok_or(KvaliError::MathOverflow)?
            / BPS;
        job.challenge_bond = bond;
        job.evidence_hash = evidence_hash;
        job.state = JobState::Challenged;

        token_interface::transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.farmer_token.to_account_info(),
                    mint: ctx.accounts.usdc_mint.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.farmer.to_account_info(),
                },
            ),
            bond,
            ctx.accounts.usdc_mint.decimals,
        )
    }

    /// The field-validator panel rules on a challenge. At least
    /// `panel_threshold` validators must sign (signer remaining accounts) and
    /// commit to their inspection report. The loser's funds go to the winner.
    /// Validators who are the job's farmer or operator do not count.
    pub fn resolve_challenge<'info>(
        ctx: Context<'_, '_, '_, 'info, Settle<'info>>,
        upheld: bool,
        report_hash: [u8; 32],
    ) -> Result<()> {
        require!(
            ctx.accounts.job.state == JobState::Challenged,
            KvaliError::InvalidState
        );
        let signers = count_validator_signers(
            &ctx.accounts.config,
            ctx.remaining_accounts,
            &[ctx.accounts.job.farmer, ctx.accounts.job.operator],
        );
        require!(
            signers >= ctx.accounts.config.panel_threshold as usize,
            KvaliError::NotEnoughValidators
        );
        ctx.accounts.job.report_hash = report_hash;

        if upheld {
            let p = &mut ctx.accounts.farmer_profile;
            p.challenges_won = p.challenges_won.checked_add(1).ok_or(KvaliError::MathOverflow)?;
            finish(ctx, Recipient::Farmer, JobState::Refunded, true)
        } else {
            let p = &mut ctx.accounts.farmer_profile;
            p.challenges_lost = p.challenges_lost.checked_add(1).ok_or(KvaliError::MathOverflow)?;
            finish(ctx, Recipient::Operator, JobState::Released, true)
        }
    }

    /// Operator accepted but never proved by the spray deadline:
    /// farmer gets the payment back plus the bond. Permissionless.
    pub fn reclaim_expired<'info>(ctx: Context<'_, '_, '_, 'info, Settle<'info>>) -> Result<()> {
        require!(
            ctx.accounts.job.state == JobState::Accepted,
            KvaliError::InvalidState
        );
        require!(
            Clock::get()?.unix_timestamp > ctx.accounts.job.spray_deadline,
            KvaliError::DeadlineNotReached
        );
        finish(ctx, Recipient::Farmer, JobState::Refunded, false)
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn apply_validator_set(
    config: &mut Config,
    validators: Vec<Pubkey>,
    proof_threshold: u8,
    panel_threshold: u8,
) -> Result<()> {
    let n = validators.len();
    require!(n > 0 && n <= MAX_VALIDATORS, KvaliError::InvalidValidatorSet);
    require!(
        proof_threshold >= 1 && (proof_threshold as usize) <= n,
        KvaliError::InvalidValidatorSet
    );
    require!(
        panel_threshold >= 1 && (panel_threshold as usize) <= n,
        KvaliError::InvalidValidatorSet
    );
    for (i, v) in validators.iter().enumerate() {
        require!(
            !validators[..i].contains(v),
            KvaliError::InvalidValidatorSet
        );
    }
    config.validators = [Pubkey::default(); MAX_VALIDATORS];
    config.validators[..n].copy_from_slice(&validators);
    config.validator_count = n as u8;
    config.proof_threshold = proof_threshold;
    config.panel_threshold = panel_threshold;
    Ok(())
}

fn check_challenge_window(secs: i64) -> Result<()> {
    require!(
        (MIN_CHALLENGE_WINDOW_SECS..=MAX_CHALLENGE_WINDOW_SECS).contains(&secs),
        KvaliError::InvalidChallengeWindow
    );
    Ok(())
}

/// Distinct validators from the configured set that signed this transaction.
/// Keys in `excluded` (the job's farmer and operator: conflict of interest)
/// never count, even if they are in the set.
fn count_validator_signers(config: &Config, accounts: &[AccountInfo], excluded: &[Pubkey]) -> usize {
    let set = &config.validators[..config.validator_count as usize];
    let mut seen: Vec<Pubkey> = Vec::with_capacity(set.len());
    for acc in accounts {
        if acc.is_signer
            && set.contains(acc.key)
            && !excluded.contains(acc.key)
            && !seen.contains(acc.key)
        {
            seen.push(*acc.key);
        }
    }
    seen.len()
}

#[derive(Clone, Copy, PartialEq)]
enum Recipient {
    Farmer,
    Operator,
}

/// Moves `amount` out of the job vault, signed by the job PDA.
fn transfer_from_vault<'info>(
    ctx: &Context<'_, '_, '_, 'info, Settle<'info>>,
    to: AccountInfo<'info>,
    amount: u64,
) -> Result<()> {
    if amount == 0 {
        return Ok(());
    }
    let job = &ctx.accounts.job;
    let farmer_key = job.farmer;
    let job_id = job.job_id.to_le_bytes();
    let seeds: &[&[u8]] = &[b"job", farmer_key.as_ref(), &job_id, &[job.bump]];

    token_interface::transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.vault.to_account_info(),
                mint: ctx.accounts.usdc_mint.to_account_info(),
                to,
                authority: job.to_account_info(),
            },
            &[seeds],
        ),
        amount,
        ctx.accounts.usdc_mint.decimals,
    )
}

/// Empties the vault: fees first, the rest to the winner. Updates the
/// operator's record and frees them for the next job.
///
/// Operator wins: 3% Kvali + 2% validators, from the job amount.
/// Challenge resolved: plus a panel fee to validators, from the loser's funds.
fn finish<'info>(
    ctx: Context<'_, '_, '_, 'info, Settle<'info>>,
    to: Recipient,
    end_state: JobState,
    panel: bool,
) -> Result<()> {
    let total = ctx.accounts.vault.amount;
    let amount = ctx.accounts.job.amount;
    let fee = |bps: u64| -> Result<u64> {
        Ok(amount.checked_mul(bps).ok_or(KvaliError::MathOverflow)? / BPS)
    };
    let (mut kvali_fee, mut validator_fee) = (0u64, 0u64);
    if to == Recipient::Operator {
        kvali_fee = fee(KVALI_FEE_BPS)?;
        validator_fee = fee(VALIDATOR_FEE_BPS)?;
    }
    if panel {
        validator_fee = validator_fee
            .checked_add(fee(PANEL_FEE_BPS)?)
            .ok_or(KvaliError::MathOverflow)?;
    }
    let fees = kvali_fee
        .checked_add(validator_fee)
        .ok_or(KvaliError::MathOverflow)?;
    let payout = total
        .checked_sub(fees)
        .ok_or(KvaliError::InsufficientFunds)?;

    let winner = match to {
        Recipient::Farmer => ctx.accounts.farmer_token.to_account_info(),
        Recipient::Operator => ctx
            .accounts
            .operator_token
            .as_ref()
            .ok_or(KvaliError::MissingOperatorAccount)?
            .to_account_info(),
    };
    transfer_from_vault(&ctx, ctx.accounts.treasury_token.to_account_info(), kvali_fee)?;
    transfer_from_vault(&ctx, ctx.accounts.validator_pool_token.to_account_info(), validator_fee)?;
    transfer_from_vault(&ctx, winner, payout)?;

    let operator = ctx
        .accounts
        .operator
        .as_mut()
        .ok_or(KvaliError::MissingOperatorAccount)?;
    match to {
        Recipient::Operator => {
            operator.jobs_completed = operator
                .jobs_completed
                .checked_add(1)
                .ok_or(KvaliError::MathOverflow)?
        }
        Recipient::Farmer => {
            operator.jobs_failed = operator
                .jobs_failed
                .checked_add(1)
                .ok_or(KvaliError::MathOverflow)?
        }
    }
    operator.active_job = None;
    ctx.accounts.job.state = end_state;
    Ok(())
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub admin: Pubkey,
    pub usdc_mint: Pubkey,
    /// USDC token account receiving the 3% Kvali fee.
    pub treasury: Pubkey,
    /// USDC token account receiving validator fees (v1: a multisig of the
    /// validators, who split it off-chain; v2: on-chain claims).
    pub validator_pool: Pubkey,
    /// v1 permissioned validator set; unused slots are Pubkey::default().
    pub validators: [Pubkey; MAX_VALIDATORS],
    pub validator_count: u8,
    /// Data validators needed to co-sign a proof.
    pub proof_threshold: u8,
    /// Field validators needed to rule on a challenge.
    pub panel_threshold: u8,
    /// Seconds a passing proof stays open to challenge (D14: 24 h real,
    /// 60 s demo). Bounded by MIN/MAX_CHALLENGE_WINDOW_SECS.
    pub challenge_window_secs: i64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Operator {
    pub authority: Pubkey,
    pub jobs_completed: u32,
    pub jobs_failed: u32,
    pub active_job: Option<Pubkey>,
    pub bump: u8,
}

/// Public record of a farmer's behaviour, so operators can see serial
/// challengers before accepting.
#[account]
#[derive(InitSpace)]
pub struct FarmerProfile {
    pub authority: Pubkey,
    pub jobs_posted: u32,
    pub challenges_won: u32,
    pub challenges_lost: u32,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Job {
    pub farmer: Pubkey,
    pub operator: Pubkey,
    pub job_id: u64,
    /// USDC base units (6 decimals).
    pub amount: u64,
    pub bond_amount: u64,
    pub challenge_bond: u64,
    /// SHA-256 of the field polygon GeoJSON.
    pub field_hash: [u8; 32],
    pub chemical_code: u16,
    pub target_rate_ml_per_ha: u32,
    pub tolerance_bps: u16,
    /// Area in hundredths of a hectare (1 cha = 100 m²).
    pub area_cha: u32,
    /// SHA-256 of the certified drone's serial number; the proof manifest
    /// must come from this drone.
    pub drone_hash: [u8; 32],
    /// SHA-256 of the Arweave proof manifest.
    pub proof_hash: [u8; 32],
    /// SHA-256 of the farmer's challenge evidence.
    pub evidence_hash: [u8; 32],
    /// SHA-256 of the validator panel's inspection report.
    pub report_hash: [u8; 32],
    pub liters_ml: u64,
    pub area_covered_cha: u32,
    pub state: JobState,
    pub created_at: i64,
    pub spray_deadline: i64,
    pub challenge_deadline: i64,
    pub bump: u8,
    pub vault_bump: u8,
}

/// Calibration certificate for one operator flying one drone.
#[account]
#[derive(InitSpace)]
pub struct Certificate {
    pub operator: Pubkey,
    /// SHA-256 of the drone serial number.
    pub drone_hash: [u8; 32],
    /// |reported liters − weighed liters| / weighed liters, in basis points.
    pub meter_error_bps: u16,
    /// Operator passed the practical part (planning, accuracy, safety).
    pub operator_passed: bool,
    /// SHA-256 of the full test report (cards, photos, weights) on Arweave.
    pub report_hash: [u8; 32],
    pub issued_by: Pubkey,
    pub issued_at: i64,
    pub valid_until: i64,
    pub revoked: bool,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum JobState {
    Posted,
    Accepted,
    ProofSubmitted,
    Challenged,
    Released,
    Refunded,
    Cancelled,
}

// ---------------------------------------------------------------------------
// Instruction contexts
// ---------------------------------------------------------------------------

/// Only the program's upgrade authority may initialise the config, so nobody
/// can front-run the deployment and make themselves admin.
#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(init, payer = admin, space = 8 + Config::INIT_SPACE, seeds = [b"config"], bump)]
    pub config: Account<'info, Config>,
    #[account(constraint = program.programdata_address()? == Some(program_data.key()) @ KvaliError::Unauthorized)]
    pub program: Program<'info, crate::program::Kvali>,
    #[account(constraint = program_data.upgrade_authority_address == Some(admin.key()) @ KvaliError::Unauthorized)]
    pub program_data: Account<'info, ProgramData>,
    pub usdc_mint: InterfaceAccount<'info, Mint>,
    #[account(token::mint = usdc_mint)]
    pub treasury: InterfaceAccount<'info, TokenAccount>,
    #[account(token::mint = usdc_mint)]
    pub validator_pool: InterfaceAccount<'info, TokenAccount>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetValidators<'info> {
    pub admin: Signer<'info>,
    #[account(mut, seeds = [b"config"], bump = config.bump, has_one = admin @ KvaliError::Unauthorized)]
    pub config: Account<'info, Config>,
}

#[derive(Accounts)]
pub struct RegisterOperator<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init, payer = authority, space = 8 + Operator::INIT_SPACE,
        seeds = [b"operator", authority.key().as_ref()], bump
    )]
    pub operator: Account<'info, Operator>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(job_id: u64)]
pub struct PostJob<'info> {
    #[account(mut)]
    pub farmer: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(address = config.usdc_mint)]
    pub usdc_mint: InterfaceAccount<'info, Mint>,
    #[account(mut, token::mint = usdc_mint, token::authority = farmer)]
    pub farmer_token: InterfaceAccount<'info, TokenAccount>,
    #[account(
        init_if_needed, payer = farmer, space = 8 + FarmerProfile::INIT_SPACE,
        seeds = [b"farmer", farmer.key().as_ref()], bump
    )]
    pub farmer_profile: Account<'info, FarmerProfile>,
    #[account(
        init, payer = farmer, space = 8 + Job::INIT_SPACE,
        seeds = [b"job", farmer.key().as_ref(), &job_id.to_le_bytes()], bump
    )]
    pub job: Account<'info, Job>,
    #[account(
        init, payer = farmer,
        token::mint = usdc_mint, token::authority = job, token::token_program = token_program,
        seeds = [b"vault", job.key().as_ref()], bump
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(drone_hash: [u8; 32])]
pub struct IssueCertificate<'info> {
    #[account(mut)]
    pub validator: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    /// CHECK: only used as a PDA seed and stored as the certificate owner.
    pub operator_authority: UncheckedAccount<'info>,
    #[account(
        init_if_needed, payer = validator, space = 8 + Certificate::INIT_SPACE,
        seeds = [b"cert", operator_authority.key().as_ref(), drone_hash.as_ref()], bump
    )]
    pub certificate: Account<'info, Certificate>,
    pub system_program: Program<'info, System>,
}

/// Remaining accounts: the revoking validators (as signers).
#[derive(Accounts)]
pub struct RevokeCertificate<'info> {
    pub caller: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub certificate: Account<'info, Certificate>,
}

#[derive(Accounts)]
pub struct AcceptJob<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        seeds = [b"cert", authority.key().as_ref(), certificate.drone_hash.as_ref()],
        bump = certificate.bump
    )]
    pub certificate: Account<'info, Certificate>,
    #[account(
        mut, seeds = [b"operator", authority.key().as_ref()], bump = operator.bump,
        has_one = authority
    )]
    pub operator: Account<'info, Operator>,
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub job: Account<'info, Job>,
    #[account(mut, seeds = [b"vault", job.key().as_ref()], bump = job.vault_bump)]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    #[account(address = config.usdc_mint)]
    pub usdc_mint: InterfaceAccount<'info, Mint>,
    #[account(mut, token::mint = usdc_mint, token::authority = authority)]
    pub operator_token: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
}

/// Remaining accounts: the co-signing data validators (as signers).
#[derive(Accounts)]
pub struct SubmitProof<'info> {
    pub authority: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut, constraint = job.operator == authority.key() @ KvaliError::Unauthorized)]
    pub job: Account<'info, Job>,
}

#[derive(Accounts)]
pub struct Challenge<'info> {
    pub farmer: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut, has_one = farmer @ KvaliError::Unauthorized)]
    pub job: Account<'info, Job>,
    #[account(mut, seeds = [b"vault", job.key().as_ref()], bump = job.vault_bump)]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    #[account(address = config.usdc_mint)]
    pub usdc_mint: InterfaceAccount<'info, Mint>,
    #[account(mut, token::mint = usdc_mint, token::authority = farmer)]
    pub farmer_token: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
}

/// Shared by every instruction that empties the vault. Who may call is
/// checked inside each handler; where the money may go is fixed here.
/// Remaining accounts (resolve_challenge only): the ruling field validators.
#[derive(Accounts)]
pub struct Settle<'info> {
    pub caller: Signer<'info>,
    // Boxed (heap) to keep the handlers under the 4 KB SBF stack frame.
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut)]
    pub job: Box<Account<'info, Job>>,
    #[account(mut, seeds = [b"vault", job.key().as_ref()], bump = job.vault_bump)]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    #[account(address = config.usdc_mint)]
    pub usdc_mint: InterfaceAccount<'info, Mint>,
    #[account(mut, token::mint = usdc_mint, token::authority = job.farmer)]
    pub farmer_token: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, seeds = [b"farmer", job.farmer.as_ref()], bump = farmer_profile.bump)]
    pub farmer_profile: Account<'info, FarmerProfile>,
    /// Absent for `cancel_job` (no operator yet).
    #[account(mut, seeds = [b"operator", job.operator.as_ref()], bump = operator.bump)]
    pub operator: Option<Account<'info, Operator>>,
    #[account(mut, token::mint = usdc_mint, token::authority = job.operator)]
    pub operator_token: Option<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, address = config.treasury)]
    pub treasury_token: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, address = config.validator_pool)]
    pub validator_pool_token: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[error_code]
pub enum KvaliError {
    #[msg("Amount must be greater than zero")]
    InvalidAmount,
    #[msg("Area must be greater than zero")]
    InvalidArea,
    #[msg("Invalid target rate or tolerance")]
    InvalidRate,
    #[msg("Deadline must be in the future")]
    InvalidDeadline,
    #[msg("Job is not in the required state")]
    InvalidState,
    #[msg("Signer is not allowed to do this")]
    Unauthorized,
    #[msg("Bond must be at least the job amount")]
    BondTooSmall,
    #[msg("Operator already has an active job")]
    OperatorBusy,
    #[msg("Spray deadline has passed")]
    DeadlinePassed,
    #[msg("Spray deadline has not passed yet")]
    DeadlineNotReached,
    #[msg("Covered area is below the minimum")]
    InsufficientCoverage,
    #[msg("Applied liters per hectare is outside the tolerance band")]
    RateOutOfBand,
    #[msg("Challenge window is still open")]
    WindowOpen,
    #[msg("Challenge window has closed")]
    WindowClosed,
    #[msg("Operator accounts are required for this instruction")]
    MissingOperatorAccount,
    #[msg("Not enough validators signed")]
    NotEnoughValidators,
    #[msg("Validator set or thresholds are invalid")]
    InvalidValidatorSet,
    #[msg("Vault balance does not cover the fees")]
    InsufficientFunds,
    #[msg("Drone and operator need a valid calibration certificate")]
    NotCertified,
    #[msg("Challenge window must be between 60 seconds and 7 days")]
    InvalidChallengeWindow,
    #[msg("Certificate was revoked by a validator panel and cannot be re-issued")]
    CertificateRevoked,
    #[msg("Proof submitted after the spray deadline")]
    ProofAfterDeadline,
    #[msg("Covered area exceeds 105% of the posted area")]
    AreaExceedsPosted,
    #[msg("The job's farmer cannot accept their own job")]
    OperatorIsFarmer,
    #[msg("Arithmetic overflow")]
    MathOverflow,
}
