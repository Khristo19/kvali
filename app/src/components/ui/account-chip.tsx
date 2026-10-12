import { router, type Href } from "expo-router";
import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Pressable } from "@/components/ui/pressable";

import { privyLogout } from "@/auth/privy";
import { addressFor, roleLabel, shortAddr, signOut, useAccount, type Role } from "@/account/store";
import { activeLabel, loadMulti, useMulti } from "@/devnet/multi";
import { switcherOn } from "@/presenter/store";
import { colors, fonts, radius } from "@/theme";

/** Signed-in demo account (name, role, public devnet address) with "Sign out"; "Sign in" when there is none. */
export function AccountChip({ role }: { role?: Role }) {
  const a = useAccount(role);
  const multi = useMulti();
  useEffect(() => {
    if (a && switcherOn()) loadMulti(); // presenter mode: picks up the wallet this chip just created, so it shows "Farmer 1"
  }, [a]);
  if (!a) {
    return (
      <Pressable testID="chip-signup" accessibilityRole="link" onPress={() => router.replace((role ? `/?role=${role}` : "/") as Href)} style={styles.btn}>
        <Text style={styles.btnText}>{role ? (
          <>
            <Text {...({ dataSet: { kv: "chipwide" } } as object)}>Sign up as {roleLabel(role).toLowerCase()}</Text>
            <Text {...({ dataSet: { kv: "chipnarrow" } } as object)}>Sign up</Text>
          </>
        ) : (
          "Sign in"
        )}</Text>
      </Pressable>
    );
  }
  return (
    <View style={styles.box} {...({ dataSet: { kv: "chip" } } as object)}>
      <View style={styles.who} {...({ dataSet: { kv: "chipwho" } } as object)}>
        <View style={styles.nameRow}>
          <Text testID="account-name" style={styles.name} numberOfLines={1} accessibilityLabel={`Signed in as ${a.name}`}>
            {a.name}
          </Text>
          {a.verified ? (
            <Text testID="account-verified" style={styles.verified} numberOfLines={1} accessibilityLabel="Email verified">
              ✓ verified
            </Text>
          ) : null}
        </View>
        <Text style={styles.sub} numberOfLines={1} {...({ dataSet: { kv: "chipsub" } } as object)}>
          {activeLabel(multi, a.role) ?? roleLabel(a.role)} · {shortAddr(addressFor(a.role))}
        </Text>
      </View>
      <Pressable
        testID="signout-all"
        accessibilityRole="button"
        accessibilityLabel="Sign out (all roles)"
        onPress={() => {
          signOut();
          void privyLogout();
          router.replace("/");
        }}
        style={styles.btn}
      >
        <Text style={[styles.btnText, { textAlign: "center" }]}>
          <Text {...({ dataSet: { kv: "chipwide" } } as object)}>Sign out (all roles)</Text>
          <Text {...({ dataSet: { kv: "chipnarrow" } } as object)}>Sign out</Text>
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1, maxWidth: 220 },
  who: { flexShrink: 1, minWidth: 0, alignItems: "flex-end" },
  nameRow: { flexDirection: "row", alignItems: "baseline", gap: 4, maxWidth: "100%" },
  name: { flexShrink: 1, fontFamily: fonts.sans, fontSize: 15, fontWeight: "600", color: colors.ink },
  verified: { flexShrink: 0, fontFamily: fonts.sans, fontSize: 12, fontWeight: "600", color: colors.green },
  sub: { fontFamily: fonts.sans, fontSize: 12, color: colors.muted },
  btn: { minHeight: 44, paddingHorizontal: 10, justifyContent: "center", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  btnText: { fontFamily: fonts.sans, fontSize: 14, fontWeight: "600", color: colors.green },
});
