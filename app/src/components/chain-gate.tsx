import { useEffect, useState, type ReactNode } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { useDevnetState } from "@/devnet/mode";
import { SAMPLE_JOB_ID } from "@/engine/scenario";
import { useEngineState } from "@/engine/useEngine";
import { useSession } from "@/session/store";
import { colors, radius, type } from "@/theme";

/**
 * In devnet mode, show a fixed-height placeholder until the chain has been read, so no simulated balances, certificates or jobs
 * flash on screen. It never blocks for long: after 8 s the page renders with whatever is known (unless a saved job is still being
 * rebuilt), and after 40 s unconditionally. Validators and signed-out visitors have no wallet to wait for.
 */
export function ChainGate({ children }: { children: ReactNode }) {
  const s = useDevnetState();
  const session = useSession();
  const hasJob = !!useEngineState().jobs[SAMPLE_JOB_ID];
  const [waited, setWaited] = useState(0);
  useEffect(() => {
    const a = setTimeout(() => setWaited(1), 8000);
    const b = setTimeout(() => setWaited(2), 40000);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, []);
  const savedJobPending = !!session && !hasJob;
  const ready = s.mode !== "devnet" || s.status === "ready" || s.cachedReady || waited === 2 || (waited === 1 && !savedJobPending);
  if (ready) return <>{children}</>;
  return (
    <View style={styles.box} accessibilityLiveRegion="polite" testID="chain-gate">
      <ActivityIndicator color={colors.green} />
      <Text style={type.body}>{s.rpcBusy ? "Solana devnet is busy — retrying…" : "Reading the latest state from Solana devnet…"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { minHeight: 220, alignItems: "center", justifyContent: "center", gap: 12, padding: 20, borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
});
