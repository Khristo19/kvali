// Fetch Sentinel-2 L2A true-colour crops + NDVI stats for the demo fields (CDSE Sentinel Hub APIs).
// Run: node scripts/satellite-fetch.mjs   (credentials read from ../.env at runtime, never printed)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'data', 'satellite');
mkdirSync(OUT, { recursive: true });
const TOKEN_URL = 'https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token';
const PROCESS = 'https://sh.dataspace.copernicus.eu/api/v1/process';
const STATS = 'https://sh.dataspace.copernicus.eu/api/v1/statistics';

const THRESHOLDS = { good_min: 0.55, medium_min: 0.35 };
// Visual review: field-3 on 2026-09-27 shows thin haze that SCL does not flag; use the clearer 09-24 pass.
const SKIP_IMAGE_DATES = { 'field-3': ['2026-09-27'] };
const DAYS = 90, MARGIN_M = 60, GAIN = 2.5, MAX_IMG_CLOUD = 10, MIN_VALID = 60;

function loadEnv() {
  const env = {};
  for (const l of readFileSync(join(ROOT, '.env'), 'utf8').split('\n')) {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return env;
}
const env = loadEnv();
async function getToken() {
  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: env.COPERNICUS_CLIENT_ID, client_secret: env.COPERNICUS_CLIENT_SECRET }),
  });
  console.log('token HTTP', r.status);
  if (!r.ok) throw new Error('token failed');
  return (await r.json()).access_token;
}
const token = await getToken();
const auth = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };

const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => iso(new Date(Date.parse(s + 'T00:00:00Z') + n * 864e5));
const today = iso(new Date());
const rangeTo = addDays(today, 1);
const rangeFrom = addDays(rangeTo, -DAYS);

const BAD = '[0,1,3,8,9,10]';
const EVAL_NDVI = `//VERSION=3
function setup(){return{input:[{bands:["B04","B08","SCL","dataMask"]}],output:[{id:"ndvi",bands:1},{id:"dataMask",bands:1}]}}
function evaluatePixel(s){var bad=${BAD}.indexOf(s.SCL)>=0;return{ndvi:[(s.B08-s.B04)/(s.B08+s.B04)],dataMask:[(s.dataMask&&!bad)?1:0]}}`;
const EVAL_CLOUD = `//VERSION=3
function setup(){return{input:[{bands:["SCL","dataMask"]}],output:[{id:"cloud",bands:1},{id:"valid",bands:1},{id:"dataMask",bands:1}]}}
function evaluatePixel(s){var c=[3,8,9,10].indexOf(s.SCL)>=0?1:0;var b=${BAD}.indexOf(s.SCL)>=0?0:1;return{cloud:[c],valid:[b],dataMask:[s.dataMask]}}`;
const EVAL_TC = `//VERSION=3
function setup(){return{input:["B04","B03","B02"],output:{bands:3,sampleType:"AUTO"}}}
function evaluatePixel(s){return[${GAIN}*s.B04,${GAIN}*s.B03,${GAIN}*s.B02]}`;

async function post(url, body, what) {
  for (let i = 0; i < 3; i++) {
    const r = await fetch(url, { method: 'POST', headers: auth, body: JSON.stringify(body) });
    console.log(what, 'HTTP', r.status);
    if (r.ok) return r;
    if (r.status < 500 && r.status !== 429) { console.log((await r.text()).slice(0, 300)); throw new Error(what + ' failed'); }
    await new Promise((s) => setTimeout(s, 2000 * (i + 1)));
  }
  throw new Error(what + ' failed');
}

async function stats(feature, evalscript, from, to, agg, resx, resy) {
  const body = {
    input: { bounds: { geometry: feature.geometry, properties: { crs: 'http://www.opengis.net/def/crs/EPSG/0/4326' } },
      data: [{ type: 'sentinel-2-l2a', dataFilter: { mosaickingOrder: 'leastCC' } }] },
    aggregation: { timeRange: { from: from + 'T00:00:00Z', to: to + 'T00:00:00Z' }, aggregationInterval: { of: agg }, evalscript, resx, resy },
  };
  return (await (await post(STATS, body, `stats ${feature.properties.id} ${agg}`)).json()).data;
}
const bandStat = (o, id) => o?.[id]?.bands?.B0?.stats;

for (const f of []) void f;
const fc = JSON.parse(readFileSync(join(ROOT, 'data', 'demo-fields.geojson'), 'utf8'));
const result = {
  generatedAt: new Date().toISOString(),
  source: 'Copernicus Sentinel-2 L2A via Copernicus Data Space Ecosystem',
  attribution: 'Contains modified Copernicus Sentinel data 2026',
  health_thresholds: { metric: 'mean NDVI over field polygon, cloud-masked', good: `>= ${THRESHOLDS.good_min}`, medium: `${THRESHOLDS.medium_min} to < ${THRESHOLDS.good_min}`, poor: `< ${THRESHOLDS.medium_min}`, note: 'Vineyards in early autumn (post-veraison, pre-leaf-fall). Indicates canopy vigour only, not proof of spraying.' },
  cloud_mask: 'SCL classes 3,8,9,10 counted as cloud/shadow; 0,1 also excluded from NDVI. cloud_pct = share of field pixels in 3,8,9,10.',
  fields: {},
};

