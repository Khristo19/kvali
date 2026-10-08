import { useEffect, type ReactNode } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { DESKTOP_MAX_WIDTH, colors } from "@/theme";
import { ScreenHeader } from "./header";
import { useWide } from "./layout";
import { AccountChip } from "./account-chip";
import { ROLE_TABS, SideNav, TabBar, useTab, type Role } from "./nav";
import { NoticeBar, clearNotice } from "./notice";
import { WalletBar } from "./wallet-bar";

/**
 * Page frame for every role screen.
 * Phone: header + scrolling content + bottom tab bar.
 * Desktop (>= 900 px): centred column (max 1100 px) with a left side nav instead of the bar.
 * Without `role` there is no nav (used for plain pages such as How it works).
 */
export function RoleShell({
  role,
  active,
  title,
  subtitle,
  onBack,
  children,
}: {
  role?: Role;
  active?: number;
  title: string;
  subtitle?: string;
  onBack?: (() => void) | null;
  children: ReactNode;
}) {
  const wide = useWide();
  const tab = useTab(role ?? "farmer");
  const idx = active ?? (role ? ROLE_TABS[role].tabs.findIndex((t) => t.key === tab) : -1);
  // A result line belongs to the page it was shown on.
  useEffect(() => clearNotice, []);
  const body = (
    <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, wide && styles.contentWide]} keyboardShouldPersistTaps="handled">
      <View style={[styles.column, wide && styles.columnWide]}>
        <ScreenHeader title={title} subtitle={subtitle} onBack={onBack} right={<AccountChip role={role} />} />
        <WalletBar />
        <NoticeBar />
        {children}
      </View>
    </ScrollView>
  );

  if (wide) {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={styles.page}>
          {role ? <SideNav role={role} active={idx} /> : null}
          {body}
        </View>
      </SafeAreaView>
    );
  }
  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      {body}
      {role ? <TabBar role={role} active={idx} /> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  page: { flex: 1, flexDirection: "row", width: "100%", maxWidth: DESKTOP_MAX_WIDTH, alignSelf: "center" },
  scroll: { flex: 1 },
  content: { padding: 20, paddingTop: 16, paddingBottom: 28 },
  contentWide: { paddingHorizontal: 24, paddingTop: 32, paddingBottom: 48 },
  column: { width: "100%", gap: 16 },
  columnWide: { maxWidth: 860, alignSelf: "flex-start" },
});
