import { router, type Href } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { addressFor, roleLabel, shortAddr, signOut, useAccount, type Role } from "@/account/store";
import { colors, fonts, radius } from "@/theme";

/** Signed-in demo account (name, role, public devnet address) with "Sign out"; "Sign in" when there is none. */
export function AccountChip({ role }: { role?: Role }) {
  const a = useAccount(role);
  if (!a) {
    return (
      <Pressable accessibilityRole="link" onPress={() => router.replace((role ? `/?role=${role}` : "/") as Href)} style={styles.btn}>
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
      <View style={styles.who}>
        <Text style={styles.name} numberOfLines={1} accessibilityLabel={`Signed in as ${a.name}`}>
          {a.name}
        </Text>
        <Text style={styles.sub} numberOfLines={1} {...({ dataSet: { kv: "chipsub" } } as object)}>
          {roleLabel(a.role)} · {shortAddr(addressFor(a.role))}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Sign out"
        onPress={() => {
          signOut(a.role);
          router.replace("/");
        }}
        style={styles.btn}
      >
        <Text style={styles.btnText}>Sign out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1, maxWidth: 220 },
  who: { flexShrink: 1, minWidth: 0, alignItems: "flex-end" },
  name: { fontFamily: fonts.sans, fontSize: 15, fontWeight: "600", color: colors.ink },
  sub: { fontFamily: fonts.sans, fontSize: 12, color: colors.muted },
  btn: { minHeight: 44, paddingHorizontal: 10, justifyContent: "center", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  btnText: { fontFamily: fonts.sans, fontSize: 14, fontWeight: "600", color: colors.green },
});
