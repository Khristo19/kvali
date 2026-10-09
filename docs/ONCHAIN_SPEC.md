# On-chain spec

Program: `programs/kvali/src/lib.rs` (compiles with `anchor build` as of k03; not yet tested on a validator; program id `2TWg6cMa7bxFa8y7HHoDXZecNJxcbYrUAqwfrg5T8FPK`, not deployed). Settlement maths mirrored and tested in `services/proof/src/settlement.ts`.

**Principle:** nobody's word settles a job. A passing proof pays out automatically; a challenge costs money and is decided by validators, not by the farmer, the operator or Kvali.

## Units

| Field | Unit | Example |
|---|---|---|
| `amount`, `bond_amount`, `challenge_bond`, stakes | USDC base units (6 decimals) | 300 USDC = `300_000_000` |
| `area_cha`, `area_covered_cha` | hundredths of a hectare (100 m²) | 17 ha = `1700` |
| `target_rate_ml_per_ha` | milliliters per hectare | 10 L/ha = `10_000` |
| `tolerance_bps` | basis points | ±15% = `1500` |
| `liters_ml` | milliliters | 170 L = `170_000` |
| hashes | SHA-256, 32 bytes | field GeoJSON, proof manifest, challenge evidence, inspection report |

## Constants

| Constant | Value | Meaning |
|---|---|---|
| `CHALLENGE_WINDOW_SECS` | 24 h | Documented default. The live value is `Config.challenge_window_secs` (D14: 24 h real, 60 s demo) |
| `MIN_CHALLENGE_WINDOW_SECS` / `MAX_CHALLENGE_WINDOW_SECS` | 60 s / 7 days | Allowed range for the window setting |
| `MAX_AREA_OVERSHOOT_PCT` | 105% | A proof may claim at most this share of the posted area |
| `CHALLENGE_BOND_BPS` | 20% | What a farmer locks to challenge |
| `MIN_COVERAGE_BPS` | 95% | Minimum share of the posted area covered |
| `KVALI_FEE_BPS` | 3% | Kvali treasury, taken when the operator is paid |
| `VALIDATOR_FEE_BPS` | 2% | Validator pool (1% data validators + 1% spot-check pool), when the operator is paid |
| `PANEL_FEE_BPS` | 10% | Validator pool, taken from the loser's funds when a challenge is resolved |
| `MAX_VALIDATORS` | 7 | v1 permissioned set size |
| `MAX_METER_ERROR_BPS` | 5% | Max flow-meter error in the calibration test |
| `DEFAULT_UNSTAKE_COOLDOWN_SECS` | 7 days | Default `Config.unstake_cooldown_secs` (60 s on the demo deployment); allowed 60 s – 365 days |
| `DEFAULT_SLASH_BPS` | 100% | Default `Config.slash_bps`: share of a co-signer's stake slashed by an upheld challenge; allowed 1 – 10,000 bps |

## Accounts

| PDA | Seeds | Holds |
|---|---|---|
| `Config` | `["config"]` | admin, USDC mint, treasury and validator-pool token accounts, validator set, `proof_threshold`, `panel_threshold`, `challenge_window_secs`, then (staking) `min_validator_stake`, `unstake_cooldown_secs`, `slash_bps` |
| `ValidatorStake` | `["stake", validator]` | amount, unstake_requested_at, slashed, open_cosigns, proofs_cosigned, times_slashed, total_staked, total_slashed |
| Stake vault | `["stake_vault"]` | USDC token account owned by the Config PDA: all validator stakes |
| `Operator` | `["operator", authority]` | jobs_completed, jobs_failed, active_job |
| `FarmerProfile` | `["farmer", farmer]` | jobs_posted, challenges_won, challenges_lost (public, so operators can spot serial challengers) |
| `Job` | `["job", farmer, job_id (u64 LE)]` | terms, proof, evidence and report hashes, state, deadlines. Kept open after settlement as the record. Jobs posted after the staking upgrade carry a 232-byte **co-signer record** after the Anchor fields (count + up to 7 × validator key + flags `staked`/`released`); it is not part of the `Job` IDL type, so old jobs and old clients decode unchanged |
| `Certificate` | `["cert", operator, drone_hash]` | meter error, operator passed, report hash, issued by, valid until, revoked (final: a revoked pair cannot be re-issued) |
| Vault | `["vault", job]` | USDC token account owned by the Job PDA: payment + bond (+ challenge bond) |

## State machine