for (const feat of fc.features) {
  const id = feat.properties.id;
  const ring = feat.geometry.coordinates[0];
  const lons = ring.map((p) => p[0]), lats = ring.map((p) => p[1]);
  const latC = (Math.min(...lats) + Math.max(...lats)) / 2;
  const dLat = 1 / 111320, dLon = 1 / (111320 * Math.cos((latC * Math.PI) / 180));
  const resy = 10 * dLat, resx = 10 * dLon;
  const bbox = [Math.min(...lons) - MARGIN_M * dLon, Math.min(...lats) - MARGIN_M * dLat, Math.max(...lons) + MARGIN_M * dLon, Math.max(...lats) + MARGIN_M * dLat];
  const width = Math.round((bbox[2] - bbox[0]) / resx), height = Math.round((bbox[3] - bbox[1]) / resy);

  // NDVI (5-day) and cloud/valid (5-day and daily)
  const nd = await stats(feat, EVAL_NDVI, rangeFrom, rangeTo, 'P5D', resx, resy);
  const c5 = await stats(feat, EVAL_CLOUD, rangeFrom, rangeTo, 'P5D', resx, resy);
  const c1 = await stats(feat, EVAL_CLOUD, rangeFrom, rangeTo, 'P1D', resx, resy);
  const cloudMap = (arr) => Object.fromEntries(arr.map((d) => [d.interval.from.slice(0, 10), d.outputs]));
  const c5m = cloudMap(c5);
  const series = [];
  let latestCloud = null;
  for (const d of nd) {
    const s = bandStat(d.outputs, 'ndvi');
    if (!s || !(s.sampleCount > 0) || s.mean == null || Number.isNaN(s.mean)) continue;
    const date = d.interval.from.slice(0, 10);
    const vs = bandStat(c5m[date], 'valid');
    const valid = vs ? 100 * vs.mean : 100 * (s.sampleCount - s.noDataCount) / s.sampleCount;
    if (valid < MIN_VALID) continue;
    series.push({ date, ndvi: +s.mean.toFixed(3), valid_pct: +valid.toFixed(1) });
    const cs = bandStat(c5m[date], 'cloud');
    latestCloud = cs ? +(100 * cs.mean).toFixed(1) : null;
  }

  // daily days with full coverage of the field; pick images
  const days = c1.map((d) => ({ date: d.interval.from.slice(0, 10), cloud: 100 * (bandStat(d.outputs, 'cloud')?.mean ?? 1), valid: 100 * (bandStat(d.outputs, 'valid')?.mean ?? 0) }))
    .filter((d) => d.valid > 0 || d.cloud < 100);
  // dataMask limits stats to the polygon; require real coverage (not no-data) of >= 95% of the field
  const ok = days.filter((d) => d.valid + d.cloud >= 95);
  const clear = ok.filter((d) => d.cloud <= MAX_IMG_CLOUD && !(SKIP_IMAGE_DATES[id] || []).includes(d.date)).sort((a, b) => b.date.localeCompare(a.date));
  const pickDates = [];
  if (clear.length) {
    const latest = clear[0];
    pickDates.push(latest);
    const target = addDays(latest.date, -42);
    const prior = clear.slice(1).filter((d) => d.date < addDays(latest.date, -14))
      .sort((a, b) => Math.abs(Date.parse(a.date) - Date.parse(target)) - Math.abs(Date.parse(b.date) - Date.parse(target)));
    if (prior[0]) pickDates.push(prior[0]);
  }
  const images = [];
  for (const d of pickDates) {
    const body = {
      input: { bounds: { bbox, properties: { crs: 'http://www.opengis.net/def/crs/EPSG/0/4326' } },
        data: [{ type: 'sentinel-2-l2a', dataFilter: { timeRange: { from: d.date + 'T00:00:00Z', to: addDays(d.date, 1) + 'T00:00:00Z' }, mosaickingOrder: 'leastCC' } }] },
      output: { width, height, responses: [{ identifier: 'default', format: { type: 'image/png' } }] },
      evalscript: EVAL_TC,
    };
    const r = await post(PROCESS, body, `process ${id} ${d.date}`);
    const buf = Buffer.from(await r.arrayBuffer());
    const file = `${id}-truecolor-${d.date}.png`;
    writeFileSync(join(OUT, file), buf);
    console.log('  wrote', file, buf.length, 'bytes', `${width}x${height}`);
    images.push({ date: d.date, file, cloud_pct: +d.cloud.toFixed(1) });
  }

  const last = series[series.length - 1];
  const health = !last ? null : last.ndvi >= THRESHOLDS.good_min ? 'good' : last.ndvi >= THRESHOLDS.medium_min ? 'medium' : 'poor';
  result.fields[id] = {
    latest: last ? { date: last.date, ndvi: last.ndvi, cloud_pct: latestCloud } : null,
    series, health, images,
    image_bbox: bbox.map((v) => +v.toFixed(6)), image_size: [width, height],
  };
}
writeFileSync(join(OUT, 'field-health.json'), JSON.stringify(result, null, 2) + '\n');
console.log('wrote field-health.json');
