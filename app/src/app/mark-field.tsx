import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { BigNumber, Button, Card, RoleShell, TwoUp } from "@/components/ui";
import { DrawMap } from "@/components/map/draw-map";
import { haText } from "@/components/farmer/fields";
import { addField, useFields } from "@/data/fields-store";
import { areaHa, type LonLat } from "@/geo/geo";
import { colors, fonts, radius, type } from "@/theme";

type Tab = "draw" | "code";

export default function MarkField() {
  const [tab, setTab] = useState<Tab>("draw");
  const [points, setPoints] = useState<LonLat[]>([]);
  const [code, setCode] = useState("");
  const count = useFields().fields.length;
  const ha = areaHa(points);

  const save = () => {
    addField({
      id: `drawn-${Date.now()}`,
      name: `Field ${count + 1} (drawn by me)`,
      crop: "Grapes",
      product: "Copper fungicide",
      outline: points,
      source: "drawn",
    });
    router.replace("/farmer");
  };

  return (
    <RoleShell role="farmer" active={0} title="Mark your field" subtitle="Step 1 of 3 · Post a job" onBack={() => (router.canGoBack() ? router.back() : router.replace("/farmer"))}>
      <View accessibilityRole="tablist" style={styles.tabs}>
        {([["draw", "Draw on map"], ["code", "Cadastral code"]] as const).map(([k, label]) => (
          <Pressable key={k} accessibilityRole="tab" accessibilityState={{ selected: tab === k }} onPress={() => setTab(k)} style={[styles.tab, tab === k && styles.tabOn]}>
            <Text style={[styles.tabText, tab === k && { color: colors.onAccent }]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {tab === "draw" ? (
        <TwoUp>
          <View style={{ gap: 12 }}>
            <View>
              <DrawMap points={points} onChange={setPoints} />
              <View pointerEvents="none" style={styles.hint}>
                <Text style={styles.hintText}>{points.length === 0 ? "Tap to add your first corner" : `${points.length} ${points.length === 1 ? "point" : "points"} · tap to add more`}</Text>
              </View>
            </View>
            <Text style={type.body}>Tap each corner of your field. Drag a point to move it.</Text>
          </View>
          <View style={{ gap: 16 }}>
            <Card style={styles.sizeCard}>
              <BigNumber caption="Field size" value={haText(ha)} />
              <View style={styles.small}>
                <Button small kind="secondary" label="Undo" disabled={points.length === 0} onPress={() => setPoints(points.slice(0, -1))} />
                <Button small kind="secondary" label="Clear" disabled={points.length === 0} onPress={() => setPoints([])} />
              </View>
            </Card>
            {points.length > 0 && points.length < 3 ? <Text style={type.small}>Add at least 3 corners to make a field.</Text> : null}
            <Button label="Save field" disabled={points.length < 3} onPress={save} />
          </View>
        </TwoUp>
      ) : (
        <View style={{ gap: 16, maxWidth: 560 }}>
          <View style={{ gap: 8 }}>
            <Text style={styles.label} nativeID="cad">
              Cadastral code of your land
            </Text>
            <View style={styles.codeRow}>
              <TextInput
                accessibilityLabelledBy="cad"
                value={code}
                onChangeText={setCode}
                placeholder="50.10.33.012"
                placeholderTextColor={colors.muted}
                keyboardType="numbers-and-punctuation"
                style={styles.input}
              />
              <View style={{ width: 96 }}>
                <Button label="Find" disabled onPress={() => {}} />
              </View>
            </View>
            <Text style={type.small}>It is on your land registry extract. No code? Draw the field instead.</Text>
          </View>
          <Card>
            <View style={styles.soon}>
              <Text style={styles.soonText}>Coming soon</Text>
            </View>
            <Text style={[type.body, { color: colors.ink, fontWeight: "600" }]}>Coming soon — registry lookup</Text>
            <Text style={type.body}>
              Soon you will type the code from your registry extract and we will fetch the official boundary, marked “Verified boundary”. Until then,
              draw the field on the map. It takes a minute.
            </Text>
          </Card>
          <Button label="Draw it instead" onPress={() => setTab("draw")} />
        </View>
      )}
    </RoleShell>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: "row", gap: 4, padding: 4, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg },
  tab: { flex: 1, minHeight: 48, borderRadius: radius.sm, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  tabOn: { backgroundColor: colors.green },
  tabText: { fontFamily: fonts.sans, fontSize: 16, fontWeight: "600", color: colors.ink, textAlign: "center", flexShrink: 1 },
  hint: { position: "absolute", left: 12, top: 12, backgroundColor: colors.card, borderRadius: radius.sm, paddingVertical: 8, paddingHorizontal: 12, maxWidth: "75%" },
  hintText: { fontFamily: fonts.sans, fontSize: 15, fontWeight: "600", color: colors.ink },
  sizeCard: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 },
  small: { flexDirection: "row", gap: 8, flexShrink: 1 },
  label: { fontFamily: fonts.sans, fontSize: 16, fontWeight: "600", color: colors.ink },
  codeRow: { flexDirection: "row", gap: 8, alignItems: "stretch" },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: 56,
    paddingHorizontal: 16,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.ink,
    backgroundColor: colors.card,
    color: colors.ink,
    fontFamily: fonts.display,
    fontSize: 20,
    fontWeight: "500",
  },
  soon: { alignSelf: "flex-start", borderRadius: 999, borderWidth: 1.5, borderColor: colors.accent, paddingVertical: 4, paddingHorizontal: 12 },
  soonText: { fontFamily: fonts.sans, fontSize: 15, fontWeight: "700", color: colors.accent },
});
