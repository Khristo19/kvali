import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import type { ReactNode } from "react";

import { useDevnetState } from "@/devnet/mode";
import { colors, radius, type } from "@/theme";

/** In devnet mode, show a fixed-height placeholder until the chain has been read, so no simulated balances, certificates or jobs flash on screen. */
export function ChainGate({ children }: { children: ReactNode }) {
  const s = useDevnetState();
  const ready = s.mode !== "devnet" || s.status === "ready";
  if (ready) return <>{children}</>;
  return (
    <View style={styles.box} accessibilityLiveRegion="polite">
      <ActivityIndicator color={colors.green} />
      <Text style={type.body}>Reading your wallet and job from Solana devnet…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { minHeight: 220, alignItems: "center", justifyContent: "center", gap: 12, padding: 20, borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
});
