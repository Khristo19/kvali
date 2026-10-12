import { router, useLocalSearchParams, type Href } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { Pressable } from "@/components/ui/pressable";
import { SafeAreaView } from "react-native-safe-area-context";

import { SettlementDemo } from "@/components/settlement-demo";
import { Button, Icon } from "@/components/ui";
import { privyLogout, privyOn, privyReady } from "@/auth/privy";
import { addressFor, roleHome, roleLabel, saveAccount, shortAddr, signOut, useAccount, useAccounts } from "@/account/store";
import { notify } from "@/components/ui/notice";
import { hasBurner } from "@/devnet/keys";
import { ensureWallet } from "@/devnet/provision";
import { getDevnetState, setDevnetState } from "@/devnet/mode";
import { colors, fonts, radius, space, type } from "@/theme";

type RoleId = "farmer" | "operator" | "validator";

const roles: { id: RoleId; title: string; desc: string; href: Href; glyph: string }[] = [
  { id: "farmer", title: "Farmer", desc: "I need my field sprayed", href: "/farmer", glyph: "⌂" },
  { id: "operator", title: "Drone operator", desc: "I spray fields with my drone", href: "/operator", glyph: "✢" },
  { id: "validator", title: "Validator", desc: "I am an agronomist who checks proof", href: "/validator", glyph: "✓" },
];

export default function Home() {
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
  // Email code step (only when Privy is on): "details" = name + email, "code" = the 6-digit code from the email.
  const [step, setStep] = useState<"details" | "code">("details");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const role = roles.find((r) => r.id === picked)!;

  const openForm = () => {
    setErr(null);
    setPhantom(false);
    setStep("details");
    setCode("");
    setNote(null);
    const prefill = account ?? anyAccount;
    if (prefill) {
      setName((n) => n || prefill.name);
      setEmail((m) => m || prefill.email);
    }
    setForm(true);
  };
  const checkDetails = () => {
    const problem =
      name.trim().length < 2 ? "Please enter your name." : !/^\S+@\S+\.\S+$/.test(email.trim()) ? "Please enter a valid email address, like name@example.com." : null;
    if (problem) setErr(problem);
    return !problem;
  };
  const create = (verified?: boolean) => {
    if (!checkDetails()) return;
    const n = name.trim();
    const m = email.trim();
    const freshWallet = picked !== "validator" && !hasBurner(picked);
    saveAccount({ name: n, email: m, role: picked, ...(verified ? { verified: true } : {}) });
    if (picked !== "validator" && getDevnetState().mode === "devnet" && freshWallet) setDevnetState({ walletNote: "Setting up your wallet…", walletOk: false });
    // The browser makes its own devnet wallet for this role and the public demo bank funds it (farmer, operator).
    if ((picked === "farmer" || picked === "operator") && getDevnetState().mode === "devnet") {
      void ensureWallet(picked).catch((e: Error) => notify("error", e.message));
    }
    router.replace(role.href);
  };
  // Privy on: the first press sends the code, the second checks it; only then is the account created (same path as above).
  const sendCode = async () => {
    setErr(null);
    setBusy("Sending code…");
    try {
      const auth = await privyReady();
      const m = email.trim().toLowerCase();
      if (auth.authenticated && auth.email?.toLowerCase() === m) {
        setNote("Email already verified");
        return create(true);
      }
      if (auth.authenticated) await auth.logout(); // signed in to Privy with another email
      await auth.sendCode(email.trim());
      setCode("");
      setStep("code");
    } catch {
      setErr("Could not send the code. Check the email address and try again.");
    } finally {
      setBusy(null);
    }
  };
  const verify = async () => {
    const c = code.trim();
    if (!/^\d{6}$/.test(c)) return setErr("Please enter the 6-digit code from the email.");
    setErr(null);
    setBusy("Checking code…");
    try {
      const auth = await privyReady();
      await auth.loginWithCode(c);
    } catch {
      setBusy(null);
      return setErr("That code did not work. Check it, or tap Resend code for a new one.");
    }
    setBusy(null);
    create(true);
  };
  const submit = () => {
    if (busy) return;
    if (!privyOn) return create();
    if (!checkDetails()) return;
    void (step === "code" ? verify() : sendCode());
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
            <View testID="signup-form" style={styles.form} accessibilityLabel="Create account">
              <Text style={styles.who}>Create your account</Text>
              <Text style={type.small}>
                Role: {role.title}. {privyOn ? "We email you a code to confirm it's you. No password." : "Saved only in this browser, no password."} {picked === "validator" ? "Validators use the shared checker seats." : "A wallet is created in this browser for you."}
              </Text>
              <Text style={type.label}>Your name</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="e.g. George"
                autoComplete="name"
                editable={step === "details"}
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
                editable={step === "details"}
                onSubmitEditing={submit}
                style={styles.input}
              />
              {step === "code" ? (
                <>
                  <Text testID="signup-code-sent" style={type.small}>
                    We sent a 6-digit code to {email.trim()}. Check your inbox.
                  </Text>
                  <Text style={type.label}>Code from the email</Text>
                  <TextInput
                    value={code}
                    onChangeText={(t) => setCode(t.replace(/\D/g, "").slice(0, 6))}
                    placeholder="123456"
                    keyboardType="number-pad"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    textContentType="oneTimeCode"
                    maxLength={6}
                    accessibilityLabel="Code from the email"
                    testID="signup-code"
                    onSubmitEditing={submit}
                    style={styles.input}
                  />
                  <View style={styles.codeLinks}>
                    <Pressable testID="signup-resend" accessibilityRole="button" disabled={!!busy} onPress={() => void sendCode()} style={styles.link}>
                      <Text style={styles.linkText}>Resend code</Text>
                    </Pressable>
                    <Pressable
                      testID="signup-change-email"
                      accessibilityRole="button"
                      onPress={() => {
                        setStep("details");
                        setCode("");
                        setErr(null);
                      }}
                      style={styles.link}
                    >
                      <Text style={styles.linkText}>Use a different email</Text>
                    </Pressable>
                  </View>
                </>
              ) : null}
              {note ? (
                <Text testID="signup-note" style={[type.body, { color: colors.green }]}>
                  ✓ {note}
                </Text>
              ) : null}
              {err ? (
                <Text style={[type.body, { color: colors.error }]} accessibilityRole="alert">
                  {err}
                </Text>
              ) : null}
              <Button
                testID="signup-submit"
                label={
                  !privyOn ? `Create account and open ${role.title.toLowerCase()} page` : busy ?? (step === "code" ? "Verify and create account" : "Send code")
                }
                disabled={!!busy}
                onPress={submit}
              />
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
                      Coming soon: Phantom wallet sign-in is not available yet. Please use &ldquo;Continue with email&rdquo;; it creates a wallet for you.
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.footnote}>An account and wallet are created for you in this browser. No crypto knowledge needed.</Text>
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
                  <Button
                    testID="signout-all"
                    label="Sign out (all roles)"
                    kind="secondary"
                    small
                    onPress={() => {
                      signOut();
                      void privyLogout();
                    }}
                  />
                </>
              ) : (
                <Text style={type.small}>Not signed in as {roleLabel(picked)} yet: continue with email below.</Text>
              )}
            </View>
          ) : null}

          <SettlementDemo />

          <Text testID="honesty-line" style={[type.small, { textAlign: "center" }]}>Runs on Solana&apos;s test network with test money.</Text>
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
  codeLinks: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  link: { minHeight: 44, justifyContent: "center", paddingHorizontal: 14 },
  linkText: { ...type.body, fontWeight: "600", color: colors.green, textDecorationLine: "underline" },
});
