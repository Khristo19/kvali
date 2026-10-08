import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { fromLocalMeters, fitZoom, type LonLat } from "@/geo/geo";
import type { SimTrack } from "@/geo/track";
import { MapCanvas, onWidth, projector, type Viewport } from "./map-canvas";
import { DashedLine, Fill, Line, Outline } from "./shapes";

export const INSIDE_COLOR = "#8FD19E";
export const OUTSIDE_COLOR = "#F2A05A";
const HEIGHT = 360;

/** Field outline with the drone track: inside = solid green, outside = dashed orange. */
export function FlightMap({ outline, track, osm }: { outline: LonLat[]; track: SimTrack; osm?: boolean }) {
  const [w, setW] = useState(350);
  const trackLL = fromLocalMeters(track.points, track.origin);
  const all = [...outline, ...trackLL];
  const lons = all.map((p) => p[0]);
  const lats = all.map((p) => p[1]);
  const center: LonLat = [(Math.min(...lons) + Math.max(...lons)) / 2, (Math.min(...lats) + Math.max(...lats)) / 2];
  const vp: Viewport = { width: w, height: HEIGHT, center, zoom: fitZoom(all, w, HEIGHT, 0.8) };
  const { project } = projector(vp);
  const px = outline.map(project);
  const seg = (p: { x: number; y: number }) => project(fromLocalMeters([p], track.origin)[0]);
  const start = trackLL.length ? project(trackLL[0]) : null;
  const end = trackLL.length ? project(trackLL[trackLL.length - 1]) : null;
  return (
    <View onLayout={onWidth(setW)} style={styles.wrap}>
      <MapCanvas vp={vp} osm={osm}>
        <Fill pts={px} color="rgba(244,241,232,0.10)" width={w} height={HEIGHT} />
        <Outline pts={px} color="#F4F1E8" />
        {track.segs.map((s, i) =>
          s.inside ? (
            <Line key={i} a={seg(s.a)} b={seg(s.b)} color={INSIDE_COLOR} width={3} />
          ) : (
            <DashedLine key={i} a={seg(s.a)} b={seg(s.b)} color={OUTSIDE_COLOR} width={3.5} dash={7} gap={5} />
          ),
        )}
        {start ? <View pointerEvents="none" style={[styles.start, { left: start.x - 7, top: start.y - 7 }]} /> : null}
        {end ? <View pointerEvents="none" style={[styles.end, { left: end.x - 6, top: end.y - 6 }]} /> : null}
      </MapCanvas>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { height: HEIGHT, overflow: "hidden", backgroundColor: "#33402C" },
  start: { position: "absolute", width: 14, height: 14, borderRadius: 7, backgroundColor: "#FBFAF5", borderWidth: 2, borderColor: "#16241C" },
  end: { position: "absolute", width: 12, height: 12, backgroundColor: "#16241C", borderWidth: 2, borderColor: "#FBFAF5" },
});
