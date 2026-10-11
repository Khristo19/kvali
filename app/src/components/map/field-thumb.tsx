import { View } from "react-native";

import { useAfterPaint } from "@/components/deferred";
import { centroidOf, fitZoom, type LonLat } from "@/geo/geo";
import { MapCanvas, projector, type Viewport } from "./map-canvas";
import { Fill, Outline } from "./shapes";

/** Small satellite thumbnail with the field outline. */
export function FieldThumb({ outline, size = 96 }: { outline: LonLat[]; size?: number }) {
  const vp: Viewport = { width: size, height: size, center: centroidOf(outline), zoom: fitZoom(outline, size, size, 0.72) };
  const { project } = projector(vp);
  const pts = outline.map(project);
  const ready = useAfterPaint(); // satellite tiles load after the page has painted
  return (
    <View accessibilityLabel="Outline of the field on a satellite picture" accessibilityRole="image" style={{ width: size, height: size, borderRadius: 10, overflow: "hidden", flexShrink: 0, backgroundColor: "#33402C" }}>
      {ready ? (
        <MapCanvas vp={vp} attribution={false}>
          <Fill pts={pts} color="rgba(251,250,245,0.22)" width={size} height={size} />
          <Outline pts={pts} color="rgba(22,36,28,0.55)" width={4.5} />
          <Outline pts={pts} color="#F4F1E8" width={2.5} />
        </MapCanvas>
      ) : null}
    </View>
  );
}
