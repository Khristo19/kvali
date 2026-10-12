import type { ReactNode } from "react";
import { StyleSheet, Text, View, type ViewStyle } from "react-native";

import { fromLocalMeters, fitZoom, type LonLat } from "@/geo/geo";
import type { SimTrack } from "@/geo/track";
import { colors, fonts } from "@/theme";
import { MapCanvas, projector, type Viewport } from "./map-canvas";
import { DashedLine, Fill, Line, Outline } from "./shapes";

export const INSIDE_COLOR = "#8FD19E";
export const OUTSIDE_COLOR = "#F2A05A";
export const OUTLINE_COLOR = "#F4F1E8";
const MAP_BG = "#33402C";

/** Start of the track: a filled cream dot with a dark ring. */
export const START_STYLE = {
  width: 14,
  height: 14,
  borderRadius: 7,
  backgroundColor: "#FBFAF5",
  borderWidth: 2,
  borderColor: "#16241C",
} satisfies ViewStyle;

/** End of the track: a dark square with a cream ring. */
export const END_STYLE = {
  width: 12,
  height: 12,
  backgroundColor: "#16241C",
  borderWidth: 2,
  borderColor: "#FBFAF5",
} satisfies ViewStyle;

/**
 * Field outline with the drone track: inside = solid green, outside = dashed orange.
 * Read-only; draws exactly width x height and fits the field + track to that size.
 */
export function FlightMap({
  outline,
  track,
  osm,
  width,
  height,
  expanded = false,
}: {
  outline: LonLat[];
  track: SimTrack;
  osm?: boolean;
  width: number;
  height: number;
  expanded?: boolean;
}) {
  const trackLL = fromLocalMeters(track.points, track.origin);
  const all = [...outline, ...trackLL];
  const lons = all.map((p) => p[0]);
  const lats = all.map((p) => p[1]);
  const center: LonLat = [(Math.min(...lons) + Math.max(...lons)) / 2, (Math.min(...lats) + Math.max(...lats)) / 2];
  const vp: Viewport = { width, height, center, zoom: fitZoom(all, width, height, 0.8) };
  const { project } = projector(vp);
  const px = outline.map(project);
  const seg = (p: { x: number; y: number }) => project(fromLocalMeters([p], track.origin)[0]);
  const start = trackLL.length ? project(trackLL[0]) : null;
  const end = trackLL.length ? project(trackLL[trackLL.length - 1]) : null;
  const sh = START_STYLE.width / 2;
  const eh = END_STYLE.width / 2;
  return (
    <View style={{ width, height, overflow: "hidden", backgroundColor: MAP_BG }}>
      <MapCanvas vp={vp} osm={osm}>
        <Fill pts={px} color="rgba(244,241,232,0.10)" width={width} height={height} />
        <Outline pts={px} color={OUTLINE_COLOR} />
        {track.segs.map((s, i) =>
          s.inside ? (
            <Line key={i} a={seg(s.a)} b={seg(s.b)} color={INSIDE_COLOR} width={3} />
          ) : (
            <DashedLine key={i} a={seg(s.a)} b={seg(s.b)} color={OUTSIDE_COLOR} width={3.5} dash={7} gap={5} />
          ),
        )}
        {start ? <View pointerEvents="none" style={[START_STYLE, styles.abs, { left: start.x - sh, top: start.y - sh }]} /> : null}
        {end ? <View pointerEvents="none" style={[END_STYLE, styles.abs, { left: end.x - eh, top: end.y - eh }]} /> : null}
        {expanded ? <FlightLegend chip /> : null}
      </MapCanvas>
    </View>
  );
}

/** Legend for FlightMap. Swatches are built from the same constants the map uses. `chip` = overlay on the map. */
export function FlightLegend({ chip = false }: { chip?: boolean }) {
  const tile = (swatch: ReactNode) => (chip ? swatch : <View style={styles.tile}>{swatch}</View>);
  const text = [styles.text, chip && styles.chipText];
  const items: { label: string; swatch: ReactNode }[] = [
    { label: "Sprayed inside", swatch: <View style={[styles.bar, { backgroundColor: INSIDE_COLOR }]} /> },
    {
      label: "Outside the field",
      swatch: (
        <View style={styles.dashes}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={[styles.dash, { backgroundColor: OUTSIDE_COLOR }]} />
          ))}
        </View>
      ),
    },
    { label: "Field outline", swatch: <View style={[styles.box, { borderColor: OUTLINE_COLOR }]} /> },
    { label: "Start", swatch: <View style={[START_STYLE, { width: 12, height: 12, borderRadius: 6 }]} /> },
    { label: "End", swatch: <View style={[END_STYLE, { width: 10, height: 10 }]} /> },
  ];
  const list = items.map(({ label, swatch }) => (
    <View key={label} style={styles.item}>
      {tile(swatch)}
      <Text style={text}>{label}</Text>
    </View>
  ));
  if (!chip) return <View style={styles.row}>{list}</View>;
  // The outer layer spans left:10..right:10 so the pill wraps instead of running off a narrow map.
  return (
    <View pointerEvents="none" style={styles.chipLayer}>
      <View accessibilityLabel="Map legend" style={styles.chip}>
        {list}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  abs: { position: "absolute" },
  row: { flexDirection: "row", flexWrap: "wrap", columnGap: 16, rowGap: 8 },
  chipLayer: { position: "absolute", left: 10, top: 10, right: 10, alignItems: "flex-start" },
  chip: {
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: 12,
    rowGap: 6,
    padding: 8,
    borderRadius: 10,
    backgroundColor: "rgba(22,36,28,0.78)",
  },
  item: { flexDirection: "row", alignItems: "center", gap: 8 },
  tile: { width: 28, height: 18, borderRadius: 5, backgroundColor: MAP_BG, alignItems: "center", justifyContent: "center" },
  text: { fontFamily: fonts.sans, fontSize: 15, color: colors.ink },
  chipText: { fontSize: 13, color: "#FFFFFF" },
  bar: { width: 22, height: 4, borderRadius: 2 },
  dashes: { width: 22, flexDirection: "row", justifyContent: "space-between" },
  dash: { width: 5, height: 4 },
  box: { width: 18, height: 12, borderWidth: 2.5, borderRadius: 2 },
});
