# Validators

Nobody's word settles a job: not the farmer's, not the operator's, not Kvali's. Validators do. See DECISIONS.md D9–D12 for the reasoning.

## Two roles

### Data validator (desk)

**Does:** for every job, runs the Kvali node software, which:
1. downloads the proof manifest from Arweave,
2. recomputes liters/ha, coverage, GPS track vs field boundary, weather vs label limits, drone matches the certified `drone_hash` (`services/proof/src/verdict.ts`),
3. signs `submit_proof` if it passes. 2 of 3 signatures are needed.

**Equipment:** an always-on computer or small cloud server; a Solana wallet, ideally a hardware wallet; stable internet.

**Paid:** 1% of every settled job, shared by the signers.

### Field validator (on the ground)

**Does:**
- **Spot checks** on ~10% of jobs, chosen at random: places water-sensitive cards before the flight, photographs them after, the app scores coverage.
- **Challenge panel:** reviews evidence and votes within 48 h; visits the field if needed.
- **Calibration tests** for drones and operators ([CALIBRATION.md](CALIBRATION.md)); can issue certificates.

**Equipment:**

| Item | Why |
|---|---|
| Smartphone with GPS and camera, Kvali app | Location- and time-stamped photos that can't be reused |
| Water-sensitive paper cards, stakes or clips | Industry-standard check that spray landed |
| Portable anemometer | Wind at spray time |
| Scale (for calibration tests) | Weighing the tank before and after |
| PPE: gloves, mask | Entering freshly sprayed fields |
| Car | Reaching fields |
| Optional: leaf-sample bags | Lab residue test in serious disputes |

**Paid:** the 1% spot-check pool (≈ $30 per visit at ~10% of jobs [assumption]), 10% panel fee on disputed jobs (paid by the loser), calibration fees.

## Becoming a validator

| | v1 (hackathon, pilot) | v2 (open network) |
|---|---|---|
| Who | 3 invited seats: operator side (DJI distributor agronomist), farmer side (Farmers' Association / co-op), neutral (university agronomist or exporter QA) | Anyone who qualifies |
| Qualification (field) | Agronomist, certified operator, or pesticide-application licence | Same, verified by attestation |
| Training | Kvali protocol training and a short test | Same, online |
| Stake | USDC on chain (`stake_validator`); required to co-sign once the admin sets a minimum (demo: $500 each, minimum still 0) | Lock USDC (not a token); amount set so the stake exceeds a typical bribe |
| Assignment | By region, manually | Random (Switchboard randomness) after a job is accepted |
| Conflict rules | Never in own village; never for operators or farmers they know | Enforced by region data |

## Keeping validators honest

- Random assignment, so nobody knows in advance who checks which field
- No validation in their own area
- GPS- and time-stamped evidence only, through the app
- Public record of every signature and vote
- Built (D16): a co-signer's stake is slashed to the farmer when the challenge panel rules against the proof they signed; unstaking has a cooldown and waits for their open proofs
- v2: also slash for voting against clear evidence or missing assignments
