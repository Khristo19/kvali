import { useState } from "react";
import { Linking, Pressable, StyleSheet, Text } from "react-native";

import { usdc } from "@/components/money";
import { Button, Card, CardTitle, Row } from "@/components/ui";
import { explorerAddr, addresses, readSnapshot } from "@/devnet/client";
import { getDevnetState, setDevnetState, useDevnetState } from "@/devnet/mode";
import { colors, type } from "@/theme";

const open = (url: string) => void Linking.openURL(url);
const short = (a: string) => `${a.slice(0, 6)}...${a.slice(-6)}`;

function Addr({ label, addr }: { label: string; addr: string }) {
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={`${label} on Explorer`} onPress={() => open(explorerAddr(addr))}>
      <Text style={styles.link}>
        {label}: {short(addr)}
      </Text>
    </Pressable>
  );
}

/** What the chain says right now: job account, vault, and USDC balances. Devnet mode only. */
export function ChainCard() {
  const s = useDevnetState();
  const [busy, setBusy] = useState(false);
  if (s.mode !== "devnet" || s.status !== "ready" || !s.snapshot) return null;
  const snap = s.snapshot;
  const j = snap.job;
  const refresh = async () => {
    setBusy(true);
    try {
      setDevnetState({ snapshot: await readSnapshot(getDevnetState().chainJobId) });
    } catch {
      /* keep the old snapshot */
    }
    setBusy(false);
  };
  return (
    <Card>
      <CardTitle>On Solana devnet right now</CardTitle>
      <Text style={type.small}>Read from the chain (slot {snap.slot.toLocaleString("en-US")}), not from this app.</Text>
      {j ? (
        <>
          <Row label="Job account" value={j.state} sub={`${j.areaCha / 100} ha · ${usdc(j.amount)}`} />
          <Row label="Escrow vault" value={usdc(j.vaultBalance)} sub="payment plus bonds held by the program" />
          <Addr label="Job account" addr={j.pda} />
          <Addr label="Vault" addr={j.vault} />
          <Text style={[styles.hash]} selectable>
            Field outline SHA-256 on chain: {j.fieldHash}
          </Text>
        </>
      ) : (
        <Text style={type.body}>No job on chain yet.</Text>
      )}
      <Row label="Farmer USDC" value={usdc(snap.usdc.farmer)} />
      <Row label="Operator USDC" value={usdc(snap.usdc.operator)} />
      <Row label="Kvali treasury USDC" value={usdc(snap.usdc.treasury)} />
      <Row label="Validator pool USDC" value={usdc(snap.usdc.validatorPool)} />
      <Addr label="Kvali program" addr={addresses.programId.toBase58()} />
      <Button small kind="secondary" label={busy ? "Reading…" : "Refresh from chain"} disabled={busy} onPress={refresh} />
    </Card>
  );
}

const styles = StyleSheet.create({
  link: { ...type.small, fontSize: 14, color: colors.accent, textDecorationLine: "underline" },
  hash: { ...type.small, fontSize: 13, wordBreak: "break-all" } as never,
});
