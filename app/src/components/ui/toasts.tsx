import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { useDevnetState } from "@/devnet/mode";
import { colors, radius, type } from "@/theme";
import { NoticeBar } from "./notice";

/**
 * Transient status (wallet setup, "Sending to devnet...", action results) floats over the page at the bottom and ignores
 * the pointer, so it never pushes a button away from under the cursor.
 */
export function Toasts() {
  const s = useDevnetState();
  return (
    <View style={styles.wrap} pointerEvents="none" accessibilityLiveRegion="polite" {...({ dataSet: { kv: "toast" } } as object)}>
      <View style={styles.col}>
        {s.walletNote ? (
          <View style={[styles.box, s.walletOk && styles.ok]}>
            {s.walletOk ? null : <ActivityIndicator color={colors.accent} />}
            <Text style={[type.body, styles.text, s.walletOk && { color: colors.green }]}>{s.walletNote}</Text>
          </View>
        ) : null}
        {s.busy ? (
          <View style={styles.box}>
            <ActivityIndicator color={colors.accent} />
            <Text style={[type.body, styles.text]}>Sending to devnet: {s.busy}… (a few seconds)</Text>
          </View>
        ) : null}
        <NoticeBar />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 16, right: 16, top: 8, alignItems: "center", zIndex: 100 },
  col: { width: "100%", maxWidth: 560, gap: 8 },
  box: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: radius.md, backgroundColor: "#EFE8D2", borderWidth: 1, borderColor: colors.border },
  ok: { backgroundColor: colors.softGreen },
  text: { flex: 1, flexShrink: 1, fontWeight: "600", color: colors.accent },
});
