import { StyleSheet, Text, View } from "react-native";

// Shared, tested logic from services/proof/src (not a copy).
import { computeSettlement } from "@kvali/proof/settlement";

import { Card, CardTitle } from "@/components/ui";
import { colors, space, type } from "@/theme";

const USDC = 1_000_000n; // 6 decimals

function usd(baseUnits: bigint): string {
  const whole = baseUnits / USDC;
  const cents = (baseUnits % USDC) / 10_000n;
  return cents === 0n ? `$${whole}` : `$${whole}.${cents.toString().padStart(2, "0")}`;
}

export function SettlementDemo() {
  const amount = 300n * USDC;
  const bond = 300n * USDC;
  const p = computeSettlement(amount, bond, "settled");

  const rows: [string, bigint, string][] = [
    ["Operator payout", p.operator, colors.green],
    ["Kvali fee (3%)", p.kvali, colors.ink],
    ["Validators (2%)", p.validators, colors.ink],
  ];

  return (
    <Card>
      <CardTitle>Demo settlement</CardTitle>
      <Text style={type.body}>
        {usd(amount)} job, {usd(bond)} operator bond, proof passed:
      </Text>
      {rows.map(([label, value, color]) => (
        <View key={label} style={styles.row}>
          <Text style={type.body}>{label}</Text>
          <Text style={[type.body, styles.value, { color }]}>{usd(value)}</Text>
        </View>
      ))}
      <Text style={[type.small, styles.note]}>Computed by services/proof settlement.ts</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: space.sm,
  },
  value: { fontWeight: "700" },
  note: { fontWeight: "400", marginTop: space.xs },
});
