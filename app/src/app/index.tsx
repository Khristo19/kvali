import { router, type Href } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { SettlementDemo } from "@/components/settlement-demo";
import { Button, Icon, useWide } from "@/components/ui";
import { privyConfigured } from "@/config";
import { useMode } from "@/devnet/mode";
import { colors, fonts, radius, space, type } from "@/theme";

type RoleId = "farmer" | "operator" | "validator";

const roles: { id: RoleId; title: string; desc: string; href: Href; glyph: string }[] = [
  { id: "farmer", title: "Farmer", desc: "I need my field sprayed", href: "/farmer", glyph: "⌂" },
  { id: "operator", title: "Drone operator", desc: "I spray fields with my drone", href: "/operator", glyph: "✢" },
  { id: "validator", title: "Validator", desc: "I am an agronomist who checks proof", href: "/validator", glyph: "✓" },
];

export default function Home() {
  const mode = useMode();
  const [picked, setPicked] = useState<RoleId>("farmer");
  const wide = useWide();
  const go = () => router.push(roles.find((r) => r.id === picked)!.href);

  return (
    <SafeAreaView style={styles.top} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={[styles.content, wide && { paddingTop: 72 }]}>
        <View style={styles.column}>
          <View style={styles.hero}>
            <View style={styles.logo} accessibilityLabel="Kvali logo">
              <View style={styles.drop} />
              <View style={styles.dropCheck}>
                <Icon name="check" color={colors.green} size={20} />
              </View>
            </View>
            <View style={{ alignItems: "center", gap: 4 }}>
              <Text style={styles.brand} accessibilityRole="header">
                Kvali
              </Text>
              <Text style={styles.tagline}>Proof of spray</Text>
            </View>
          </View>

          <View style={styles.roles} accessibilityRole="radiogroup">
            <Text style={styles.who}>Who are you?</Text>
            {roles.map((r) => {
              const on = r.id === picked;
              return (
                <Pressable
                  key={r.id}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`${r.title}. ${r.desc}`}
                  onPress={() => setPicked(r.id)}
                  style={[styles.role, on && styles.roleOn]}
                >
                  <View style={styles.tile}>
                    <Text style={styles.glyph}>{r.glyph}</Text>
                  </View>
                  <View style={styles.roleText}>
                    <Text style={styles.roleTitle}>{r.title}</Text>
                    <Text style={styles.roleDesc}>{r.desc}</Text>
                  </View>
                  <View style={[styles.dot, on && styles.dotOn]} />
                </Pressable>
              );
            })}
          </View>

          <View style={styles.actions}>
            {/* Sign-in is not wired up yet (wallet tasks later): both buttons open the picked role. */}
            <Button label="Continue with email" onPress={go} />
            <Button label="Connect Phantom" kind="secondary" onPress={go} />
            <Text style={styles.footnote}>A secure account is created for you. No crypto knowledge needed.</Text>
          </View>

          <View style={styles.links}>
            <Pressable accessibilityRole="link" onPress={() => router.push("/how-it-works")} style={styles.link}>
              <Text style={styles.linkText}>How it works</Text>
            </Pressable>
            <Pressable accessibilityRole="link" onPress={() => router.push("/job")} style={styles.link}>
              <Text style={styles.linkText}>Job story</Text>
            </Pressable>
          </View>

          <SettlementDemo />

          <Text style={[type.small, { textAlign: "center" }]}>{mode === "devnet" ? "Devnet mode" : "Simulated mode"} · Privy config {privyConfigured ? "loaded" : "missing"}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  top: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingTop: 40, paddingBottom: 28, alignItems: "center" },
  column: { width: "100%", maxWidth: 480, gap: 28 },
  hero: { alignItems: "center", gap: 14 },
  logo: { width: 72, height: 72, borderRadius: 20, backgroundColor: colors.green, alignItems: "center", justifyContent: "center" },
  drop: { width: 34, height: 34, borderRadius: 17, borderTopLeftRadius: 0, backgroundColor: colors.background, transform: [{ rotate: "45deg" }] },
  dropCheck: { position: "absolute", top: 0, bottom: 0, left: 0, right: 0, alignItems: "center", justifyContent: "center", paddingTop: 4 },
  brand: { fontFamily: fonts.display, fontSize: 40, lineHeight: 42, fontWeight: "700", color: colors.ink, letterSpacing: -0.8 },
  tagline: { fontFamily: fonts.sans, fontSize: 18, color: colors.muted },
  roles: { gap: 12 },
  who: { fontFamily: fonts.display, fontSize: 22, fontWeight: "700", color: colors.ink, marginBottom: 4 },
  role: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    minHeight: 84,
    padding: 16,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  roleOn: { borderWidth: 2, borderColor: colors.green, padding: 15.5 },
  tile: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  glyph: { fontSize: 22, color: colors.green, fontWeight: "700" },
  roleText: { flex: 1, flexShrink: 1, minWidth: 0, gap: 2 },
  roleTitle: { fontFamily: fonts.display, fontSize: 19, fontWeight: "700", color: colors.ink },
  roleDesc: { fontFamily: fonts.sans, fontSize: 16, lineHeight: 22, color: colors.muted },
  dot: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.card, flexShrink: 0 },
  dotOn: { borderWidth: 8, borderColor: colors.green },
  actions: { gap: space.md },
  footnote: { ...type.small, fontSize: 16, textAlign: "center", marginTop: 6 },
  links: { flexDirection: "row", justifyContent: "center", gap: space.lg },
  link: { minHeight: 44, justifyContent: "center", paddingHorizontal: 14 },
  linkText: { ...type.body, fontWeight: "600", color: colors.green, textDecorationLine: "underline" },
});