```
Posted ──accept_job──▶ Accepted ──submit_proof──▶ ProofSubmitted ──settle (after window)──▶ Released
  │                      │          (M-of-N data         │
cancel_job         reclaim_expired   validators)     challenge (20% bond)
  ▼              (after spray_deadline)                  ▼
Cancelled                ▼                          Challenged ──resolve_challenge──▶ Released | Refunded
                      Refunded                       (M-of-N field validators)
```

## Instructions

| Instruction | Signer(s) | Checks | Effect |
|---|---|---|---|
| `initialize_config(validators, proof_threshold, panel_threshold, challenge_window_secs)` | admin = **program upgrade authority** (checked via `program` + `program_data` accounts) | once; ≤7 unique validators; thresholds ≥1 and ≤ set size; window 60 s – 7 days | sets keys, mint, treasury, pool, window |
| `set_validators(...)` | admin | same | replaces validator set (v1 governance; admin → multisig before mainnet) |
| `set_challenge_window(challenge_window_secs)` | admin | 60 s – 7 days | changes the window for proofs submitted afterwards; open windows keep their deadline |
| `register_operator` | operator | once per key | creates Operator PDA |
| `post_job(job_id, amount, field_hash, chemical_code, rate, tolerance, area, spray_deadline)` | farmer | amount, area, rate > 0; deadline in future | creates Job, vault, FarmerProfile if new; deposits `amount` |
| `cancel_job` | farmer | Posted | full refund |
| `issue_certificate(drone_hash, meter_error_bps, operator_passed, report_hash, valid_until)` | one field validator from the set | valid_until in future; certificate not revoked | creates or renews the calibration certificate |
| `revoke_certificate` | ≥ panel_threshold validators (the certificate's operator does not count) | — | marks certificate revoked, permanently |
| `accept_job(bond_amount)` | operator | valid, unrevoked certificate with meter error ≤ 5% and operator passed; Posted; operator ≠ farmer; bond ≥ amount; not busy; before deadline | deposits bond; records the certified `drone_hash` on the job |
| `submit_proof(proof_hash, liters_ml, area_covered_cha)` | operator **+ ≥ proof_threshold data validators** (job's farmer/operator don't count) | Accepted; not after spray_deadline; 95% ≤ coverage ≤ 105% of posted area; liters/ha in band; if `min_validator_stake` > 0 only co-signers with an active stake ≥ min count (`ValidatorStakeTooLow`) | stores proof; opens the challenge window (`Config.challenge_window_secs`); records co-signers, locks presented stakes |
| `settle` | anyone | ProofSubmitted; window closed | operator gets vault − 5% |
| `challenge(evidence_hash)` | farmer | ProofSubmitted; window open | locks 20% challenge bond → Challenged |
| `resolve_challenge(upheld, report_hash)` | **≥ panel_threshold field validators** (job's farmer/operator don't count) | Challenged; upheld with staked co-signers: all their stake PDAs + the stake vault passed | upheld: farmer gets vault − 10% panel fee **plus `slash_bps` of every staked co-signer's stake**; rejected: operator gets vault − 5% − 10%, passed stakes released |
| `migrate_config` | admin | Config is the 372-byte pre-staking layout (no-op if already migrated) | grows Config, admin pays the rent; min 0, cooldown 7 days, slash 100% |
| `set_staking_params(min_validator_stake, unstake_cooldown_secs, slash_bps)` | admin | cooldown 60 s – 365 days; slash 1 – 10,000 bps | sets the staking rules; min 0 = no stake needed to co-sign |
| `stake_validator(amount)` | validator | amount > 0; not slashed; not unstaking | creates the stake PDA (and the stake vault) if needed; moves USDC into the vault |
| `request_unstake` | validator | stake > 0; not already requested | starts the cooldown; the stake stops counting for co-signing |
| `withdraw_stake` | validator | requested; cooldown passed; `open_cosigns` = 0 | returns the whole remaining stake |
| `release_cosign` | anyone | job Released; validator has an unreleased staked entry | frees that job's lock on the stake (`open_cosigns` − 1) |
| `reclaim_expired` | anyone | Accepted; spray_deadline passed | farmer gets payment + bond, no fees |

Validator signers are passed as signer `remaining_accounts` (stake PDAs, writable, may follow them in `submit_proof` and `resolve_challenge`); the program counts distinct keys from the configured set, skipping any key that is the job's farmer or operator (or, for `revoke_certificate`, the certificate's operator).

## Validator staking (k-stake, 10 Oct 2026)

