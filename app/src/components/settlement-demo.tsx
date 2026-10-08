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
  // computeSettlement pays the operator the job payment minus fees PLUS the returned bond.
  const bondBack = bond;
  const pay = p.operator - bondBack;
  const total = p.operator + p.kvali + p.validators + p.farmer;

  const rows: [string, bigint, string][] = [
    ["Operator earns (payment minus fees)", pay, colors.green],
    ["Operator bond returned", bondBack, colors.green],
    ["Kvali fee (3% of the job)", p.kvali, colors.ink],
    ["Validators (2% of the job)", p.validators, colors.ink],
  ];

  return (
    <Card>
      <CardTitle>Example: where the money goes</CardTitle>
      <Text style={type.body}>
        A {usd(amount)} job plus the operator bond of {usd(bond)} = {usd(amount + bond)} held in escrow. Proof passed, nobody challenged:
      </Text>
      {rows.map(([label, value, color]) => (
        <View key={label} style={styles.row}>
          <Text style={[type.body, { flexShrink: 1 }]}>{label}</Text>
          <Text style={[type.body, styles.value, { color }]}>{usd(value)}</Text>
        </View>
      ))}
      <View style={styles.row}>
        <Text style={[type.body, styles.value, { flexShrink: 1 }]}>Total paid out</Text>
        <Text style={[type.body, styles.value]}>
          {usd(total)} {total === amount + bond ? "✓ adds up" : ""}
        </Text>
      </View>
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
    gap: space.md,
  },
  value: { fontWeight: "700" },
  note: { fontWeight: "400", marginTop: space.xs },
});
