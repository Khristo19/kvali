import { useState } from "react";
import { PanResponder, StyleSheet, View } from "react-native";

import { fitZoom, type LonLat, type XY } from "@/geo/geo";
import { DEFAULT_CENTER, DEFAULT_OUTLINE } from "@/data/fields";
import { MapCanvas, onWidth, projector, type Viewport } from "./map-canvas";
import { Fill, Outline } from "./shapes";

class Gesture {
  private d: { index: number; start: XY } | null = null;
  get() {
    return this.d;
  }
  set(d: { index: number; start: XY } | null) {
    this.d = d;
  }
}

const HEIGHT = 380;
const HIT = 28;


/** Satellite map where you tap to add corners and drag corners to move them. */
export function DrawMap({ points, onChange }: { points: LonLat[]; onChange: (p: LonLat[]) => void }) {
  const [w, setW] = useState(350);
  const vp: Viewport = { width: w, height: HEIGHT, center: DEFAULT_CENTER, zoom: fitZoom(DEFAULT_OUTLINE, w, HEIGHT, 0.6, 17) };
  const { project, unproject } = projector(vp);
  const px = points.map(project);
  // Mutable gesture state shared by the responder callbacks.
  const [g0] = useState(() => new Gesture());

  const nearest = (q: XY, list: XY[]) => {
    let best = -1;
    let bd = HIT;
    list.forEach((p, i) => {
      const d = Math.hypot(p.x - q.x, p.y - q.y);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  };
  const mids: XY[] = px.length >= 3 ? px.map((p, i) => ({ x: (p.x + px[(i + 1) % px.length].x) / 2, y: (p.y + px[(i + 1) % px.length].y) / 2 })) : [];

  const pan = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (e) => {
      const q = { x: e.nativeEvent.locationX, y: e.nativeEvent.locationY };
      const h = nearest(q, px);
      if (h >= 0) {
        g0.set({ index: h, start: px[h] });
        return;
      }
      const m = nearest(q, mids);
      if (m >= 0) {
        const next = points.slice();
        next.splice(m + 1, 0, unproject(mids[m]));
        onChange(next);
        g0.set({ index: m + 1, start: mids[m] });
        return;
      }
      g0.set({ index: -1, start: q });
    },
    onPanResponderMove: (_e, g) => {
      const d = g0.get();
      if (!d || d.index < 0) return;
      const next = points.slice();
      next[d.index] = unproject({ x: d.start.x + g.dx, y: d.start.y + g.dy });
      onChange(next);
    },
    onPanResponderRelease: (_e, g) => {
      const d = g0.get();
      g0.set(null);
      if (d && d.index < 0 && Math.abs(g.dx) < 8 && Math.abs(g.dy) < 8) onChange([...points, unproject(d.start)]);
    },
  });

  return (
    <View style={styles.wrap} onLayout={onWidth(setW)}>
      <MapCanvas vp={vp}>
        <Fill pts={px} color="rgba(244,241,232,0.18)" width={w} height={HEIGHT} />
        <Outline pts={px} color="#F4F1E8" />
        {mids.map((m, i) => (
          <View key={`m${i}`} pointerEvents="none" style={[styles.mid, { left: m.x - 5, top: m.y - 5 }]} />
        ))}
        {px.map((p, i) => (
          <View key={i} pointerEvents="none" style={[styles.handle, { left: p.x - 11, top: p.y - 11 }]} />
        ))}
        <View style={styles.layer} {...pan.panHandlers} accessibilityLabel="Satellite map. Tap to add a corner of your field, drag a corner to move it." />
      </MapCanvas>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: 14, overflow: "hidden", borderWidth: 1, borderColor: "#DCD7C6", height: HEIGHT + 2, backgroundColor: "#33402C" },
  layer: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, cursor: "crosshair" } as never,
  handle: { position: "absolute", width: 22, height: 22, borderRadius: 11, backgroundColor: "#FBFAF5", borderWidth: 2.5, borderColor: "#16241C" },
  mid: { position: "absolute", width: 10, height: 10, borderRadius: 5, backgroundColor: "rgba(244,241,232,0.8)" },
});
