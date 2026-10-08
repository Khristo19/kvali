// SIMULATED drone GPS tracks. The demo spray records have no real tracks, so we generate a
// deterministic serpentine pattern from the field outline. Always label the result "simulated track".
import { centroidOf, distToPolygon, segLen, splitTrack, toLocalMeters, type LonLat, type Seg, type XY } from "./geo.ts";

export type TrackKind = "full" | "honest" | "half";

export interface SimTrack {
  origin: LonLat;
  /** Field outline in metres around `origin`. */
  poly: XY[];
  /** Track polyline in metres around `origin`. */
  points: XY[];
  segs: Seg[];
  insidePct: number;
  /** Number of separate runs that left the field. */
  leftRuns: number;
  /** Furthest distance outside the outline, metres. */
  maxOutM: number;
  /** Compass side of the biggest excursion ("east edge"). */
  outSide: string;
}

const SIDES = ["east", "north-east", "north", "north-west", "west", "south-west", "south", "south-east"];

export function simulateTrack(ring: LonLat[], kind: TrackKind): SimTrack {
  const origin = centroidOf(ring);
  const poly = toLocalMeters(ring, origin);

  // Pass direction: along the longest edge.
  let best = 0;
  let u: XY = { x: 1, y: 0 };
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    if (l > best) {
      best = l;
      u = { x: (b.x - a.x) / l, y: (b.y - a.y) / l };
    }
  }
  const v: XY = { x: -u.y, y: u.x };
  const pu = poly.map((p) => ({ u: p.x * u.x + p.y * u.y, v: p.x * v.x + p.y * v.y }));
  const vmin = Math.min(...pu.map((p) => p.v));
  const vmax = Math.max(...pu.map((p) => p.v));
  const spacing = Math.max(12, (vmax - vmin) / 10);
  const n = Math.max(2, Math.floor((vmax - vmin) / spacing));
  const first = (vmax - vmin - (n - 1) * spacing) / 2 + vmin;

  const passes: { v: number; lo: number; hi: number }[] = [];
  for (let k = 0; k < n; k++) {
    const c = first + k * spacing;
    const us: number[] = [];
    for (let i = 0; i < pu.length; i++) {
      const a = pu[i];
      const b = pu[(i + 1) % pu.length];
      if (a.v !== b.v && (a.v - c) * (b.v - c) <= 0) us.push(a.u + ((c - a.v) / (b.v - a.v)) * (b.u - a.u));
    }
    if (us.length >= 2) passes.push({ v: c, lo: Math.min(...us) + 2, hi: Math.max(...us) - 2 });
  }

  const count = kind === "half" ? Math.ceil(passes.length / 2) : passes.length;
  const overshootAt = kind === "honest" ? Math.floor(passes.length * 0.4) : -1;
  const pts: { u: number; v: number }[] = [];
  // Each turn happens at one shared u (the shorter of the two neighbouring passes), so turns stay inside the field.
  const turnU = (k: number, forward: boolean) => (forward ? Math.min(passes[k].hi, passes[k + 1].hi) - 1 : Math.max(passes[k].lo, passes[k + 1].lo) + 1);
  for (let k = 0; k < count; k++) {
    const p = passes[k];
    const forward = k % 2 === 0;
    const start = k === 0 ? (forward ? p.lo : p.hi) : turnU(k - 1, !forward);
    const end = k + 1 < count ? turnU(k, forward) : forward ? p.hi : p.lo;
    pts.push({ u: start, v: p.v }, { u: end, v: p.v });
    if (k === overshootAt && k + 1 < count) {
      const out = forward ? 13 : -13;
      pts.push({ u: end + out, v: p.v }, { u: end + out, v: passes[k + 1].v });
    }
  }
  const points = pts.map((q) => ({ x: q.u * u.x + q.v * v.x, y: q.u * u.y + q.v * v.y }));
  const segs = splitTrack(points, poly);

  const total = segs.reduce((s, x) => s + segLen(x), 0);
  const inside = segs.filter((s) => s.inside).reduce((s, x) => s + segLen(x), 0);
  let leftRuns = 0;
  let prev = true;
  let maxOutM = 0;
  let far: XY = { x: 0, y: 0 };
  for (const s of segs) {
    if (!s.inside && prev) leftRuns++;
    prev = s.inside;
    if (!s.inside) {
      const mid = { x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2 };
      const d = distToPolygon(mid, poly);
      if (d > maxOutM) {
        maxOutM = d;
        far = mid;
      }
    }
  }
  // Direction of the excursion from the field centre (map north = +y).
  const ang = (Math.atan2(far.y, far.x) * 180) / Math.PI;
  const outSide = SIDES[Math.round(((ang + 360) % 360) / 45) % 8];
  return { origin, poly, points, segs, insidePct: total > 0 ? (inside / total) * 100 : 0, leftRuns, maxOutM, outSide };
}

/** Which synthetic track belongs to which demo record. */
export function trackKindFor(sample: string): TrackKind {
  if (sample === "honest") return "honest";
  if (sample === "half-field") return "half";
  return "full";
}
