import { router, useLocalSearchParams, usePathname, type Href } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, fonts, radius } from "@/theme";
import { Icon, type IconName } from "./icons";

export type Role = "farmer" | "operator" | "validator";

export interface Tab {
  /** Value of the ?tab= parameter ("" for the first tab, which is the plain page). */
  key: string;
  label: string;
  icon: IconName;
}

/** Tabs per role. Every tab is a real view of the same page, chosen with ?tab= (see useTab). */
export const ROLE_TABS: Record<Role, { title: string; tabs: Tab[] }> = {
  farmer: {
    title: "Farmer",
    tabs: [
      { key: "", label: "My jobs", icon: "jobs" },
      { key: "post", label: "Post a job", icon: "plus" },
      { key: "payments", label: "Payments", icon: "wallet" },
      { key: "help", label: "Help", icon: "help" },
    ],
  },
  operator: {
    title: "Drone operator",
    tabs: [
      { key: "", label: "Jobs", icon: "pin" },
      { key: "mine", label: "My jobs", icon: "jobs" },
      { key: "earnings", label: "Earnings", icon: "wallet" },
      { key: "drones", label: "Drones", icon: "drone" },
    ],
  },
  validator: {
    title: "Validator",
    tabs: [
      { key: "", label: "Queue", icon: "list" },
      { key: "reviewed", label: "Reviewed", icon: "check" },
      { key: "earnings", label: "Earnings", icon: "wallet" },
      { key: "profile", label: "Profile", icon: "person" },
    ],
  },
};

/** The current tab key of a role page ("" = first tab). */
export function useTab(role: Role): string {
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const t = Array.isArray(tab) ? tab[0] : tab;
  return ROLE_TABS[role].tabs.some((x) => x.key === t) ? (t as string) : "";
}

/** Go to a tab of a role page. Replaces the current entry, so tabs never pile up in the history. */
function useGo(role: Role) {
  const current = useTab(role);
  const pathname = usePathname();
  return (key: string) => {
    if (pathname === `/${role}` && key === current) return;
    router.replace((key ? { pathname: `/${role}`, params: { tab: key } } : `/${role}`) as Href);
  };
}

export function TabBar({ role, active }: { role: Role; active: number }) {
  const insets = useSafeAreaInsets();
  const go = useGo(role);
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
            onPress={() => go(t.key)}
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
  const go = useGo(role);
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
            onPress={() => go(t.key)}
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
