# Calibration standard (draft v0.1)

Before an operator can accept jobs, **their drone and their skills are tested on a calibration strip**. The result is an on-chain certificate (`issue_certificate`); `accept_job` refuses operators without a valid one.

**Principle:** Kvali owns the *standard*, not the *field*. Like vehicle inspection: the rules are public, and any qualified field validator anywhere can run the test on any suitable field. The first site is in Kakheti, run with the DJI distributor, who already trains and demos drones there.

All thresholds below are **starting values**. Agree them with the validator seats and the distributor's agronomists before the pilot.

## Why

The whole proof relies on the drone's flow meter. The calibration test checks that the meter tells the truth, that spray actually lands across the swath, and that the operator can fly safely. It also gives each drone a measured meter error that data validators can use.

## The test site

- A flat, open strip, about **100 m × 20 m**, away from houses, roads, water and neighbouring crops
- Wind below the label limit during the test (record it with the anemometer)
- **Water only**, no chemicals
- Cards: **10 water-sensitive cards** on stakes at crop height in a line across the strip, perpendicular to the flight direction, spaced evenly across the declared swath width

## The procedure

1. **Register:** the validator scans the drone's serial number in the app (the app hashes it: `drone_hash`) and records the operator's certification (GCAA remote pilot licence, pesticide licence).
2. **Weigh:** fill the tank, weigh the drone or tank. Photo of the scale.
3. **Fly:** the operator plans and flies the strip at the declared rate and swath width.
4. **Weigh again**, and read the liters the drone reports (SmartFarm or controller).
5. **Collect cards:** photograph each card with the app; it scores blue coverage per card.
6. **Practical check** by the validator: mission planning, boundary and obstacle settings, take-off and landing safety, PPE, and response to a simulated problem (e.g. a person walking into the area).
7. **Submit:** the app runs `scoreCalibration` (`services/proof/src/calibration.ts`), uploads the full report (weights, photos, cards, wind, GPS-stamped) to Arweave, and the validator signs `issue_certificate`.

## Pass marks (v0.1)

| Check | Pass |
|---|---|
| Meter error: \|reported − weighed\| / weighed | ≤ **5%** (`MAX_METER_ERROR_BPS = 500`) |
| Cards with acceptable coverage | ≥ **80%** of cards at ≥ **10%** blue coverage |
| Operator practical | Pass on every item |

## Validity and revocation

- A certificate is valid for **one season** (or until the drone's flow system or nozzles are repaired or replaced; the operator must re-test).
- A validator panel (2 of 3) can **revoke** a certificate (`revoke_certificate`), e.g. when spot checks show the meter drifting.
- The certificate covers **one operator flying one drone**. A second drone needs its own test.

## Fees

The operator pays a calibration fee to the validator who runs the test [amount to set with validators]. For the distributor it's a sales tool: every drone sold leaves calibrated and certified.

## Scaling worldwide

Any field validator can host a strip anywhere. The app enforces the procedure (GPS-stamped photos, weights, cards) so a test in Kenya is as checkable as one in Kakheti. v2: a second validator reviews each report remotely before the certificate counts.
