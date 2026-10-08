import { Platform, View } from "react-native";

import type { XY } from "@/geo/geo";

/** A straight line drawn as one rotated View (no SVG library is installed). */
export function Line({ a, b, color, width = 3 }: { a: XY; b: XY; color: string; width?: number }) {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len < 0.5) return null;
  const ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        left: (a.x + b.x) / 2 - len / 2,
        top: (a.y + b.y) / 2 - width / 2,
        width: len,
        height: width,
        backgroundColor: color,
        borderRadius: width / 2,
        transform: [{ rotate: `${ang}deg` }],
      }}
    />
  );
}

/** Dashed line: the shape differs from a solid line, not just the colour. */
export function DashedLine({ a, b, color, width = 3.5, dash = 8, gap = 6 }: { a: XY; b: XY; color: string; width?: number; dash?: number; gap?: number }) {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const out = [];
  for (let d = 0, i = 0; d < len; d += dash + gap, i++) {
    const e = Math.min(len, d + dash);
    const p = (t: number): XY => ({ x: a.x + ((b.x - a.x) * t) / len, y: a.y + ((b.y - a.y) * t) / len });
    out.push(<Line key={i} a={p(d)} b={p(e)} color={color} width={width} />);
  }
  return <>{out}</>;
}

/** Closed outline. */
export function Outline({ pts, color, width = 3.5, dashed }: { pts: XY[]; color: string; width?: number; dashed?: boolean }) {
  if (pts.length < 2) return null;
  const L = dashed ? DashedLine : Line;
  const n = pts.length < 3 ? pts.length - 1 : pts.length;
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <L key={i} a={pts[i]} b={pts[(i + 1) % pts.length]} color={color} width={width} />
      ))}
    </>
  );
}

/** Translucent fill. Web only (CSS clip-path); native just shows the outline. */
export function Fill({ pts, color, width, height }: { pts: XY[]; color: string; width: number; height: number }) {
  if (Platform.OS !== "web" || pts.length < 3) return null;
  const clipPath = `polygon(${pts.map((p) => `${p.x}px ${p.y}px`).join(",")})`;
  const style = { position: "absolute", left: 0, top: 0, width, height, backgroundColor: color, clipPath } as never;
  return <View pointerEvents="none" style={style} />;
}
