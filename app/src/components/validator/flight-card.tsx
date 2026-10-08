import { useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";

import { FlightMap } from "@/components/map/flight-map";
import { onWidth } from "@/components/map/map-canvas";
import { Outline } from "@/components/map/shapes";
import { isoShort } from "@/components/money";
import { Card, CardTitle } from "@/components/ui";
import { SATELLITE_ATTRIBUTION, getFieldHealth } from "@/data/field-health";
import type { Field } from "@/data/fields";
import { OSM_ATTRIBUTION } from "@/data/fields";
import { fieldByHash } from "@/data/fields-store";
import { recordFor } from "@/engine/scenario";
import { simulateTrack, trackKindFor } from "@/geo/track";
import type { Job } from "@/engine/types";
import { colors, fonts, type } from "@/theme";
import type { SampleKey } from "./proof-card";

const LIMIT_PCT = 105; // same rule as the program (MAX_AREA_OVERSHOOT_PCT)

/** "Flight vs field": the (simulated) GPS track over the field outline. */
export function FlightCard({ job, sampleKey }: { job: Job; sampleKey: SampleKey }) {
  const field = fieldByHash(job.fieldHash);
  const r = recordFor(sampleKey, job.areaCha);
  if (!field) {
    return (
      <Card>
        <CardTitle>Flight vs field</CardTitle>
        <Text style={type.body}>This job has no field outline, so there is no map to show.</Text>
      </Card>
    );
  }
  const track = simulateTrack(field.outline, trackKindFor(r.sample));
  const pct = Math.round((r.areaCoveredCha / job.areaCha) * 100);
  const over = pct > LIMIT_PCT;
  const inside = Math.round(track.insidePct);
  const out = Math.round(track.maxOutM);
  const note =
    track.leftRuns === 0
      ? "All passes stayed inside the field."
      : track.leftRuns === 1
        ? `One turn left the field on the ${track.outSide} edge (about ${out} m). Normal for a turn — your call.`
        : `${track.leftRuns} passes left the field, up to about ${out} m outside (${track.outSide} side). Check this before you sign.`;
  return (
    <Card style={{ padding: 0, overflow: "hidden", gap: 0 }}>
      <View style={styles.head}>
        <CardTitle>Flight vs field</CardTitle>
        <View style={styles.sim}>
          <Text style={styles.simText}>Simulated track</Text>
        </View>
      </View>
      <FlightMap outline={field.outline} track={track} osm={!!field.origin} />
      <View style={styles.legend}>
        <View style={styles.leg}>
          <View style={[styles.solid, { backgroundColor: "#2F5D3E" }]} />
          <Text style={styles.legText}>Sprayed inside</Text>
        </View>
        <View style={styles.leg}>
          <View style={styles.dashBox}>
            {[0, 1, 2].map((i) => (
              <View key={i} style={styles.dash} />
            ))}
          </View>
          <Text style={styles.legText}>Outside the field</Text>
        </View>
        <View style={styles.leg}>
          <View style={styles.outline} />
          <Text style={styles.legText}>Field outline</Text>
        </View>
        <View style={styles.leg}>
          <View style={styles.startDot} />
          <Text style={styles.legText}>Start</Text>
          <View style={styles.endSq} />
          <Text style={styles.legText}>End</Text>
        </View>
      </View>
      <View style={styles.stats}>
        <View style={styles.line}>
          <Text style={[type.body, { flexShrink: 1 }]}>% of spray inside the field</Text>
          <Text style={[styles.big, { color: inside >= 90 ? colors.green : colors.accent }]}>{inside}%</Text>
        </View>
        <View style={styles.line}>
          <Text style={[type.body, { flexShrink: 1 }]}>Area sprayed</Text>
          <Text style={styles.val}>
            {(r.areaCoveredCha / 100).toFixed(2)} of {(job.areaCha / 100).toFixed(2)} ha · {pct}%
          </Text>
        </View>
        <View style={styles.line}>
          <Text style={[type.body, { flexShrink: 1 }]}>Limit</Text>
          <Text style={[styles.val, over && { color: colors.error }]}>
            {LIMIT_PCT}%{over ? " — over the limit" : ""}
          </Text>
        </View>
        <View style={[styles.note, track.leftRuns === 0 && { backgroundColor: colors.softGreen }]}>
          <Text style={[type.small, { color: colors.ink, flexShrink: 1 }]}>{note}</Text>
        </View>
        <Text style={type.small}>
          The demo records have no GPS, so this track is generated from the outline. Imagery © Esri{field.origin ? `, outline ${OSM_ATTRIBUTION}` : ""}.
        </Text>
        <SatellitePair field={field} />
      </View>
    </Card>
  );
}

/** Real Sentinel-2 true-colour pictures of the field (earlier and latest) with the outline on top. */
function SatellitePair({ field }: { field: Field }) {
  const [w, setW] = useState(300);
  const h = getFieldHealth(field.id);
  if (!h || h.pictures.length < 2) return null;
  const [west, south, east, north] = h.bbox;
  const pw = Math.max(80, Math.floor((w - 10) / 2));
  const ph = Math.round((pw * h.size[1]) / h.size[0]);
  const outline = field.outline.map((p) => ({ x: ((p[0] - west) / (east - west)) * pw, y: ((north - p[1]) / (north - south)) * ph }));
  const panels = [
    { label: "Earlier", pic: h.pictures[h.pictures.length - 1] },
    { label: "Latest", pic: h.pictures[0] },
  ];
  return (
    <View style={styles.sat} onLayout={onWidth(setW)}>
      <Text style={type.subheading}>Satellite, earlier and latest</Text>
      <View style={styles.pair}>
        {panels.map(({ label, pic }) => (
          <View key={label} style={{ flex: 1, gap: 6 }}>
            <View accessibilityRole="image" accessibilityLabel={`${label} satellite picture, ${isoShort(pic.date)}`} style={{ width: pw, height: ph, overflow: "hidden", borderRadius: 8, backgroundColor: "#33402C" }}>
              <Image source={pic.source} resizeMode="stretch" style={{ width: pw, height: ph, imageRendering: "pixelated", filter: "brightness(1.8)" } as never} />
              <Outline pts={outline} color="#F4F1E8" width={1.5} />
            </View>
            <Text style={styles.legText}>
              <Text style={{ fontWeight: "700" }}>{label}</Text> · {isoShort(pic.date)} · {Math.round(pic.cloudPct)}% cloud
            </Text>
          </View>
        ))}
      </View>
      <Text style={type.small}>Real Sentinel-2 pictures, 10 m per pixel, brightened. {SATELLITE_ATTRIBUTION}.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  sat: { gap: 10, paddingTop: 6, borderTopWidth: 1, borderTopColor: colors.border },
  pair: { flexDirection: "row", gap: 10 },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, padding: 16, paddingBottom: 12, flexWrap: "wrap" },
  sim: { borderRadius: 999, borderWidth: 1.5, borderColor: colors.accent, paddingVertical: 2, paddingHorizontal: 10 },
  simText: { fontFamily: fonts.sans, fontSize: 14, fontWeight: "700", color: colors.accent },
  legend: { flexDirection: "row", flexWrap: "wrap", columnGap: 16, rowGap: 8, padding: 12, paddingHorizontal: 16, backgroundColor: colors.card },
  leg: { flexDirection: "row", alignItems: "center", gap: 8 },
  legText: { fontFamily: fonts.sans, fontSize: 15, color: colors.ink },
  solid: { width: 22, height: 4, borderRadius: 2 },
  dashBox: { width: 22, flexDirection: "row", justifyContent: "space-between" },
  dash: { width: 5, height: 4, backgroundColor: colors.accent },
  outline: { width: 18, height: 12, borderWidth: 2.5, borderColor: colors.ink, borderRadius: 2 },
  startDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: colors.ink },
  endSq: { width: 10, height: 10, backgroundColor: colors.ink, marginLeft: 6 },
  stats: { padding: 16, gap: 10 },
  line: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: 12 },
  big: { fontFamily: fonts.display, fontSize: 28, fontWeight: "700" },
  val: { fontFamily: fonts.sans, fontSize: 16, fontWeight: "600", color: colors.ink, textAlign: "right", flexShrink: 1 },
  note: { padding: 12, borderRadius: 10, backgroundColor: "#F6E9DC" },
});
