# data/satellite

Real Sentinel-2 L2A data for the demo fields, fetched by `node scripts/satellite-fetch.mjs` (needs COPERNICUS_CLIENT_ID / COPERNICUS_CLIENT_SECRET in `.env`; read at runtime, never written out).

- `field-health.json`
  - `generatedAt`, `source`, `attribution` ("Contains modified Copernicus Sentinel data 2026"; show it next to imagery), `health_thresholds`, `cloud_mask`.
  - `fields["field-N"]`:
    - `latest`: `{date, ndvi, cloud_pct}`, the newest 5-day interval with >= 60% valid pixels. `date` is the interval start; `cloud_pct` is the share of field pixels flagged cloud/shadow (SCL 3, 8, 9, 10) in that interval.
    - `series`: `[{date, ndvi, valid_pct}]`, last 90 days, 5-day intervals (date = interval start), mean NDVI over the field polygon after SCL masking. Intervals under 60% valid are omitted, so there can be gaps.
    - `health`: `"good"` (NDVI >= 0.55), `"medium"` (0.35 to < 0.55), `"poor"` (< 0.35). Vigour indicator only, not proof of spraying.
    - `images`: `[{date, file, cloud_pct}]`, newest first; `file` is relative to this folder; `cloud_pct` is the field's own cloud share that day.
    - `image_bbox`: `[west, south, east, north]` WGS84 of the PNGs (field bbox + 60 m margin); `image_size`: `[width, height]` px. Use these to place the PNG as a map image overlay; draw the polygon from `data/demo-fields.geojson`.
- `<id>-truecolor-<date>.png`: B04/B03/B02, gain 2.5, 10 m/px (small, e.g. 56x44; upscale with nearest-neighbour/`image-rendering: pixelated`). No outline burned in.
