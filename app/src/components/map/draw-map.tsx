import { useEffect, useRef, useState } from "react";
import { PanResponder, Platform, StyleSheet, Text, View, type GestureResponderEvent } from "react-native";

import { Pressable } from "@/components/ui/pressable";
import { areaHa, centroidOf, fitZoom, lonLatFromWorldPx, worldPx, type LonLat, type XY } from "@/geo/geo";
import { DEFAULT_CENTER, DEFAULT_OUTLINE } from "@/data/fields";
import { colors, fonts } from "@/theme";
import { MapCanvas, projector, type Viewport } from "./map-canvas";
import { MapButton } from "./map-controls";
import type { MapView } from "./map-frame";
import { DashedLine, Fill, Line } from "./shapes";

/** Finger radius around a corner that grabs it (44 px target). */
const HIT_CORNER = 22;
/** Radius around a "+" midpoint handle. */
const HIT_MID = 22;
/** Movement (px) below which a press counts as a tap. */
const TAP = 7;
const MIN_Z = 4;
const MAX_Z = 18;
/** Edges shorter than this get no "+" handle (it would sit on top of the corners). */
const MID_MIN_LEN = 60;

type Drag =
  | { kind: "corner"; index: number; start: XY; page: XY; moved: boolean }
  | { kind: "pan"; start: XY; page: XY; world: XY; zoom: number; moved: boolean };

/** Mutable gesture state shared by the responder callbacks (survives re-renders). */
class Gesture {
  private d: Drag | null = null;
  private wheelAt = 0;
  private wheelAcc = 0;
  get() {
    return this.d;
  }
  set(d: Drag | null) {
    this.d = d;
  }
  markMoved() {
    if (this.d) this.d.moved = true;
  }
  /** Adds wheel delta; returns +1 / -1 when it is time for one zoom step, else 0. */
  wheel(delta: number): number {
    this.wheelAcc += delta;
    const now = Date.now();
    if (Math.abs(this.wheelAcc) < 40 || now - this.wheelAt < 220) return 0;
    const dir = this.wheelAcc < 0 ? 1 : -1;
    this.wheelAcc = 0;
    this.wheelAt = now;
    return dir;
  }
}

/** Hectares for labels: two decimals for small fields, one for big ones. */
export function fmtHa(ha: number): string {
  return `${ha.toFixed(ha >= 10 ? 1 : 2)} ha`;
}

const page = (e: GestureResponderEvent): XY => ({ x: e.nativeEvent.pageX, y: e.nativeEvent.pageY });

const nearest = (q: XY, list: (XY | null)[], radius: number) => {
  let best = -1;
  let bd = radius;
  list.forEach((p, i) => {
    if (!p) return;
    const d = Math.hypot(p.x - q.x, p.y - q.y);
    if (d < bd) {
      bd = d;
      best = i;
    }
  });
  return best;
};

/**
 * Satellite map for drawing a field: tap to add numbered corners, tap corner 1 to close the shape, drag a corner to
 * move it, tap "+" on an edge to insert one, tap a corner to select (and remove) it. Drag empty map to pan; zoom with
 * the buttons or the mouse wheel (inline, ctrl/cmd + wheel, so the page still scrolls). The camera lives in the parent so
 * it survives moving between the inline map and the full-screen one.
 */
