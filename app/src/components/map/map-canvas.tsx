import type { ReactNode } from "react";
import { Image, Platform, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";

import { OSM_ATTRIBUTION } from "@/data/fields";
import { lonLatFromWorldPx, worldPx, type LonLat, type XY } from "@/geo/geo";

const TILE = 256;
const tileUrl = (z: number, x: number, y: number) =>
  `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;

export interface Viewport {
  width: number;
  height: number;
  center: LonLat;
  zoom: number;
}

/** lon/lat -> pixel inside the view. */
export function projector(vp: Viewport) {
  const c = worldPx(vp.center, vp.zoom);
  const ox = c.x - vp.width / 2;
  const oy = c.y - vp.height / 2;
  return {
    project: (p: LonLat): XY => {
      const w = worldPx(p, vp.zoom);
      return { x: w.x - ox, y: w.y - oy };
    },
    unproject: (q: XY): LonLat => lonLatFromWorldPx({ x: q.x + ox, y: q.y + oy }, vp.zoom),
  };
}

/**
 * Satellite basemap built from a grid of plain <Image> tiles (Esri World Imagery) at a fixed zoom.
 * Children are drawn on top; they get no pointer events unless they set them.
 */
export function MapCanvas({
  vp,
  children,
  attribution = true,
  osm,
}: {
  vp: Viewport;
  children?: ReactNode;
  attribution?: boolean;
  /** Outline comes from OpenStreetMap: add its credit. */
  osm?: boolean;
}) {
  const c = worldPx(vp.center, vp.zoom);
  const ox = c.x - vp.width / 2;
  const oy = c.y - vp.height / 2;
  const n = 2 ** vp.zoom;
  const tiles: ReactNode[] = [];
  for (let ty = Math.floor(oy / TILE); ty <= Math.floor((oy + vp.height) / TILE); ty++) {
    for (let tx = Math.floor(ox / TILE); tx <= Math.floor((ox + vp.width) / TILE); tx++) {
      if (ty < 0 || ty >= n) continue;
      const wx = ((tx % n) + n) % n;
      tiles.push(
        <Image
          key={`${tx}:${ty}`}
          accessibilityIgnoresInvertColors
          source={{ uri: tileUrl(vp.zoom, wx, ty) }}
          style={{ position: "absolute", left: tx * TILE - ox, top: ty * TILE - oy, width: TILE, height: TILE }}
        />,
      );
    }
  }
  return (
    <View style={[styles.box, { width: vp.width, height: vp.height }]}>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {tiles}
      </View>
      {children}
      {attribution ? (
        <View pointerEvents="none" style={styles.attr}>
          <Text style={styles.attrText}>{osm ? `Imagery © Esri · ${OSM_ATTRIBUTION}` : "Imagery © Esri"}</Text>
        </View>
      ) : null}
    </View>
  );
}

/** Measures its own width so the map can fill the card. */
export function onWidth(set: (w: number) => void) {
  return (e: LayoutChangeEvent) => set(Math.round(e.nativeEvent.layout.width));
}

export const isWeb = Platform.OS === "web";

const styles = StyleSheet.create({
  box: { overflow: "hidden", backgroundColor: "#33402C" },
  attr: { position: "absolute", left: 6, bottom: 4, backgroundColor: "rgba(0,0,0,0.45)", borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  attrText: { color: "#FFFFFF", fontSize: 11 },
});
