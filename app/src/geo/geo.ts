// Geometry helpers for field outlines. Coordinates are [lon, lat] in degrees (GeoJSON order).
import { sha256Hex } from "./sha256.ts";

export type LonLat = [number, number];
export type XY = { x: number; y: number };

const R = 6371008.8; // mean earth radius, metres
const rad = (d: number) => (d * Math.PI) / 180;

/** Local equirectangular projection around the ring centroid, in metres. Error is far below 1% at field scale. */
export function toLocalMeters(ring: LonLat[], origin?: LonLat): XY[] {
  const o = origin ?? ring.reduce<LonLat>((a, p) => [a[0] + p[0] / ring.length, a[1] + p[1] / ring.length], [0, 0]);
  const kx = R * Math.cos(rad(o[1])) * (Math.PI / 180);
  const ky = R * (Math.PI / 180);
  return ring.map((p) => ({ x: (p[0] - o[0]) * kx, y: (p[1] - o[1]) * ky }));
}

export function fromLocalMeters(pts: XY[], origin: LonLat): LonLat[] {
  const kx = R * Math.cos(rad(origin[1])) * (Math.PI / 180);
  const ky = R * (Math.PI / 180);
  return pts.map((p) => [origin[0] + p.x / kx, origin[1] + p.y / ky]);
}

export function centroidOf(ring: LonLat[]): LonLat {
  return ring.reduce<LonLat>((a, p) => [a[0] + p[0] / ring.length, a[1] + p[1] / ring.length], [0, 0]);
}

/** Area in square metres (shoelace on the local projection). 0 for fewer than 3 points. */
export function areaM2(ring: LonLat[]): number {
  if (ring.length < 3) return 0;
  const p = toLocalMeters(ring);
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

export function areaHa(ring: LonLat[]): number {
  return areaM2(ring) / 10_000;
}

/** Hundredths of a hectare, the unit the job uses. */
export function areaCha(ring: LonLat[]): number {
  return Math.round(areaHa(ring) * 100);
}

/** Canonical GeoJSON Polygon text: [lon,lat] rounded to 6 decimals, ring closed, fixed key order. */
export function canonicalOutline(ring: LonLat[]): string {
  const r = ring.map((p) => [Number(p[0].toFixed(6)), Number(p[1].toFixed(6))]);
  if (r.length) r.push(r[0].slice());
  return JSON.stringify({ type: "Polygon", coordinates: [r] });
}

export function outlineHash(ring: LonLat[]): string {
  return sha256Hex(canonicalOutline(ring));
}

// Web Mercator pixel math (256 px tiles).
export function worldPx(p: LonLat, z: number): XY {
  const s = 256 * 2 ** z;
  const sin = Math.sin(rad(p[1]));
  return { x: ((p[0] + 180) / 360) * s, y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * s };
}

export function lonLatFromWorldPx(px: XY, z: number): LonLat {
  const s = 256 * 2 ** z;
  const lon = (px.x / s) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * px.y) / s;
  const lat = (Math.atan(Math.sinh(n)) * 180) / Math.PI;
  return [lon, lat];
}

/** Largest zoom (max 18) at which the points fit inside `fill` of the given view size. */
export function fitZoom(pts: LonLat[], w: number, h: number, fill = 0.7, maxZ = 18): number {
  for (let z = maxZ; z >= 3; z--) {
    const px = pts.map((p) => worldPx(p, z));
    const xs = px.map((p) => p.x);
    const ys = px.map((p) => p.y);
    if (Math.max(...xs) - Math.min(...xs) <= w * fill && Math.max(...ys) - Math.min(...ys) <= h * fill) return z;
  }
  return 3;
}

export function pointInPolygon(p: XY, poly: XY[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Distance in metres from p to the nearest polygon edge. */
export function distToPolygon(p: XY, poly: XY[]): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)));
  }
  return best;
}

export interface Seg {
  a: XY;
  b: XY;
  inside: boolean;
}

/** Split a polyline (metres) into runs that are inside / outside the polygon (sampled about every metre). */
export function splitTrack(track: XY[], poly: XY[]): Seg[] {
  const out: Seg[] = [];
  for (let i = 0; i + 1 < track.length; i++) {
    const a = track[i];
    const b = track[i + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y)));
    const at = (t: number): XY => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    let start = a;
    let state = pointInPolygon(at(0.5 / n), poly);
    for (let k = 1; k <= n; k++) {
      const last = k === n;
      const next = last ? state : pointInPolygon(at((k + 0.5) / n), poly);
      if (next !== state || last) {
        out.push({ a: start, b: at(k / n), inside: state });
        start = at(k / n);
        state = next;
      }
    }
  }
  return out.filter((s) => Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y) > 0.01);
}

export function segLen(s: { a: XY; b: XY }): number {
  return Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);
}
