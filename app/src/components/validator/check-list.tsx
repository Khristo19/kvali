import { StyleSheet, Text, View } from "react-native";

import type { Check } from "@kvali/proof/verdict";

import { Icon } from "@/components/ui";
import { colors, space, type } from "@/theme";

// Plain-words names for the check ids that come from services/proof/src/verdict.ts.
const TITLES: Record<string, string> = {
  coverage: "Field covered",
  rate: "Spray rate vs target ± tolerance",
  "tank-crosscheck": "Flow meter vs tank weight",
};

/** Checklist with big boxes: ticked green = the check passed, empty red box = it failed. */
export function CheckList({ checks }: { checks: Check[] }) {
  return (
    <View>
      {checks.map((c, i) => (
        <View
          key={c.name}
          style={[styles.row, i > 0 && styles.sep]}
          accessible
          accessibilityLabel={`${TITLES[c.name] ?? c.name}: ${c.pass ? "pass" : "fail"}. ${c.detail}`}
        >
          <View style={[styles.box, c.pass ? styles.boxOn : styles.boxFail]}>
            {c.pass ? <Icon name="check" color={colors.card} size={20} /> : null}
          </View>
          <View style={styles.text}>
            <Text style={styles.title}>{TITLES[c.name] ?? c.name}</Text>
            <Text style={type.body}>{c.detail}</Text>
            <Text style={[styles.verdict, { color: c.pass ? colors.green : colors.error }]}>{c.pass ? "Within limit" : "Fails the check"}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 14, alignItems: "flex-start", minHeight: 64, paddingVertical: space.md },
  sep: { borderTopWidth: 1, borderTopColor: colors.border },
  box: { width: 28, height: 28, borderRadius: 8, borderWidth: 2, alignItems: "center", justifyContent: "center", marginTop: 2, flexShrink: 0 },
  boxOn: { backgroundColor: colors.green, borderColor: colors.green },
  boxFail: { backgroundColor: colors.card, borderColor: colors.error },
  text: { flex: 1, flexShrink: 1, minWidth: 0, gap: 2 },
  title: { ...type.body, fontSize: 17, fontWeight: "600", color: colors.ink },
  verdict: { ...type.small, fontWeight: "600", marginTop: 2 },
});
