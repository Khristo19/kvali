import { router, type Href } from "expo-router";
import { useEffect, type ReactNode } from "react";
import { Platform, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAccount } from "@/account/store";
import { NetworkAlert } from "@/components/devnet/mode-banner";
import { DESKTOP_MAX_WIDTH, colors } from "@/theme";
import { ScreenHeader } from "./header";
import { useWide } from "./layout";
import { AccountChip } from "./account-chip";
import { ROLE_TABS, SideNav, TabBar, useTab, type Role } from "./nav";
import { clearNotice } from "./notice";
import { Toasts } from "./toasts";

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
  const tab = useTab(role ?? "farmer");
  const idx = active ?? (role ? ROLE_TABS[role].tabs.findIndex((t) => t.key === tab) : -1);
  const signedIn = !!useAccount(role);
  // A role page (no `active` given) never sends a signed-in user back to the sign-in screen: from another tab, back goes to
  // the role's first tab; on the first tab there is nothing to go back to. Signed out, back goes to sign-up for this role.
  const back: (() => void) | null | undefined =
    onBack !== undefined || !role || active !== undefined
      ? onBack
      : tab !== ""
        ? () => router.replace(`/${role}` as Href)
        : signedIn
          ? null
          : () => router.replace(`/?role=${role}` as Href);
  // A result line belongs to the page it was shown on.
  useEffect(() => clearNotice, []);
  // Web: both navs are in the page and CSS (+html.tsx) shows the right one, so nothing moves after load.
  // Native: the real window width is known at the first render.
  const wide = useWide();
  const web = Platform.OS === "web";
  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <View style={styles.page}>
        {role && (web || wide) ? <SideNav role={role} active={idx} /> : null}
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.column}>
            <ScreenHeader title={title} subtitle={subtitle} onBack={back} right={<AccountChip role={role} />} />
            <NetworkAlert />
            {children}
          </View>
        </ScrollView>
      </View>
      {role && (web || !wide) ? <TabBar role={role} active={idx} /> : null}
      <Toasts />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  page: { flex: 1, flexDirection: "row", width: "100%", maxWidth: DESKTOP_MAX_WIDTH, alignSelf: "center" },
  scroll: { flex: 1 },
  content: { padding: 20, paddingTop: 20, paddingBottom: 36 },
  column: { width: "100%", maxWidth: 860, alignSelf: "flex-start", gap: 16 },
});
