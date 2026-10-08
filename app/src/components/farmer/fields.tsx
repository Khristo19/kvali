import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { isoShort } from "@/components/money";
import { FieldThumb } from "@/components/map/field-thumb";
import { Button, Card, CardTitle, Icon } from "@/components/ui";
import { OSM_ATTRIBUTION, fieldHa, type Field, type FieldSource } from "@/data/fields";
import { selectField, useFields } from "@/data/fields-store";
import { SATELLITE_ATTRIBUTION, bandOf, getFieldHealth, type HealthBand } from "@/data/field-health";
import { colors, fonts, type } from "@/theme";

export const BAND_COLOR: Record<HealthBand, string> = { Poor: colors.accent, Medium: "#C9A227", Good: colors.green };

/** "Verified boundary" (land registry), "From OpenStreetMap" (demo outlines) or "Drawn by you". */
export function BoundaryBadge({ source, origin }: { source: FieldSource; origin?: string }) {
  const verified = source === "registry";
  const label = verified ? "Verified boundary" : origin?.startsWith("OpenStreetMap") ? "From OpenStreetMap" : "Drawn by you";
  return (
    <View style={[styles.badge, !verified && styles.badgeDrawn]}>
      {verified ? <Icon name="check" color={colors.green} size={14} /> : null}
      <Text style={[styles.badgeText, !verified && { color: colors.body }]}>{label}</Text>
    </View>
  );
}

export function haText(ha: number): string {
  return `${ha.toFixed(1)} ha`;
}

export function FieldRow({ field, selected, many }: { field: Field; selected: boolean; many: boolean }) {
  return (
    <Card>
      <View style={styles.row}>
        <FieldThumb outline={field.outline} />
        <View style={styles.info}>
          <Text style={styles.name}>{field.name}</Text>
          <Text style={type.body}>
            {haText(fieldHa(field))} · {field.crop}
          </Text>
          <BoundaryBadge source={field.source} origin={field.origin} />
        </View>
      </View>
      {field.origin ? <Text style={type.small}>Outline: OpenStreetMap ({OSM_ATTRIBUTION}). Demo field.</Text> : null}
      {many ? (
        selected ? (
          <Text style={[type.body, { color: colors.green, fontWeight: "600" }]}>Used for the next job</Text>
        ) : (
          <Button small kind="secondary" label="Use for the next job" onPress={() => selectField(field.id)} />
        )
      ) : null}
    </Card>
  );
}

/** "My fields": one card per field plus "Add another field". */
export function MyFields() {
  const { fields, selectedId } = useFields();
  return (
    <>
      {fields.map((f) => (
        <FieldRow key={f.id} field={f} selected={f.id === selectedId} many={fields.length > 1} />
      ))}
      <Button kind="secondary" label="Mark or add a field" onPress={() => router.push("/mark-field" as never)} />
    </>
  );
}

const shortDate = isoShort;

function markerPos(index: number): number {
  if (index < 0.35) return Math.max(0, index / 0.35) / 3;
  if (index < 0.55) return 1 / 3 + (index - 0.35) / 0.2 / 3;
  return 2 / 3 + Math.min(1, (index - 0.55) / 0.35) / 3;
}

