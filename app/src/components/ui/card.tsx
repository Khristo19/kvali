import type { ReactNode } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { colors, fonts, radius, space, type } from "@/theme";

export function Card({ children, style, testID }: { children: ReactNode; style?: StyleProp<ViewStyle>; testID?: string }) {
  return <View testID={testID} style={[styles.card, style]}>{children}</View>;
}

/** Card heading (Space Grotesk 18). */
export function CardTitle({ children }: { children: ReactNode }) {
  return (
    <Text style={styles.cardTitle} accessibilityRole="header">
      {children}
    </Text>
  );
}

/** Label on the left, value on the right; both wrap. `sub` is a smaller line under the value. */
export function Row({ label, value, sub, bold, testID }: { label: string; value: string; sub?: string; bold?: boolean; testID?: string }) {
  return (
    <View style={styles.row} testID={testID}>
      <Text style={[styles.rowLabel, { flex: 1, minWidth: 0 }]}>{label}</Text>
      <View style={styles.rowValueBox}>
        <Text style={[styles.rowValue, bold && styles.rowValueBold]}>{value}</Text>
        {sub ? <Text style={styles.rowSub}>{sub}</Text> : null}
      </View>
    </View>
  );
}

/** Small label above a value, for 2-column summary grids. */
export function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue}>{value}</Text>
    </View>
  );
}

/** Two-column grid of Facts. */
export function FactGrid({ children }: { children: ReactNode }) {
  return <View style={styles.grid}>{children}</View>;
}

/** Large number in Space Grotesk, optional caption above and sub line below. */
export function BigNumber({
  value,
  caption,
  sub,
  size = 36,
  color = colors.ink,
  live,
}: {
  value: string;
  caption?: string;
  sub?: string;
  size?: number;
  color?: string;
  live?: boolean;
}) {
  return (
    <View style={{ gap: 2, flexShrink: 1 }}>
      {caption ? <Text style={type.small}>{caption}</Text> : null}
      <Text
        accessibilityLiveRegion={live ? "polite" : undefined}
        style={{
          fontFamily: fonts.display,
          fontSize: size,
          lineHeight: Math.round(size * 1.1),
          fontWeight: "700",
          color,
          letterSpacing: -0.01 * size,
          fontVariant: ["tabular-nums"],
        }}
      >
        {value}
      </Text>
      {sub ? <Text style={type.small}>{sub}</Text> : null}
    </View>
  );
}

export type ChipTone = "green" | "orange" | "muted" | "red";

/** Rounded status badge. */
export function StatusChip({ label, tone = "green", testID }: { label: string; tone?: ChipTone; testID?: string }) {
  const c = tone === "orange" ? colors.accent : tone === "muted" ? colors.muted : tone === "red" ? colors.error : colors.green;
  return (
    <View testID={testID} style={[styles.chip, tone === "green" && { backgroundColor: colors.softGreen }]} accessibilityLabel={`State: ${label}`}>
      <Text style={[styles.chipText, { color: c }]}>{label}</Text>
    </View>
  );
}

export function Banner({ text, tone = "info", testID }: { text: string; tone?: "info" | "error" | "ok"; testID?: string }) {
  const c = tone === "error" ? colors.error : tone === "ok" ? colors.green : colors.body;
  return (
    <View
      testID={testID}
      accessibilityRole={tone === "error" ? "alert" : undefined}
      style={[styles.banner, tone === "info" && { backgroundColor: "#EFE8D2" }, tone === "ok" && { backgroundColor: colors.softGreen }, tone === "error" && { borderColor: colors.error, backgroundColor: colors.card }]}
    >
      <Text style={[type.body, { color: c, flexShrink: 1 }]}>{text}</Text>
    </View>
  );
}

export function ErrorText({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <Text accessibilityRole="alert" style={styles.error}>
      {message}
    </Text>
  );
}

export function Divider() {
  return <View style={styles.divider} />;
}

export const cardStyles = StyleSheet.create({});

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: radius.lg, padding: 20, gap: space.md },
  cardTitle: { fontFamily: fonts.display, fontSize: 18, fontWeight: "700", color: colors.ink },
  row: { flexDirection: "row", justifyContent: "space-between", gap: space.md, alignItems: "flex-start" },
  rowLabel: { ...type.body, color: colors.muted },
  rowValueBox: { alignItems: "flex-end", flexShrink: 0, maxWidth: "55%" },
  rowValue: { ...type.body, color: colors.ink, fontWeight: "600", textAlign: "right", flexShrink: 1 },
  rowValueBold: { fontFamily: fonts.display, fontWeight: "700", fontSize: 18 },
  rowSub: { ...type.small, textAlign: "right", flexShrink: 1 },
  fact: { minWidth: "45%", flexGrow: 1, flexBasis: "45%", flexShrink: 1 },
  factLabel: { ...type.small },
  factValue: { ...type.body, fontWeight: "600", color: colors.ink, flexShrink: 1 },
  grid: { flexDirection: "row", flexWrap: "wrap", columnGap: space.md, rowGap: 10 },
  chip: {
    alignSelf: "flex-start",
    minHeight: 32,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: "center",
    flexShrink: 0,
  },
  chipText: { fontFamily: fonts.sans, fontSize: 15, fontWeight: "600" },
  banner: { borderWidth: 1, borderColor: "transparent", borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: 14 },
  error: { fontFamily: fonts.sans, color: colors.error, fontSize: 16, lineHeight: 22, fontWeight: "600" },
  divider: { height: 1, backgroundColor: colors.border },
});
