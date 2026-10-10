import { router, useLocalSearchParams, type Href } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { Pressable } from "@/components/ui/pressable";
import { SafeAreaView } from "react-native-safe-area-context";

import { SettlementDemo } from "@/components/settlement-demo";
import { Button, Icon } from "@/components/ui";
import { addressFor, roleHome, roleLabel, saveAccount, shortAddr, signOut, useAccount, useAccounts } from "@/account/store";
import { notify } from "@/components/ui/notice";
import { hasBurner } from "@/devnet/keys";
import { ensureWallet } from "@/devnet/provision";
import { getDevnetState, setDevnetState, useMode } from "@/devnet/mode";
import { colors, fonts, radius, space, type } from "@/theme";

type RoleId = "farmer" | "operator" | "validator";

const roles: { id: RoleId; title: string; desc: string; href: Href; glyph: string }[] = [
  { id: "farmer", title: "Farmer", desc: "I need my field sprayed", href: "/farmer", glyph: "⌂" },
  { id: "operator", title: "Drone operator", desc: "I spray fields with my drone", href: "/operator", glyph: "✢" },
  { id: "validator", title: "Validator", desc: "I am an agronomist who checks proof", href: "/validator", glyph: "✓" },
];

export default function Home() {
  const mode = useMode();
  const { role: roleParam } = useLocalSearchParams<{ role?: string }>();
  const [picked, setPicked] = useState<RoleId>(roleParam === "operator" || roleParam === "validator" ? roleParam : "farmer");
  const account = useAccount(picked); // each role has its own demo account
  const anyAccount = useAccount();
  const all = useAccounts();
  const accountList = (['farmer', 'operator', 'validator'] as const).map((r) => all[r]).filter((a): a is NonNullable<typeof a> => !!a);
  const [form, setForm] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [phantom, setPhantom] = useState(false);
  const role = roles.find((r) => r.id === picked)!;

  const openForm = () => {
    setErr(null);
    setPhantom(false);
    const prefill = account ?? anyAccount;
    if (prefill) {
      setName((n) => n || prefill.name);
      setEmail((m) => m || prefill.email);
    }
    setForm(true);
  };
  const create = () => {
    const n = name.trim();
    const m = email.trim();
    if (n.length < 2) return setErr("Please enter your name.");
    if (!/^\S+@\S+\.\S+$/.test(m)) return setErr("Please enter a valid email address, like name@example.com.");
    const freshWallet = picked !== "validator" && !hasBurner(picked);
    saveAccount({ name: n, email: m, role: picked });
    if (picked !== "validator" && getDevnetState().mode === "devnet" && freshWallet) setDevnetState({ walletNote: "Setting up your own devnet wallet: funding it with test SOL and test USDC...", walletOk: false });
    // The browser makes its own devnet wallet for this role and the public demo bank funds it (farmer, operator).
    if ((picked === "farmer" || picked === "operator") && getDevnetState().mode === "devnet") {
      void ensureWallet(picked).catch((e: Error) => notify("error", e.message));
    }
    router.replace(role.href);
  };

  return (
    <SafeAreaView style={styles.top} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={styles.content}>
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
                  testID={`role-${r.id}`}
                  accessibilityRole="radio"
                  aria-checked={on}
                  accessibilityLabel={`${r.title}. ${r.desc}`}
                  onPress={() => {
                    setPicked(r.id);
                    setErr(null);
                  }}
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

          {form ? (
            <View testID="signup-form" style={styles.form} accessibilityLabel="Create demo account">
              <Text style={styles.who}>Create your demo account</Text>
              <Text style={type.small}>
                Role: {role.title}. Saved only in this browser, no password. {picked === "validator" ? "Validators use the public demo validator keys." : "A devnet wallet with test money is created in this browser for you."}
              </Text>
              <Text style={type.label}>Your name</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="e.g. George"
                autoComplete="name"
                accessibilityLabel="Your name"
                testID="signup-name"
                style={styles.input}
              />
              <Text style={type.label}>Email</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="name@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                accessibilityLabel="Email"
                testID="signup-email"
                onSubmitEditing={create}
                style={styles.input}
              />
              {err ? (
                <Text style={[type.body, { color: colors.error }]} accessibilityRole="alert">
                  {err}
                </Text>
              ) : null}
              <Button testID="signup-submit" label={`Create account and open ${role.title.toLowerCase()} page`} onPress={create} />
              <Button testID="signup-cancel" label="Cancel" kind="secondary" small onPress={() => setForm(false)} />
            </View>
          ) : (
            <View style={styles.actions}>
              <Button testID="continue-email" label="Continue with email" onPress={openForm} />
              <Button
                testID="connect-phantom"
                label={phantom ? "Phantom: coming soon" : "Connect Phantom"}
                kind="secondary"
                disabled={phantom}
                onPress={() => setPhantom(true)}
              />
              <View style={styles.slot}>
                {phantom ? (
                  <View testID="phantom-soon" style={styles.soonBox} accessibilityRole="alert">
                    <Text style={[type.body, styles.soon]}>
                      Coming soon: Phantom wallet sign-in is not available yet. Please use &ldquo;Continue with email&rdquo;; it creates a demo wallet on Solana devnet for you.
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.footnote}>A demo account is created for you in this browser. No crypto knowledge needed.</Text>
                )}
              </View>
            </View>
          )}

          <View style={styles.links}>
            <Pressable testID="link-how-it-works" accessibilityRole="link" onPress={() => router.push("/how-it-works")} style={styles.link}>
              <Text style={styles.linkText}>How it works</Text>
            </Pressable>
            <Pressable testID="link-job-story" accessibilityRole="link" onPress={() => router.push("/job")} style={styles.link}>
              <Text style={styles.linkText}>Job story</Text>
            </Pressable>
          </View>

          {accountList.length > 0 ? (
            <View testID="signed-in-box" style={styles.signedIn}>
              <Text style={type.body}>
                Signed in as: {accountList.map((a) => `${roleLabel(a.role)} ${a.name}`).join(" · ")}
              </Text>
              {account ? (
                <>
                  <Text style={type.small}>
                    {roleLabel(account.role)}: {account.name}, address {shortAddr(addressFor(account.role))}
                  </Text>
                  <Button testID="open-my-page" label={`Open my ${roleLabel(account.role).toLowerCase()} page`} kind="secondary" small onPress={() => router.replace(roleHome(account.role) as Href)} />
                  <Button testID="signout-all" label="Sign out (all roles)" kind="secondary" small onPress={() => signOut()} />
                </>
              ) : (
                <Text style={type.small}>Not signed in as {roleLabel(picked)} yet: continue with email below.</Text>
              )}
            </View>
          ) : null}

          <SettlementDemo />

          <Text style={[type.small, { textAlign: "center" }]}>{mode === "devnet" ? "Running on Solana devnet (test money)" : "Simulated mode (no chain)"}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  top: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingTop: 48, paddingBottom: 28, alignItems: "center" },
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
  signedIn: { gap: space.sm, padding: 14, borderRadius: radius.lg, backgroundColor: colors.softGreen },
  form: { gap: space.sm, padding: 16, borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  input: { minHeight: 52, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, fontSize: 17, fontFamily: fonts.sans, color: colors.ink, backgroundColor: colors.background },
  slot: { minHeight: 110, justifyContent: "center" },
  soonBox: { padding: 14, borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.accent },
  soon: { textAlign: "center", color: colors.accent, fontWeight: "600" },
  footnote: { ...type.small, fontSize: 16, textAlign: "center", marginTop: 6 },
  links: { flexDirection: "row", justifyContent: "center", gap: space.lg },
  link: { minHeight: 44, justifyContent: "center", paddingHorizontal: 14 },
  linkText: { ...type.body, fontWeight: "600", color: colors.green, textDecorationLine: "underline" },
});
