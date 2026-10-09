import { router } from "expo-router";
import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Pressable } from "@/components/ui/pressable";

import { colors, fonts, radius } from "@/theme";
import { Icon } from "./icons";

/** Go back if there is history, otherwise to the home screen. */
export function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace("/");
}

/** Back button, title and subtitle (Space Grotesk 24). */
export function ScreenHeader({
  title,
  subtitle,
  onBack = goBack,
  right,
}: {
  title: string;
  subtitle?: string;
  onBack?: (() => void) | null;
  right?: ReactNode;
}) {
  return (
    <View style={styles.outer}>
    <View style={styles.row}>
      {onBack ? (
        <Pressable testID="back" accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} style={styles.back}>
          <Icon name="back" color={colors.ink} size={24} />
        </Pressable>
      ) : null}
      <View style={styles.titles}>
        <Text testID="page-title" accessibilityRole="header" numberOfLines={2} style={styles.title}>
          {title}
        </Text>
        {subtitle ? <Text testID="page-subtitle" numberOfLines={2} style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
    </View>
    {right ? <View style={styles.rightRow}>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  outer: { gap: 8 },
  rightRow: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 8, zIndex: 40 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  back: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  titles: { flex: 1, flexShrink: 1, minWidth: 0 },
  title: { fontFamily: fonts.display, fontSize: 24, lineHeight: 28, fontWeight: "700", color: colors.ink },
  subtitle: { fontFamily: fonts.sans, fontSize: 16, lineHeight: 22, color: colors.muted },
});
