# Pixel-art simulation: "a day in the field"

**Final step.** Build after the real job in Phase C, so it can use real numbers and real screenshots.

A small browser page where you *play* one spray job end to end. It explains the product in 60 seconds to judges, farmers and the distributor, and gives the pitch a memorable moment.

## Scenes (one screen, a 2D pixel-art map of a Kakheti valley)

1. **Farmer's plot.** Click the farmer, drag to draw the field. A panel shows hectares, crop, chemical and the target L/ha. "Post job" drops USDC coins into a padlocked escrow chest.
2. **Operator's shed.** The operator walks out, puts their own coins into the chest (the bond). The chest shows payment + bond.
3. **Spray.** The drone flies lanes over the field and the tiles turn from dry to wet as it passes. A tank gauge drains and a flow-meter counter ticks up.
   - Toggle **"Pump off"**: the drone flies the same lanes but tiles stay dry and the counter stays at 0.
   - Toggle **"Skip half"**: only half the field turns wet.
4. **Proof.** A scroll flies to a stone tablet ("Arweave") and a hash is stamped onto a block ("Solana"). The verdict panel shows liters/ha against the band: ✅ or ❌.
5. **Settle.** Three validator sprites check the scroll and stamp it (2 of 3). A 24h sun-dial spins; the chest opens and coins fly to the operator (small coins peel off to the Kvali and validator pouches). Toggle **Challenge**: the farmer drops 20% of coins in the chest, the validator panel walks to the field with spray cards, votes, and the loser's coins move to the winner. All numbers from `settlement.ts`.
6. **Scoreboard.** Operator reputation +1, jobs completed, hectares verified.

Every number on screen comes from the same `computeVerdict` logic as the real proof service, so the game can't show something the product doesn't do.

## Optional: devnet mode

A "Play on devnet" switch that sends the real transactions to the deployed program with a burner wallet, and links each step to the explorer. Strong for the technical demo; do it only if the rest is done.

## Tech

- Single page, canvas-based. Phaser 3 or plain canvas; 16×16 tiles scaled 4×, a limited palette (the deck's field-green and harvest-orange).
- Sprites: farmer, operator, drone, chest, judge, tiles (dry, wet, road, vine rows). Free packs or hand-made in Aseprite/Piskel.
- Import `services/proof/src/verdict.ts` for the maths.
- Works on a phone (the distributor will show it to farmers).
- Georgian and English text.
