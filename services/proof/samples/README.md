# Sample spray records (SIMULATED)

**Everything in this folder is simulated demo data.** No real job, field, farmer, operator or drone is described. Every file carries `"simulated": true`, and every identifier (job PDA, operator, hashes) is a `SIMULATED-` placeholder.

All records are for the same job and the same DJI Agras T50 (40 L tank), sprayed on the morning of 14 Oct 2026 (07:12–09:00 local, UTC+4), wind 1.6–2.6 m/s (label limit 4 m/s).

| File | What it is | Expected verdict |
|---|---|---|
| `job-17ha.json` | Job terms: village batch job in Kakheti, 17 ha (`area_cha` 1700) of vineyard and hazelnut, 10 L/ha (`10000` ml/ha) ±15%, generic copper-based fungicide, deadline 16 Oct 2026. | – |
| `record-honest.json` | 5 flights, 170.8 L over 17.0 ha (10.05 L/ha); tank weights agree with the flow meter (171.0 L). | PASS |
| `record-pump-off.json` | Same flights and area, pump off: 0.3 L dispensed (0.02 L/ha). | FAIL on `rate` |
| `record-half-field.json` | 3 flights, 85.8 L over 8.55 ha: right rate, 50.3% coverage. | FAIL on `coverage` |
| `record-tank-mismatch.json` | Flow meter claims 170.8 L, but the tanks only lost 12.3 kg (12.2 L). | FAIL on `tank-crosscheck` |

Mapping to `SprayRecord`: `totals.liters_ml` → `litersMl`, `totals.area_covered_cha` → `areaCoveredCha`, `tank.kg_before` / `tank.kg_after` / `tank.mix_density_kg_per_l` → the tank fields. Tank weights are summed over the refills (one weighing before and after each flight). The `verdict` block in each manifest is the output of `computeVerdict`; `src/samples.test.ts` checks it.
