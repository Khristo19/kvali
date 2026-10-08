import { View } from "react-native";

import { centroidOf, fitZoom, type LonLat } from "@/geo/geo";
import { MapCanvas, projector, type Viewport } from "./map-canvas";
import { Outline } from "./shapes";

/** Small satellite thumbnail with the field outline. */
export function FieldThumb({ outline, size = 96 }: { outline: LonLat[]; size?: number }) {
  const vp: Viewport = { width: size, height: size, center: centroidOf(outline), zoom: fitZoom(outline, size, size, 0.72) };
  const { project } = projector(vp);
  return (
    <View accessibilityLabel="Outline of the field on a satellite picture" accessibilityRole="image" style={{ width: size, height: size, borderRadius: 10, overflow: "hidden", flexShrink: 0 }}>
      <MapCanvas vp={vp} attribution={false}>
        <Outline pts={outline.map(project)} color="#F4F1E8" width={2.5} />
      </MapCanvas>
    </View>
  );
}
