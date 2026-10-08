import { StyleSheet, Text } from "react-native";

import { ExtLink } from "@/components/ui/ext-link";

import { Row as UiRow, StatusChip, type ChipTone } from "@/components/ui";
import { colors, type } from "@/theme";
import { explorerUrl, isSimulated, shortTx } from "./helpers";

export { Button } from "@/components/ui/button";
export { useTick } from "@/components/ui/use-tick";

export function Chip({ label, tone = "green" }: { label: string; tone?: ChipTone }) {
  return <StatusChip label={label} tone={tone} />;
}

/** Simulated ids are plain muted text; real signatures link to the devnet explorer. */
export function TxId({ tx }: { tx: string }) {
  if (isSimulated(tx)) {
    return (
      <Text style={styles.tx} accessibilityLabel={`Simulated transaction ${tx}`} selectable>
        {tx}
      </Text>
    );
  }
  return (
    <ExtLink url={explorerUrl(tx)} label="Open transaction in Solana Explorer" style={[styles.tx, styles.link]}>
      {shortTx(tx)} (Explorer)
    </ExtLink>
  );
}

export function Row({ left, right, bold }: { left: string; right: string; bold?: boolean }) {
  return <UiRow label={left} value={right} bold={bold} />;
}

const styles = StyleSheet.create({
  tx: { ...type.small, fontSize: 14, flexShrink: 1 },
  link: { color: colors.accent, textDecorationLine: "underline" },
});
