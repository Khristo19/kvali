import { router, usePathname, type Href } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, fonts, radius } from "@/theme";
import { Icon, type IconName } from "./icons";

export type Role = "farmer" | "operator" | "validator";

export interface Tab {
  label: string;
  icon: IconName;
  href: Href;
}

/** Tabs per role, as in the approved mockups. Tabs without a screen yet go to the role's screen. */
export const ROLE_TABS: Record<Role, { title: string; tabs: Tab[] }> = {
  farmer: {
    title: "Farmer",
    tabs: [
      { label: "My jobs", icon: "jobs", href: "/farmer" },
      { label: "Post a job", icon: "plus", href: "/farmer" },
      { label: "Payments", icon: "wallet", href: "/job" },
      { label: "Help", icon: "help", href: "/how-it-works" },
    ],
  },
  operator: {
    title: "Drone operator",
    tabs: [
      { label: "Jobs", icon: "pin", href: "/operator" },
      { label: "My jobs", icon: "jobs", href: "/operator" },
      { label: "Earnings", icon: "wallet", href: "/job" },
      { label: "Drones", icon: "drone", href: "/operator" },
    ],
  },
  validator: {
    title: "Validator",
    tabs: [
      { label: "Queue", icon: "list", href: "/validator" },
      { label: "Reviewed", icon: "check", href: "/validator" },
      { label: "Earnings", icon: "wallet", href: "/validator" },
      { label: "Profile", icon: "person", href: "/validator" },
    ],
  },
};

/** Go to a tab. Never pushes a duplicate of the screen you are already on. */
function useGo() {
  const pathname = usePathname();
  return (href: Href) => {
    if (typeof href === "string" && href === pathname) return;
    router.replace(href);
  };
}

export function TabBar({ role, active }: { role: Role; active: number }) {
  const insets = useSafeAreaInsets();
  const go = useGo();
  return (
    <View accessibilityRole="tablist" style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) + 6 }]}>
      {ROLE_TABS[role].tabs.map((t, i) => {
        const on = i === active;
        const c = on ? colors.green : colors.muted;
        return (
          <Pressable
            key={t.label}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={t.label}
            onPress={() => go(t.href)}
            style={styles.tab}
          >
            <Icon name={t.icon} color={c} size={24} />
            <Text numberOfLines={1} style={[styles.tabText, { color: c }]}>
              {t.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Desktop left navigation. */
export function SideNav({ role, active }: { role: Role; active: number }) {
  const go = useGo();
  const cfg = ROLE_TABS[role];
  return (
    <View style={styles.side} accessibilityRole="tablist">
      <Pressable accessibilityRole="link" accessibilityLabel="Kvali home" onPress={() => router.replace("/")} style={styles.brand}>
        <View style={styles.logo}>
          <View style={styles.logoDrop} />
        </View>
        <View>
          <Text style={styles.brandName}>Kvali</Text>
          <Text style={styles.brandRole}>{cfg.title}</Text>
        </View>
      </Pressable>
      {cfg.tabs.map((t, i) => {
        const on = i === active;
        const c = on ? colors.green : colors.body;
        return (
          <Pressable
            key={t.label}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => go(t.href)}
            style={[styles.sideItem, on && styles.sideItemOn]}
          >
            <Icon name={t.icon} color={c} size={22} />
            <Text style={[styles.sideText, { color: c }, on && { fontWeight: "700" }]}>{t.label}</Text>
          </Pressable>
        );
      })}
      <View style={{ flex: 1 }} />
      <Pressable accessibilityRole="link" onPress={() => router.replace("/")} style={styles.sideItem}>
        <Icon name="back" color={colors.muted} size={22} />
        <Text style={[styles.sideText, { color: colors.muted }]}>Change role</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 8,
    paddingHorizontal: 8,
  },
  tab: { flex: 1, minWidth: 0, minHeight: 56, alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 6, borderRadius: radius.md },
  tabText: { fontFamily: fonts.sans, fontSize: 15, fontWeight: "600" },
  side: { width: 232, paddingTop: 32, paddingRight: 16, gap: 6 },
  brand: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 20, paddingHorizontal: 8 },
  logo: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.green, alignItems: "center", justifyContent: "center" },
  logoDrop: { width: 18, height: 18, backgroundColor: colors.background, borderRadius: 9, borderTopLeftRadius: 0, transform: [{ rotate: "45deg" }] },
  brandName: { fontFamily: fonts.display, fontSize: 22, fontWeight: "700", color: colors.ink, lineHeight: 26 },
  brandRole: { fontFamily: fonts.sans, fontSize: 15, color: colors.muted },
  sideItem: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 52, paddingHorizontal: 14, borderRadius: radius.md },
  sideItemOn: { backgroundColor: colors.softGreen },
  sideText: { fontFamily: fonts.sans, fontSize: 17, fontWeight: "600" },
});
