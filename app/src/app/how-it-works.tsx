import { StyleSheet, Text, View } from "react-native";

import { Card, CardTitle, RoleShell } from "@/components/ui";
import { colors, fonts, space, type } from "@/theme";

const steps = [
  ["Post", "The farmer posts a spraying job and the payment is held safely, in USDC."],
  ["Bond", "A certified drone operator accepts the job and locks a USDC bond."],
  ["Spray", "The drone sprays the field and records liters dispensed and area covered."],
  ["Verify", "Validators check liters per hectare and coverage against the job terms."],
  ["Settle", "If the proof passes and nobody challenges it, the operator is paid automatically."],
] as const;

export default function HowItWorks() {
  return (
    <RoleShell title="How it works" subtitle="Proof of spray">
      {steps.map(([title, text], i) => (
        <Card key={title}>
          <View style={styles.row}>
            <View style={styles.num}>
              <Text style={styles.numText}>{i + 1}</Text>
            </View>
            <View style={styles.text}>
              <CardTitle>{title}</CardTitle>
              <Text style={type.body}>{text}</Text>
            </View>
          </View>
        </Card>
      ))}
    </RoleShell>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: space.md, alignItems: "flex-start" },
  num: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.softGreen, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  numText: { fontFamily: fonts.display, fontSize: 18, fontWeight: "700", color: colors.green },
  text: { flex: 1, flexShrink: 1, gap: space.xs },
});