export function DrawMap({
  points,
  onChange,
  closed = false,
  onClosedChange,
  width,
  height,
  expanded = false,
  view,
  onViewChange,
}: {
  points: LonLat[];
  onChange: (p: LonLat[]) => void;
  /** The farmer tapped corner 1 again: the outline is finished (taps on the map no longer add corners). */
  closed?: boolean;
  onClosedChange?: (closed: boolean) => void;
  /** Size to draw, from MapFrame's MapSize. */
  width: number;
  height: number;
  /** Full-screen mode: the wheel always zooms and the map takes every touch gesture. */
  expanded?: boolean;
  view: MapView | null;
  onViewChange: (v: MapView | null) => void;
}) {
  const setView = onViewChange;
  const [wheelTip, setWheelTip] = useState(false);
  const tipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [g0] = useState(() => new Gesture());
  const box = useRef<View>(null);

  const n = points.length;
  const isClosed = closed && n >= 3;
  const sel = selected != null && selected < n ? selected : null;
  const active = dragging != null && dragging < n ? dragging : sel;

  const center = view?.center ?? DEFAULT_CENTER;
  const zoom = view?.zoom ?? fitZoom(DEFAULT_OUTLINE, width, height, 0.6, 17);
  const vp: Viewport = { width, height, center, zoom };
  const { project, unproject } = projector(vp);
  const px = points.map(project);

  // "+" handles at the middle of each edge (the closing edge too, once there is a shape).
  const mids: (XY | null)[] =
    n >= 3
      ? px.map((p, i) => {
          const q = px[(i + 1) % n];
          return Math.hypot(q.x - p.x, q.y - p.y) >= MID_MIN_LEN ? { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 } : null;
        })
      : [];

  const setClosed = (c: boolean) => onClosedChange?.(c);

  const zoomTo = (z: number, around?: XY) => {
    const nz = Math.max(MIN_Z, Math.min(MAX_Z, z));
    if (nz === zoom) return;
    const q = around ?? { x: width / 2, y: height / 2 };
    // Keep the spot under `q` in place.
    const ll = unproject(q);
    const p = worldPx(ll, nz);
    setView({ center: lonLatFromWorldPx({ x: p.x - (q.x - width / 2), y: p.y - (q.y - height / 2) }, nz), zoom: nz });
  };

  const recenter = () => {
    if (n === 0) setView(null);
    else if (n === 1) setView({ center: points[0], zoom });
    else setView({ center: centroidOf(points), zoom: fitZoom(points, width, height, 0.6, MAX_Z) });
  };

  const locate = () => {
    const geo = typeof navigator !== "undefined" ? navigator.geolocation : undefined;
    if (!geo) {
      setMsg("Location is not available on this device");
      return;
    }
    setMsg("Finding your location…");
    geo.getCurrentPosition(
      (pos) => {
        setView({ center: [pos.coords.longitude, pos.coords.latitude], zoom: 17 });
        setMsg(null);
      },
      (err) => setMsg(err.code === 1 ? "Location permission was denied" : "Could not find your location"),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  };

  // Messages from "my location" fade after a few seconds.
  useEffect(() => {
    if (!msg || msg.endsWith("…")) return;
    const t = setTimeout(() => setMsg(null), 4000);
    return () => clearTimeout(t);
  }, [msg]);

  // Clear the wheel tip timer on unmount.
  useEffect(
    () => () => {
      if (tipTimer.current) clearTimeout(tipTimer.current);
    },
    [],
  );

  // Mouse wheel / trackpad zoom on the web, one step at a time. Inline, a plain wheel scrolls the page (with a hint);
  // ctrl/cmd + wheel (and a trackpad pinch, which sets ctrlKey) zooms. Full screen, the wheel always zooms.
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const el = box.current as unknown as HTMLElement | null;
    if (!el || typeof el.addEventListener !== "function") return;
    const onWheel = (ev: WheelEvent) => {
      if (!expanded && !ev.ctrlKey && !ev.metaKey) {
        if (!wheelTip) setWheelTip(true);
        if (tipTimer.current) clearTimeout(tipTimer.current);
        tipTimer.current = setTimeout(() => {
          tipTimer.current = null;
          setWheelTip(false);
        }, 1500);
        return;
      }
      ev.preventDefault();
      const dir = g0.wheel(ev.deltaY);
      if (!dir) return;
      const r = el.getBoundingClientRect();
      zoomTo(zoom + dir, { x: ev.clientX - r.left, y: ev.clientY - r.top });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  });

  const pan = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (e) => {
      const q = { x: e.nativeEvent.locationX, y: e.nativeEvent.locationY };
      const h = nearest(q, px, HIT_CORNER);
      if (h >= 0) {
        g0.set({ kind: "corner", index: h, start: px[h], page: page(e), moved: false });
        setDragging(h);
        return;
      }
      const m = nearest(q, mids, HIT_MID);
      if (m >= 0 && mids[m]) {
        const next = points.slice();
        next.splice(m + 1, 0, unproject(mids[m]));
        onChange(next);
        g0.set({ kind: "corner", index: m + 1, start: mids[m], page: page(e), moved: true });
        setSelected(null);
        setDragging(m + 1);
        return;
      }
      g0.set({ kind: "pan", start: q, page: page(e), world: worldPx(center, zoom), zoom, moved: false });
    },
    onPanResponderMove: (e) => {
      const d = g0.get();
      if (!d) return;
      const p = page(e);
      const dx = p.x - d.page.x;
      const dy = p.y - d.page.y;
      if (!d.moved && Math.hypot(dx, dy) < TAP) return;
      g0.markMoved();
      if (d.kind === "corner") {
        if (d.index >= points.length) return;
        const next = points.slice();
        next[d.index] = unproject({ x: d.start.x + dx, y: d.start.y + dy });
        onChange(next);
      } else {
        const size = 256 * 2 ** d.zoom;
        const y = Math.max(0, Math.min(size, d.world.y - dy));
        setView({ center: lonLatFromWorldPx({ x: d.world.x - dx, y }, d.zoom), zoom: d.zoom });
      }
    },
    onPanResponderRelease: () => {
      const d = g0.get();
      g0.set(null);
      setDragging(null);
      if (!d || d.moved) return;
      if (d.kind === "corner") {
        if (d.index === 0 && n >= 3 && !isClosed) {
          setClosed(true);
          setSelected(null);
        } else {
          setSelected(sel === d.index ? null : d.index);
        }
        return;
      }
      // A tap on empty map.
      if (sel != null) setSelected(null);
      else if (!isClosed) onChange([...points, unproject(d.start)]);
    },
    onPanResponderTerminate: () => {
      g0.set(null);
      setDragging(null);
    },
  });

  const removeSelected = () => {
    if (sel == null) return;
    const next = points.filter((_, i) => i !== sel);
    if (next.length < 3) setClosed(false);
    onChange(next);
    setSelected(null);
  };

  const ha = areaHa(points);
  const mid = n >= 3 ? { x: px.reduce((s, p) => s + p.x, 0) / n, y: px.reduce((s, p) => s + p.y, 0) / n } : null;

  let hint: string;
  if (msg) hint = msg;
  else if (dragging != null) hint = `Moving corner ${dragging + 1}`;
  else if (wheelTip) hint = "Ctrl + scroll to zoom, or tap Expand";
  else if (sel != null) hint = `Corner ${sel + 1} selected`;
  else if (n === 0) hint = "Tap the first corner of your field";
  else if (n === 1) hint = "Tap the next corner";
  else if (n === 2) hint = "Tap a third corner";
  else if (!isClosed) hint = "Tap corner 1 to close the field";
  else hint = "Done · drag corners to adjust, + adds one";

  const edges = [];
  for (let i = 0; i < (n >= 3 ? n : n - 1); i++) {
    const a = px[i];
    const b = px[(i + 1) % n];
    const closing = i === n - 1;
    edges.push(<Line key={`u${i}`} a={a} b={b} color="rgba(22,36,28,0.6)" width={6.5} />);
    edges.push(
      closing && !isClosed ? (
        <DashedLine key={`e${i}`} a={a} b={b} color={colors.card} width={3} />
      ) : (
        <Line key={`e${i}`} a={a} b={b} color={colors.card} width={3} />
      ),
    );
  }

  return (
    <View ref={box} style={[styles.wrap, { width, height }]}>
      <MapCanvas vp={vp}>
        <Fill pts={px} color={isClosed ? "rgba(251,250,245,0.3)" : "rgba(251,250,245,0.2)"} width={width} height={height} />
        {edges}
        {mids.map((m, i) =>
          m ? (
            <View key={`m${i}`} pointerEvents="none" style={[styles.mid, { left: m.x - 11, top: m.y - 11 }]}>
              <Text style={styles.midText}>+</Text>
            </View>
          ) : null,
        )}
        {mid ? (
          <View pointerEvents="none" style={[styles.area, { left: mid.x - 60, top: mid.y - 15 }]}>
            <View style={styles.areaPill}>
              <Text style={styles.areaText}>{fmtHa(ha)}</Text>
            </View>
          </View>
        ) : null}
        {px.map((p, i) => {
          const first = i === 0;
          const hot = active === i;
          const closable = first && n >= 3 && !isClosed && !hot;
          const size = hot ? 34 : 28;
          return (
            <View key={i} pointerEvents="none" style={[styles.pinBox, { left: p.x - 22, top: p.y - 22 }]}>
              {closable ? <View style={styles.halo} /> : null}
              <View
                style={[
                  styles.pin,
                  { width: size, height: size, borderRadius: size / 2 },
                  first && styles.pinFirst,
                  hot && styles.pinHot,
                ]}
              >
                <Text style={[styles.pinText, (first || hot) && { color: colors.card }]}>{i + 1}</Text>
              </View>
            </View>
          );
        })}
        <View
          style={styles.layer}
          {...pan.panHandlers}
          accessibilityLabel="Satellite map. Tap to add a corner of your field, drag a corner to move it, drag the map to move around."
        />
      </MapCanvas>

      <View pointerEvents="none" style={styles.hint}>
        <Text style={styles.hintText} numberOfLines={2} accessibilityLiveRegion="polite">
          {hint}
        </Text>
      </View>

      <View style={styles.controls}>
        <MapButton icon="plus" label="Zoom in" onPress={() => zoomTo(zoom + 1)} disabled={zoom >= MAX_Z} />
        <MapButton icon="minus" label="Zoom out" onPress={() => zoomTo(zoom - 1)} disabled={zoom <= MIN_Z} />
        <MapButton icon="fit" label={n >= 2 ? "Recenter on my field" : "Recenter map"} onPress={recenter} />
        <MapButton icon="locate" label="Use my location" onPress={locate} />
      </View>

      {sel != null ? (
        <View style={styles.removeRow} pointerEvents="box-none">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Remove corner ${sel + 1}`}
            onPress={removeSelected}
            style={({ pressed }) => [styles.remove, pressed && { opacity: 0.8 }]}
          >
            <Text style={styles.removeText}>Remove corner {sel + 1}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Done, keep this corner"
            onPress={() => setSelected(null)}
            style={({ pressed }) => [styles.keep, pressed && { opacity: 0.8 }]}
          >
            <Text style={styles.keepText}>Keep</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const shadow = { boxShadow: "0 1px 4px rgba(0,0,0,0.4)" };

const styles = StyleSheet.create({
  wrap: { overflow: "hidden", backgroundColor: "#33402C" },
  // touchAction 'none' even inline: with 'pan-y' a vertical corner drag would also scroll the page (pointercancel ends the drag).
  layer: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, cursor: "crosshair", touchAction: "none" } as never,
  pinBox: { position: "absolute", width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  halo: { position: "absolute", width: 44, height: 44, borderRadius: 22, borderWidth: 3, borderColor: colors.card, backgroundColor: "rgba(47,93,62,0.35)" },
  pin: { alignItems: "center", justifyContent: "center", backgroundColor: colors.card, borderWidth: 2.5, borderColor: colors.ink, ...shadow },
  pinFirst: { backgroundColor: colors.green, borderColor: colors.card },
  pinHot: { backgroundColor: colors.accent, borderColor: colors.card, borderWidth: 3 },
  pinText: { fontFamily: fonts.sans, fontSize: 14, lineHeight: 16, fontWeight: "700", color: colors.ink },
  mid: {
    position: "absolute",
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(251,250,245,0.92)",
    borderWidth: 1.5,
    borderColor: colors.green,
    alignItems: "center",
    justifyContent: "center",
  },
  midText: { fontFamily: fonts.sans, fontSize: 17, lineHeight: 18, fontWeight: "700", color: colors.green },
  area: { position: "absolute", width: 120, height: 30, alignItems: "center", justifyContent: "center" },
  areaPill: { backgroundColor: colors.ink, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, ...shadow },
  areaText: { fontFamily: fonts.display, fontSize: 15, fontWeight: "700", color: colors.card },
  hint: { position: "absolute", left: 10, top: 10, right: 64, alignItems: "flex-start" },
  hintText: {
    fontFamily: fonts.sans,
    fontSize: 15,
    fontWeight: "600",
    color: colors.ink,
    backgroundColor: colors.card,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    overflow: "hidden",
    ...shadow,
  },
  controls: { position: "absolute", right: 10, bottom: 26, gap: 8 },
  removeRow: { position: "absolute", left: 10, right: 64, bottom: 26, flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-start", gap: 8 },
  remove: { minHeight: 44, paddingHorizontal: 16, borderRadius: 999, backgroundColor: colors.card, borderWidth: 2, borderColor: colors.error, alignItems: "center", justifyContent: "center", ...shadow },
  removeText: { fontFamily: fonts.sans, fontSize: 15, fontWeight: "700", color: colors.error },
  keep: { minHeight: 44, paddingHorizontal: 16, borderRadius: 999, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", ...shadow },
  keepText: { fontFamily: fonts.sans, fontSize: 15, fontWeight: "600", color: colors.ink },
});
