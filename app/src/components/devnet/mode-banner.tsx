import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Pressable } from "@/components/ui/pressable";

import { ExtLink } from "@/components/ui/ext-link";

import { explorerAddr, explorerTx, addresses } from "@/devnet/client";
import { setPending } from "@/session/store";
import { setDevnetState, useDevnetState, type Mode } from "@/devnet/mode";
import { colors, radius, type } from "@/theme";


function Seg({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={label} onPress={onPress} style={[styles.seg, on && styles.segOn]}>
      <Text style={[styles.segText, on && styles.segTextOn]}>{label}</Text>
    </Pressable>
  );
}

/** Mode switch plus the accurate banner for the current mode. Shown on every role screen. */
export function ModeBanner() {
  const s = useDevnetState();
  const [openedAt] = useState(() => Date.now());
  const last = s.last && s.last.at >= openedAt ? s.last : null;
  const pick = (m: Mode) => {
    if (m !== s.mode) setPending(null); // a staged record belongs to one mode
    setDevnetState({ mode: m, fellBack: false });
  };

  let text: string;
  let tone: "info" | "ok" | "error" = "info";
  if (s.mode === "sim") {
    text = s.fellBack
      ? "Could not reach Solana devnet, so this is the simulation. Nothing here is on a chain and no money moves."
      : "Simulated demo: no real money and no chain. Switch to Devnet to send real test transactions.";
    if (s.fellBack) tone = "error";
  } else if (s.status === "connecting" || s.status === "idle") {
    text = s.rpcBusy ? "Solana devnet is busy — retrying…" : "Connecting to Solana devnet…";
  } else if (s.rpcBusy) {
    text = "Solana devnet is busy — retrying. Showing the last known state.";
  } else {
    text = "Devnet: real Solana transactions with test USDC. Demo keys are public.";
    tone = "ok";
  }

  return (
    <View style={[styles.box, tone === "ok" && styles.ok, tone === "error" && styles.err]} accessibilityRole={tone === "error" ? "alert" : undefined}>
      <View style={styles.segs} accessibilityRole="radiogroup">
        <Seg label="Devnet (real)" on={s.mode === "devnet"} onPress={() => pick("devnet")} />
        <Seg label="Simulated" on={s.mode === "sim"} onPress={() => pick("sim")} />
      </View>
      <Text style={[type.body, { color: tone === "error" ? colors.error : colors.body, minHeight: 46 }]}>{text}</Text>
      {s.mode === "devnet" ? (
        <Text style={[type.small, { minHeight: 44 }]}>
          {s.status === "ready" ? (
            <>
              Your wallet is a devnet burner key kept in this browser (test funds only); validators use public demo keys.{" "}
              <ExtLink url={explorerAddr(addresses.programId.toBase58())} style={styles.link}>
                Program on Explorer
              </ExtLink>
            </>
          ) : (
            " "
          )}
        </Text>
      ) : null}
      {s.mode === "devnet" ? (
        <Text style={[type.small, { minHeight: 44 }, last && !last.ok && { color: colors.error }]} selectable>
          {last ? (
            <>
          {last.ok ? "Confirmed" : "Refused"}: {last.label}
          {last.error ? ` (${last.error})` : ""}{" "}
          {last.sig ? (
            <ExtLink url={explorerTx(last.sig)} style={styles.link}>
              Open in Explorer
            </ExtLink>
          ) : null}
            </>
          ) : (
            " "
          )}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 8, borderWidth: 1, borderColor: "transparent", borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: 14, backgroundColor: "#EFE8D2" },
  ok: { backgroundColor: colors.softGreen },
  err: { borderColor: colors.error, backgroundColor: colors.card },
  segs: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  seg: { minHeight: 44, paddingHorizontal: 14, justifyContent: "center", borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.card },
  segOn: { borderColor: colors.green, backgroundColor: colors.green },
  segText: { ...type.body, fontWeight: "600", color: colors.ink },
  segTextOn: { color: colors.onAccent },
  link: { color: colors.accent, textDecorationLine: "underline", fontWeight: "600" },
});
