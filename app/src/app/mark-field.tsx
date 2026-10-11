import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import { Pressable } from "@/components/ui/pressable";

import { BigNumber, Button, Card, CardTitle, RoleShell, TwoUp } from "@/components/ui";
import { DrawMap, fmtHa } from "@/components/map/draw-map";
import { addField, useFields } from "@/data/fields-store";
import { areaHa, type LonLat } from "@/geo/geo";
import { colors, fonts, radius, type } from "@/theme";

type Tab = "draw" | "code";

const CROPS = ["Grapes", "Hazelnuts", "Wheat", "Corn", "Apples"] as const;
const PRODUCTS = ["Copper fungicide", "Sulfur fungicide", "Foliar fertiliser", "Insecticide"] as const;

/** A row of choice chips (one can be picked). */
function Choice<T extends string>({ label, id, options, value, onPick }: { label: string; id: string; options: readonly T[]; value: T; onPick: (v: T) => void }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.label} nativeID={id}>
        {label}
      </Text>
      <View accessibilityRole="radiogroup" accessibilityLabelledBy={id} style={styles.chips}>
        {options.map((o) => (
          <Pressable
            key={o}
            accessibilityRole="radio"
            accessibilityState={{ checked: value === o }}
            aria-checked={value === o}
            accessibilityLabel={o}
            onPress={() => onPick(o)}
            style={[styles.chip, value === o && styles.chipOn]}
          >
            <Text style={[styles.chipText, value === o && { color: colors.onAccent }]}>{o}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export default function MarkField() {
  const [tab, setTab] = useState<Tab>("draw");
  const [points, setPoints] = useState<LonLat[]>([]);
  const [closed, setClosed] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [crop, setCrop] = useState<(typeof CROPS)[number]>("Grapes");
  const [product, setProduct] = useState<(typeof PRODUCTS)[number]>("Copper fungicide");
  const count = useFields().fields.length;
  const ha = areaHa(points);
  const n = points.length;
  const defaultName = `Field ${count + 1}`;

  const edit = (p: LonLat[]) => {
    if (p.length < 3) setClosed(false);
    setPoints(p);
  };
  // Undo first re-opens a closed outline, then removes corners one at a time.
  const undo = () => (closed && n >= 3 ? setClosed(false) : edit(points.slice(0, -1)));
  const clear = () => {
    setPoints([]);
    setClosed(false);
  };

  const save = () => {
    addField({
      id: `drawn-${Date.now()}`,
      name: name.trim() || defaultName,
      crop,
      product,
      outline: points,
      source: "drawn",
    });
    router.replace("/farmer");
  };

  return (
    <RoleShell role="farmer" active={0} title="Mark your field" subtitle="Add a field" onBack={() => (router.canGoBack() ? router.back() : router.replace("/farmer"))}>
      <View accessibilityRole="tablist" style={styles.tabs}>
        {([["draw", "Draw on map"], ["code", "Cadastral code"]] as const).map(([k, label]) => (
          <Pressable key={k} accessibilityRole="tab" aria-selected={tab === k} onPress={() => setTab(k)} style={[styles.tab, tab === k && styles.tabOn]}>
            <Text style={[styles.tabText, tab === k && { color: colors.onAccent }]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {tab === "draw" ? (
        <TwoUp>
          <View style={{ gap: 12 }}>
            <DrawMap points={points} onChange={edit} closed={closed} onClosedChange={setClosed} />
            <Text style={type.body}>
              Tap each corner of your field, then tap corner 1 to close it. Drag a corner to move it, tap a corner to remove it, tap + to add one
              in between. Drag the map to move around.
            </Text>
          </View>
          <View style={{ gap: 16 }}>
            <Card style={styles.sizeCard}>
              <BigNumber caption="Field size" value={n >= 3 ? fmtHa(ha) : "—"} sub={`${n} ${n === 1 ? "corner" : "corners"}${closed && n >= 3 ? " · closed" : ""}`} />
              <View style={styles.small}>
                <Button small kind="secondary" label="Undo" disabled={n === 0} onPress={undo} />
                <Button small kind="secondary" label="Clear" disabled={n === 0} onPress={clear} />
              </View>
            </Card>
            <Card style={{ gap: 16 }}>
              <CardTitle>About this field</CardTitle>
              <View style={{ gap: 8 }}>
                <Text style={styles.label} nativeID="fname">
                  Field name
                </Text>
                <TextInput
                  accessibilityLabelledBy="fname"
                  accessibilityLabel="Field name"
                  value={name}
                  onChangeText={setName}
                  placeholder={defaultName}
                  placeholderTextColor={colors.muted}
                  maxLength={40}
                  style={styles.nameInput}
                />
              </View>
              <Choice label="Crop" id="crop" options={CROPS} value={crop} onPick={setCrop} />
              <Choice label="Spray product" id="product" options={PRODUCTS} value={product} onPick={setProduct} />
            </Card>
            {n < 3 ? <Text style={type.small}>{n === 0 ? "Mark at least 3 corners to save the field." : `Add ${3 - n} more ${3 - n === 1 ? "corner" : "corners"} to save the field.`}</Text> : null}
            <Button label="Save field" disabled={n < 3} onPress={save} />
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
  sizeCard: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 },
  small: { flexDirection: "row", gap: 8, flexShrink: 1 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { minHeight: 44, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.card, alignItems: "center", justifyContent: "center" },
  chipOn: { backgroundColor: colors.green, borderColor: colors.green },
  chipText: { fontFamily: fonts.sans, fontSize: 15, fontWeight: "600", color: colors.ink },
  nameInput: {
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.card,
    color: colors.ink,
    fontFamily: fonts.sans,
    fontSize: 17,
  },
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