export function CropHealthCard({ fieldId }: { fieldId: string }) {
  const h = getFieldHealth(fieldId);
  if (!h) {
    return (
      <Card>
        <CardTitle>Crop health</CardTitle>
        <Text style={type.body}>No satellite readings for this field yet.</Text>
      </Card>
    );
  }
  const last = h.latest;
  const band = bandOf(last.index);
  const change = h.series[h.series.length - 1].index - h.series[0].index;
  const trend = change > 0.03 ? "rising" : change < -0.03 ? "falling" : "steady";
  return (
    <Card>
      <View style={styles.head}>
        <CardTitle>Crop health</CardTitle>
        <Text style={[type.small, { flexShrink: 1, textAlign: "right" }]}>from satellite</Text>
      </View>
      <Text style={[styles.band, { color: BAND_COLOR[band] }]}>{band}</Text>
      <View style={{ gap: 6 }}>
        <View style={styles.bar}>
          <View style={[styles.seg, { backgroundColor: BAND_COLOR.Poor, borderTopLeftRadius: 8, borderBottomLeftRadius: 8 }]} />
          <View style={[styles.seg, { backgroundColor: BAND_COLOR.Medium }]} />
          <View style={[styles.seg, { backgroundColor: BAND_COLOR.Good, borderTopRightRadius: 8, borderBottomRightRadius: 8 }]} />
          <View accessibilityLabel={`Marker at ${band}`} style={[styles.marker, { left: `${markerPos(last.index) * 100}%` }]} />
        </View>
        <View style={styles.labels}>
          <Text style={styles.lab}>Poor</Text>
          <Text style={[styles.lab, { textAlign: "center" }]}>Medium</Text>
          <Text style={[styles.lab, { textAlign: "right" }]}>Good</Text>
        </View>
      </View>
      <View style={styles.trend}>
        <Text style={styles.trendTitle}>Last {h.series.length} images</Text>
        <View accessibilityRole="image" accessibilityLabel={`Crop health trend, ${trend}`} style={styles.bars}>
          {h.series.map((p, i) => (
            <View
              key={p.date}
              style={{
                flex: 1,
                height: `${Math.round(Math.min(1, Math.max(0.08, (p.index - 0.3) / 0.5)) * 100)}%`,
                backgroundColor: BAND_COLOR[bandOf(p.index)],
                borderRadius: 4,
                ...(i === h.series.length - 1 ? { borderWidth: 2, borderColor: colors.ink } : null),
              }}
            />
          ))}
        </View>
        <View style={styles.dates}>
          {h.series.map((p, i) => (
            <Text key={p.date} style={[styles.date, i === h.series.length - 1 && { fontWeight: "700", color: colors.ink }]}>
              {shortDate(p.date)}
            </Text>
          ))}
        </View>
      </View>
      <Text style={type.small}>
        Satellite image {shortDate(last.date)} · {Math.round(last.cloudPct)}% cloud · greenness index {last.index.toFixed(2)}. Shows how green and strong the
        plants are, not whether they were sprayed. After spraying, the same images help confirm the job.
      </Text>
      <Text style={[type.small, { fontSize: 13 }]}>{SATELLITE_ATTRIBUTION}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 14, alignItems: "center" },
  info: { flex: 1, flexShrink: 1, minWidth: 0, gap: 4 },
  name: { fontFamily: fonts.display, fontSize: 20, lineHeight: 24, fontWeight: "700", color: colors.ink, flexShrink: 1 },
  badge: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 3, paddingHorizontal: 10, borderRadius: 999, backgroundColor: colors.softGreen },
  badgeDrawn: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  badgeText: { fontFamily: fonts.sans, fontSize: 14, fontWeight: "700", color: colors.green },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: 12 },
  band: { fontFamily: fonts.display, fontSize: 36, lineHeight: 38, fontWeight: "700" },
  bar: { flexDirection: "row", gap: 4, height: 16, position: "relative" },
  seg: { flex: 1 },
  marker: { position: "absolute", top: -6, width: 6, height: 28, marginLeft: -3, borderRadius: 3, backgroundColor: colors.ink, borderWidth: 2, borderColor: colors.card },
  labels: { flexDirection: "row" },
  lab: { flex: 1, fontFamily: fonts.sans, fontSize: 15, fontWeight: "600", color: colors.muted },
  trend: { gap: 6, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border },
  trendTitle: { fontFamily: fonts.sans, fontSize: 15, fontWeight: "600", color: colors.ink },
  bars: { flexDirection: "row", gap: 8, alignItems: "flex-end", height: 64 },
  dates: { flexDirection: "row", gap: 8 },
  date: { flex: 1, textAlign: "center", fontFamily: fonts.sans, fontSize: 13, color: colors.muted },
});
