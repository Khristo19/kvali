import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Pressable } from "@/components/ui/pressable";

import { shortAddr, useAccount, type Role } from "@/account/store";
import { MAX_ACCOUNTS, activeEntry, addAccount, entryAddr, entryLabel, loadMulti, roleName, setSeat, switchTo, useMulti } from "@/devnet/multi";
import { keyFor } from "@/devnet/keys";
import { VALIDATORS } from "@/engine/scenario";
import { SWITCHER } from "@/env";
import { colors, fonts, radius } from "@/theme";

/**
 * STAGING ONLY. Next to the account chip: pick which farmer / operator account (or which of the 3 validator seats) you act as.
 * A fixed-size button with an overlay menu, so opening it never moves anything on the page.
 */
export function AccountSwitcher({ role }: { role?: Role }) {
  const acct = useAccount(role);
  const m = useMulti();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (SWITCHER && acct) loadMulti(); // picks up a wallet that was just created
  }, [acct]);
  if (!SWITCHER || !role || !acct) return null;

  if (role === "validator") {
    const cur = VALIDATORS.find((v) => v.id === m.seat) ?? VALIDATORS[0];
    return (
      <View style={styles.wrap}>
        <Pressable testID="acct-switch" accessibilityRole="button" accessibilityLabel={`Acting as the ${cur.seat} validator seat. Switch seat.`} aria-expanded={open} onPress={() => setOpen(!open)} style={styles.btn}>
          <Text style={styles.btnText} numberOfLines={1}>
            {cur.seat} seat ▾
          </Text>
        </Pressable>
        {open ? (
          <View testID="acct-menu" style={styles.menu}>
            {VALIDATORS.map((v) => (
              <Pressable
                key={v.id}
                testID={`acct-option-${v.seat}`}
                accessibilityRole="menuitem"
                onPress={() => {
                  setSeat(v.id);
                  setOpen(false);
                }}
                style={[styles.opt, v.id === m.seat && styles.optOn]}
              >
                <Text style={[styles.optText, v.id === m.seat && styles.optTextOn]}>
                  {v.id === m.seat ? "✓ " : ""}
                  {v.label}
                </Text>
                <Text style={styles.optSub}>{shortAddr(keyFor(v.id).publicKey.toBase58())}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
    );
  }

  const list = m[role];
  const cur = activeEntry(m, role);
  return (
    <View style={styles.wrap}>
      <Pressable testID="acct-switch" accessibilityRole="button" accessibilityLabel={`Active account ${cur ? entryLabel(role, cur) : roleName(role)}. Switch account.`} aria-expanded={open} onPress={() => setOpen(!open)} style={styles.btn}>
        <Text style={styles.btnText} numberOfLines={1}>
          {cur ? entryLabel(role, cur) : roleName(role)} ▾
        </Text>
      </Pressable>
      {open ? (
        <View testID="acct-menu" style={styles.menu}>
          {list.map((e) => (
            <Pressable
              key={e.id}
              testID={`acct-option-${e.id}`}
              accessibilityRole="menuitem"
              onPress={() => {
                setOpen(false);
                switchTo(role, e.id);
              }}
              style={[styles.opt, e.id === m.active[role] && styles.optOn]}
            >
              <Text style={[styles.optText, e.id === m.active[role] && styles.optTextOn]}>
                {e.id === m.active[role] ? "✓ " : ""}
                {entryLabel(role, e)}
              </Text>
              <Text style={styles.optSub}>{shortAddr(entryAddr(e))}</Text>
            </Pressable>
          ))}
          {list.length < MAX_ACCOUNTS ? (
            <Pressable
              testID="acct-add"
              accessibilityRole="menuitem"
              onPress={() => {
                setOpen(false);
                addAccount(role);
              }}
              style={styles.opt}
            >
              <Text style={[styles.optText, { color: colors.green }]}>+ New {roleName(role).toLowerCase()} account</Text>
              <Text style={styles.optSub}>funded by the demo bank</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "relative", zIndex: 40 },
  btn: { minHeight: 44, paddingHorizontal: 10, justifyContent: "center", borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.accent, backgroundColor: colors.card },
  btnText: { fontFamily: fonts.sans, fontSize: 14, fontWeight: "700", color: colors.accent },
  menu: {
    position: "absolute",
    top: 48,
    right: 0,
    width: 250,
    zIndex: 50,
    padding: 6,
    gap: 4,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    boxShadow: "0 6px 24px rgba(0,0,0,0.18)",
  } as never,
  opt: { minHeight: 48, paddingHorizontal: 10, paddingVertical: 6, justifyContent: "center", borderRadius: radius.md },
  optOn: { backgroundColor: colors.softGreen },
  optText: { fontFamily: fonts.sans, fontSize: 15, fontWeight: "600", color: colors.ink },
  optTextOn: { fontWeight: "700" },
  optSub: { fontFamily: fonts.sans, fontSize: 12, color: colors.muted },
});
