# Design decisions

Short records of the choices that shape the product. Change them here, with the reason, before changing the code.

## D1 — No token; settle in USDC

Farmers pay operators directly (peer-to-peer). A token subsidy in a peer-to-peer market lets one person with two wallets hire themselves and farm the reward; staking only sets a price on that fraud. So: USDC settlement, an operator bond in USDC, and non-transferable reputation.
*Source: Wuollet, "Why DePIN matters, and how to make it work," a16z crypto, 2025.*

## D2 — Verify dispensed volume, not the flight path

A drone flying the pattern with the pump off produces the same GPS track as one that sprayed, so no mechanism can get the truth from GPS alone. We use four signals together: flow-meter volume, liters per hectare against the agronomic band, a random water-sensitive-card spot check by a field validator (~10% of jobs), and the farmer's right to challenge (with a bond). Goal: make fraud unprofitable, not impossible.
*Source: Milionis et al., "Manipulated signals in DePIN protocols," a16z crypto, 2025.*

## D3 — Nobody's word settles a job: the farmer is a witness, not a judge

*Changed 28 Sep 2026.* The first draft let the farmer confirm or dispute. A dispute was free, so a farmer could freeze the operator's money and bargain for a discount, and the dispute was decided by one key held by us. Both undermine the point of putting this on-chain.

Now:
- A proof that passes the on-chain checks and is co-signed by data validators **settles automatically after 24 hours**. No approval step.
- The farmer can **challenge** within that window only by locking **20% of the job** and committing to evidence. Lose, and that money goes to the operator (and the panel fee). 20% hurts a bluffer but stays affordable for an honest farmer.
- A **panel of field validators** (2 of 3 in v1) rules, signing an inspection report hash. Kvali holds no seat.
- Every farmer has a public **FarmerProfile** (challenges won and lost), so operators can see serial challengers.

Trade-off: with the farmer removed as gatekeeper, the drone data carries more weight. That's why random spot checks (D9) and, later, a signing device (D11) matter.

## D4 — The bond goes to the farmer, not a treasury

If slashed funds went to a treasury, farmer and operator could collude against it. Paid to the counterparty, there is nothing to collude for.

## D5 — Data validators co-sign `submit_proof`, and the program re-checks the numbers

M-of-N data validators (2 of 3 in v1) independently recompute the verdict from the Arweave manifest and co-sign. The program still enforces coverage ≥ 95% and the liters/ha band itself, so even colluding validators can't pass impossible numbers. Replaces the single verifier key of the first draft.

## D6 — Farmers never see crypto

The distributor sells the service in lari while USDC settles underneath (the "DePIN mullet"). Embedded wallet with social login; no "install Phantom".

## D7 — Expo / React Native front-end (changed 7 Oct 2026; was Angular)

One codebase for web, Android and iOS. Farmers get an embedded wallet (email or Google sign-in); operators and validators can use Phantom.

## D8 — Out of scope for v1

Token, DAO governance, on-chain reputation maths, permissionless validator staking (v2), autonomous docking stations. Docking gets one sentence in the roadmap.

## D9 — Validator network, progressively decentralized

Three layers: **data validators** (run the check software, co-sign proofs), **field validators** (random spot checks with spray cards on ~10% of jobs; the challenge panel), and later **device validators** (D11).

v1 is a permissioned set of three, chosen for **balanced interests**, 2 of 3 to act:

| Seat | Candidate | Leans toward |
|---|---|---|
| Operator side | DJI distributor's agronomist / technical team | operators |
| Farmer side | Georgian Farmers' Association or a Kakheti co-op | farmers |
| Neutral | Agricultural University of Georgia agronomist, or an exporter's quality team | neither |

Neither side can win without the neutral vote, and Kvali holds no seat. v2: anyone can join by staking USDC (not a token, D1); validators are assigned at random (Switchboard randomness) after a job is accepted; nobody validates their own region; votes against the majority or against clear evidence are slashed.

## D10 — 5% fee: 3% Kvali, 2% validators; challenges pay for themselves

Taken from the job amount when the operator is paid: 3% Kvali treasury, 1% data validators, 1% spot-check pool (a field visit costs roughly $30 [assumption]; at ~10% of jobs checked, 1% of a $300 job funds it). A resolved challenge adds a 10% panel fee from the loser's funds, so the honest side pays nothing for the dispute. v1: the validator pool is a multisig of the validators who split it off-chain; v2: on-chain claims.

## D11 — Roadmap: a signing device on the drone

A sealed flow-meter + GNSS add-on that signs readings on the device. Removes trust in the DJI export and in data validators' inputs, and is the true DePIN hardware layer. After the hackathon.

## D12 — Calibration certificates: Kvali owns the standard, not the field

*Added 28 Sep 2026.* Every operator + drone pair must pass a calibration test before accepting jobs: flow-meter error ≤ 5% against the weighed tank, spray cards across the swath, and a practical flying and safety check. A field validator records it on-chain (`issue_certificate`); a 2-of-3 panel can revoke it. Kvali publishes the open standard ([CALIBRATION.md](CALIBRATION.md)); any qualified validator can run a test strip anywhere, so it scales worldwide without Kvali owning land. First site: Kakheti, with the DJI distributor.

## D13 — Privacy: encrypted records now, private payments next

*Decided 7 Oct 2026.* Spray records on Arweave are encrypted; the farmer holds the key and shares it with validators, buyers or insurers. Payment privacy (who paid whom, operator earnings) comes later through **Hinkal**, which launched on Solana in March 2026 and has a React Native SDK. The escrow amount itself stays public because the program checks bonds and fees.

## D14 — Hackathon submission scope

*Decided 7 Oct 2026.* Crypto World's Fair, **Solana track**, submitted solo. Real program on devnet with realistic **simulated** spray records, stated openly. The challenge window is a Config setting: 24 h for real jobs, 60 s on the demo deployment. Satellite field check built into the demo with free Sentinel-2 imagery (Copernicus Data Space, 10,000 processing units a month free); images are pre-fetched by a local script so the API secret never ships in the app. It checks the field, not the spray.

## D15 — A revoked certificate is final

*Decided 8 Oct 2026.* Once a 2-of-3 panel revokes an operator + drone certificate, that pair can never be certified again (`CertificateRevoked`). The way back is a new drone that passes the calibration test and gets its own certificate. A non-revoked certificate can still be renewed when it expires.
