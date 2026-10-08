# Technical demo, 2:00

How it works, not why. Don't pitch here.

| Time | Beat | Show |
|---|---|---|
| 0:00–0:15 | **Architecture** | The diagram from ARCHITECTURE.md. "A handful of Anchor instructions, one PDA per job, one per operator, and a 2-of-3 validator set. Everything else is off-chain on purpose." |
| 0:15–0:45 | **State machine in code** | Posted → Accepted → ProofSubmitted → Released, plus the challenge branch. Run `accept_job` with a bond below the job value and show it fail with `BondTooSmall`. |
| 0:45–1:15 | **Proof pipeline** | Open a real flight record. Liters dispensed, area covered, the liters/ha maths, the tolerance check in `submit_proof`. "A drone flying the pattern with the pump off leaves the same GPS track. That's why we verify volume, not path." Show `RateOutOfBand` on a pump-off record. |
| 1:15–1:40 | **Settlement on devnet** | Submit the proof, show the transaction in the explorer, the stored `proof_hash`, the Arweave manifest resolving. Two validators co-sign; after the window, anyone calls `settle`: operator paid minus 5%, bond back. Then show a challenge: farmer locks $60, panel rules, loser pays. |
| 1:40–2:00 | **Trust boundaries** | "Three validators today, with balanced seats: one close to operators, one to farmers, one neutral; we hold none. The program still re-checks the numbers. Here's the path to permissionless validators and a signing device." One sentence on the impossibility result. |

## Technical demo: the live devnet run (k08)

One command runs the whole 1:15-1:40 "Settlement on devnet" beat against the live program (devnet only, real 60 s window, no skip option):

```
cd ~/kvali
export PATH=~/.cargo/bin:~/.local/share/solana/install/active_release/bin:$PATH
npm run demo:devnet                 # scenarios A + B (about 2.5 minutes)
npm run demo:devnet -- --challenge  # also scenario C: farmer challenges, panel upholds
npm run demo:devnet -- --dry-run    # prints the plan, sends nothing
```

Run order and what to say while it runs:

1. Setup lines (first run only): fund test wallets, mint test USDC, register operator, issue calibration certificate. Skip over these.
2. **Scenario A, steps 1/7 to 7/7.** Farmer locks $300; operator locks a $300 bond; the proof hash is the SHA-256 of the manifest built by `services/proof`; two validators co-sign `submit_proof`. Narrate the 60 s countdown ("anyone could challenge now"). Then `settle`: operator +$585 net, treasury +$9, validator pool +$6, and the script checks these against `settlement.ts`. Open one or two Explorer links on screen.
3. **Scenario B.** Pump-off record (300 ml over 17 ha). The program rejects it with `RateOutOfBand`; the failed transaction is on chain too, so the Explorer link shows the error. Leave the job to expire: the next run refunds it automatically.
4. Optional scenario C (`--challenge`) for the challenge branch.

Record the console and cut to Explorer. Results (job ids, signatures, balances, manifest hash) are saved to `deploy/demo-run-latest.json`. The spray record is simulated; chain, escrow, signatures and money movement are real devnet.
