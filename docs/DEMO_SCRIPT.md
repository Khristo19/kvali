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

## Technical demo: the web app, 2:00 (validator bots and staking, 10 Oct)

Live site https://khristo19.github.io/kvali/ (devnet; test USDC). One browser, three roles. The arithmetic checks are automatic; humans only do certificates, spot checks and challenges.

| Time | Beat | Show |
|---|---|---|
| 0:00-0:20 | **Post the job** | Farmer page, "My fields": pick a field card (or "+ Add a field"), then "Spray this field". Real `post_job` tx; $300 sits in the vault PDA. The field card now shows "Waiting for an operator". Open the Explorer link. |
| 0:20-0:35 | **Operator accepts** | Operator page, Accept: the operator's $300 bond is locked on chain (`accept_job`). |
| 0:35-0:50 | **Flight** | Operator page, "Send the flight log": pick Honest flight, Send. (A real drone uploads its log; here it is a sample record.) |
| 0:50-1:15 | **Bots co-sign automatically** | Open the Validator page. "Bot verdicts": every bot ran coverage, L/ha band and flow-meter-vs-tank; 2 of 3 co-signed and `submit_proof` went on chain with no human click. Open the co-sign transaction on Explorer (three signers plus the stake accounts). Optional: send the Pump off record on another job; the bots refuse it, nothing is signed or paid. |
| 1:15-1:35 | **Stake card** | Each seat shows $500 staked, active, proofs co-signed, open co-signs. One line: "Checkers lock their own USDC. If a panel rules that a proof they signed was false, their stake goes to the farmer and they lose their seat." Unstake and withdraw are switched off for the public demo seats; slashing is proven by the program tests, not run on the shared demo keys. |
| 1:35-1:50 | **Settle and payout** | The 60 s window closes and the app settles by itself: operator $285 plus the $300 bond back, treasury $9, validator pool $6. Show Operator earnings and the farmer's "Operator paid" card. After settle the app calls `release_cosign` for each co-signer, so open co-signs go back to 0. |
| 1:50-2:00 | **Explorer links** | Job story page: every step has its Explorer link and "Adds up". |

## Presenter mode (record the web demo)

Open https://khristo19.github.io/kvali/?present=1 (staging: https://khristo19.github.io/kvali/staging/?present=1). Any page works with `?present=1`; the flag stays on for that browser tab. Without it the site is exactly what a user sees, so everything shown on screen is the real user environment. There are no demo controls on the pages themselves.

- A small **Presenter** button sits in the bottom-right corner. It opens the presenter drawer. **Shift+P** also opens and closes the drawer.
- **Recording**: "Hide the Presenter button" removes the button for a clean screen. Shift+P still opens the drawer, and "Show the Presenter button" brings the button back.
- **Exit presenter** (or opening any page with `?present=0`) turns presenter mode off.

What each drawer section does:

1. **Network**: the network status, the switch between the live network and the in-browser simulation, and the Explorer link of the last transaction.
2. **Act as**: which farmer and which operator account this browser uses (Farmer 1, Farmer 2, ...; "+ New farmer account" creates and funds another one; switching reloads the page and the drawer stays open), and which of the 3 validator seats you act as.
3. **Job shortcuts**: play the other side so one role can be shown alone: operator accepts the job, operator sends one of the sample records, settle now, or run the rest of the job automatically (post, accept, honest record).
4. **Jump to**: Home, Farmer, Operator, Validator, Job story, How it works.
5. **Recording**: hide or show the Presenter button.
6. **Reset**: "Reset this browser" forgets the accounts, the wallets created in this browser and the current job.

Notes for recording:

- Record on the live site (`https://khristo19.github.io/kvali/farmer?present=1`). Staging also shows a STAGING badge, which users never see.
- New accounts made in "Act as" are funded from the shared demo bank, so make only the accounts you need.
- The countdown after the flight log is the real 60 s challenge window. The job settles by itself about 5 s after it closes; "Settle now" on the page is the user fallback and the drawer's "Settle now" does the same.
- The only network notice users see is a quiet line on the home page ("Runs on Solana's test network with test money.") and an alert if the network cannot be reached.