- **Off by default.** `min_validator_stake` = 0 keeps the pre-staking behaviour: old clients (no stake accounts) work unchanged. With min 0 a co-signer *may* still present its stake PDA; it is then recorded as slashable.
- **Co-signing with min > 0.** The operator's transaction passes each co-signer's `ValidatorStake` PDA (writable) after the signers. Only stakes that are not slashed, not unstaking and ≥ min count. Each recorded stake gets `open_cosigns + 1`.
- **Slashing only by the panel.** `resolve_challenge(upheld = true)` must be given every staked co-signer's stake PDA (`MissingStakeAccount`) and the stake vault (`MissingStakeVault`), so the panel cannot skip anyone. Each loses `slash_bps` of their stake (default 100%, never more than the stake), the USDC goes to the farmer on top of the refund and the operator's bond, and the stake is marked `slashed`: it can never co-sign or stake again. Removing the seat from the set is admin cleanup. There is no admin slash instruction.
- **Withdrawal.** `request_unstake` → wait `unstake_cooldown_secs` → `withdraw_stake`. Blocked while `open_cosigns` > 0, i.e. while any proof the stake co-signed is in its window, challenged, or settled but not yet released (`release_cosign`, permissionless, after `settle`; `resolve_challenge` releases the passed stakes itself).
- **Migration.** Config grew by 18 bytes. The devnet Config was migrated with `migrate_config` right after the upgrade (`scripts/devnet-stake.ts`). Jobs posted before the upgrade have no co-signer record: they work as before at min 0 and fail `submit_proof` with `JobPredatesStaking` at min > 0 (they can still be reclaimed after the spray deadline).
- **Limits.** The panel's own votes are not staked; with min 0 a slashed validator can still co-sign without presenting the stake (the seat must be removed by the admin); stake PDAs are never closed.

Devnet: `npx ts-node --transpile-only scripts/devnet-stake.ts` (migrate, 60 s cooldown, stake the 3 demo validators $500 each), `--set-min <usdc>` to flip the minimum, `--status` to read.

## Errors added for staking

`InvalidConfigAccount`, `InvalidStakingParams`, `StakeSlashed`, `UnstakePending`, `NothingStaked`, `UnstakeAlreadyRequested`, `UnstakeNotRequested`, `CooldownNotElapsed`, `StakeLockedByOpenJobs`, `ValidatorStakeTooLow`, `JobPredatesStaking`, `StakeAccountNotWritable`, `InvalidStakeAccount`, `MissingStakeAccount`, `MissingStakeVault`, `NothingToRelease` (appended after `MathOverflow`; existing codes unchanged). Events: `ConfigMigrated`, `StakingParamsSet`, `ValidatorStaked`, `UnstakeRequested`, `StakeWithdrawn`, `ProofCosigned`, `CosignReleased`, `ValidatorSlashed`.

## Errors added in k03

| Error | When |
|---|---|
| `InvalidChallengeWindow` | window outside 60 s – 7 days |
| `CertificateRevoked` | `issue_certificate` over a revoked certificate |
| `ProofAfterDeadline` | `submit_proof` after `spray_deadline` |
| `AreaExceedsPosted` | `area_covered_cha` > 105% of `area_cha` |
| `OperatorIsFarmer` | `accept_job` by the job's own farmer |
| `MathOverflow` | checked arithmetic overflowed (should never happen with real values) |

`initialize_config` by anyone other than the upgrade authority fails with `Unauthorized`.

## Worked example ($300 job, $300 bond)

| Outcome | Farmer | Operator | Kvali | Validators |
|---|---|---|---|---|
| Settled, no challenge | — | $585 | $9 | $6 |
| Challenge rejected (farmer loses $60) | — | $615 | $9 | $36 |
| Challenge upheld | $630 | — | — | $30 |
| Operator never delivers | $600 | — | — | — |

## Known gaps to close

- Vault token accounts are not closed after settlement (rent stays locked). Add `close_account` once the flow is stable.
- `chemical_code` is a free number. Define a table (active ingredient → allowed rate band) off-chain, later on-chain.
- Handler lifetimes around `remaining_accounts` and the optional operator accounts now compile (k02); they still need tests (k04).
- `initialize_config` requires an upgradeable deployment (the default). If the program is ever deployed with `--final`, config can no longer be initialised.
- **v2:** permissionless validator joining (staking exists since 10 Oct, seats are still admin-set); random assignment with Switchboard randomness; nobody validates their own region; slashing for votes against the majority; on-chain split of the validator pool; Solana Attestation Service credentials.
