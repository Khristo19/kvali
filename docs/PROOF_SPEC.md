# Proof spec

## Pipeline

1. Operator uploads the flight record export (and tank weights, if weighed) in the app.
2. Proof service parses it into a `SprayRecord`: liters dispensed, area covered, track.
3. `computeVerdict` (services/proof/src/verdict.ts) runs the same checks as the program.
4. Build the manifest (below), hash it (SHA-256), upload to Arweave via Irys.
5. Data validators (2 of 3) each download the manifest, re-run `computeVerdict`, and co-sign `submit_proof(proof_hash, liters_ml, area_covered_cha)` if it passes.

## Signals

| # | Signal | Catches | Status |
|---|---|---|---|
| 1 | Flow-meter volume (+ tank weight change) | pump off, faked volume | **Unknown: can we export it? Phase A2** |
| 2 | Liters ÷ area in the agronomic band | pump off, half field, dumping, double dose | Implemented |
| 3 | Farmer challenge (20% bond, validator panel rules) | fraud the farmer saw | In program (`challenge` / `resolve_challenge`) |
| 4 | Field-validator spot check with water-sensitive cards (~10%, random) | water instead of chemical, fake fields | To build |

## Telemetry: questions for week 1

Lead: DJI SmartFarm shows per-operation records including operated area, operating hours and **volume of materials used**, plus flight trajectories ([DJI](https://www.dji.com/ag-platform)). The open question is export format and whether the data can be tampered with.

- [ ] Does the Agras app / DJI SmartFarm show liters sprayed and area per flight? Can it be exported (CSV, KML, other)?
- [ ] Are controller flight records readable, or encrypted?
- [ ] Is the record signed or tamper-evident in any way?
- [ ] Fallback if nothing is exportable: tank weight before and after + spot checks + challenge. Say so in the demo.

## Manifest (stored on Arweave; its SHA-256 goes on-chain)

```json
{
  "version": 1,
  "job": "<Job PDA>",
  "field_hash": "<sha256 of field GeoJSON>",
  "operator": "<operator pubkey>",
  "drone": { "model": "Agras T50", "serial_hash": "<sha256>" },
  "flights": [
    { "start": "2026-10-20T07:12:00Z", "end": "2026-10-20T07:31:00Z", "liters": 48.2, "area_ha": 4.9 }
  ],
  "totals": { "liters_ml": 200000, "area_covered_cha": 2000 },
  "weather": { "source": "open-meteo", "wind_ms": 2.1, "gust_ms": 3.4, "wind_dir_deg": 240, "temp_c": 18.5, "humidity_pct": 62, "label_wind_limit_ms": 4.0, "within_limits": true },
  "tank": { "kg_before": 60.0, "kg_after": 10.3, "mix_density_kg_per_l": 1.0 },
  "spot_check": { "selected": false, "photos": [], "coverage_pct": null },
  "verdict": { "pass": true, "applied_rate_ml_per_ha": 10000, "coverage_bps": 10000, "checks": [] },
  "raw_files": ["ar://<tx id of raw export>"],
  "validators": ["<data validator pubkeys that co-signed>"],
  "created_at": "2026-10-20T08:00:00Z"
}
```

## Spot-check scoring

Photo of a water-sensitive card → crop to the card → count pixels in the blue range → coverage %. Canvas threshold in the browser is enough for v1. Industry guidance for insecticides is often quoted around 20–30 droplets/cm²; check the target for each product with an agronomist before using it as a pass mark.

## Weather and drift record

For every flight, record the conditions during the spray window: wind speed, gusts, direction, temperature, humidity. v1 source: a weather API queried at the field centroid for the flight times; v2: an anemometer at the take-off point, logged in the app. Compare against the product label's wind limit and mark `within_limits`. A spray outside limits doesn't block payment on its own (the farmer decides), but it's visible in the record. It protects the operator in a drift complaint and makes the record worth more to insurers.
