import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { useDevnetState } from "@/devnet/mode";
import { colors, radius, type } from "@/theme";

/** Progress line while the browser's devnet wallet is being funded, then a check mark. */
export function WalletBar() {
  const s = useDevnetState();
  if (!s.walletNote) return null;
  return (
    <View style={[styles.box, s.walletOk && styles.ok]} accessibilityLiveRegion="polite">
      {s.walletOk ? null : <ActivityIndicator color={colors.accent} />}
      <Text style={[type.body, styles.text, s.walletOk && { color: colors.green }]}>{s.walletNote}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: radius.md, backgroundColor: "#EFE8D2" },
  ok: { backgroundColor: colors.softGreen },
  text: { flex: 1, flexShrink: 1, fontWeight: "600", color: colors.accent },
});
