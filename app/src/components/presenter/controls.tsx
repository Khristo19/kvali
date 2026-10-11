// Sections of the presenter drawer (presenter mode only, see src/presenter/store.ts).
import { router, type Href } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { shortAddr, useAccount } from "@/account/store";
import { errorMessage } from "@/components/farmer/ui";
import { Button, ErrorText } from "@/components/ui";
import { Pressable } from "@/components/ui/pressable";
import { MAX_ACCOUNTS, addAccount, entryAddr, entryLabel, loadMulti, setSeat, switchTo, useMulti, useSeat, type MultiRole } from "@/devnet/multi";
import { useActions } from "@/engine/actions";
import { SAMPLE_JOB_ID, VALIDATORS, WALLETS, sampleRecords } from "@/engine/scenario";
import { useEngine } from "@/engine/useEngine";
import { colors, radius, space, type } from "@/theme";

const JOB_ID = SAMPLE_JOB_ID;

/** Plays the operator / settlement steps from any page, so one role can be shown alone. */
export function PresenterJobControls() {
  const { engine, state } = useEngine();
  const actions = useActions();
  const farmer = useAccount("farmer");
  const operator = useAccount("operator");
  const job = state.jobs[JOB_ID];
  const [err, setErr] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    try {
      setErr(null);
      await fn();
    } catch (e) {
      setErr(errorMessage(e));
    }
  };
  const records = Object.keys(sampleRecords) as (keyof typeof sampleRecords)[];
  const runRest = () =>
    run(async () => {
      if (!state.jobs[JOB_ID]) await actions.postJob(JOB_ID);
      if (engine.getState().jobs[JOB_ID].state === "Posted") await actions.acceptJob(JOB_ID);
      if (engine.getState().jobs[JOB_ID].state === "Accepted") await actions.submitRecord("honest", JOB_ID);
    });
  const ready = !!farmer && !!operator;

  return (
    <View style={styles.group}>
      {!job ? <Text style={type.small}>No job yet. Post one as the farmer, or run the whole job below.</Text> : null}
      <Button testID="demo-accept" small label="Operator accepts the job" kind="secondary" disabled={!job || job.state !== "Posted"} onPress={() => run(() => actions.acceptJob(JOB_ID))} />
      {records.map((k) => (
        <Button
          testID={`demo-submit-${k}`}
          small
          key={k}
          label={`Operator sends record: ${k}`}
          kind="secondary"
          disabled={!job || job.state !== "Accepted"}
          onPress={() => run(() => actions.submitRecord(k, JOB_ID))}
        />
      ))}
      <Button testID="demo-settle" small label="Settle now" kind="secondary" disabled={!job || job.state !== "ProofSubmitted"} onPress={() => run(() => actions.settle(WALLETS.farmer, JOB_ID))} />
      <Button
        testID="presenter-run-rest"
        small
        label="Run the rest of the job automatically"
        disabled={!ready}
        hint={ready ? undefined : "Sign up as a farmer and as an operator first"}
        onPress={runRest}
      />
      <ErrorText message={err} />
    </View>
  );
}

function RoleAccounts({ role }: { role: MultiRole }) {
  const acct = useAccount(role);
  const m = useMulti();
  if (!acct) return <Text style={type.small}>No {role} account in this browser yet. Sign up on the home page first.</Text>;
  const list = m[role];
  return (
    <View style={styles.group}>
      {list.map((e) => {
        const active = e.id === m.active[role];
        return (
          <Pressable
            key={e.id}
            testID={`acct-option-${e.id}`}
            accessibilityRole="radio"
            accessibilityLabel={entryLabel(role, e)}
            aria-checked={active}
            onPress={() => switchTo(role, e.id)}
            style={[styles.seat, active && styles.seatOn]}
          >
            <View style={styles.seatText}>
              <Text style={[type.body, active && styles.on]}>{entryLabel(role, e)}</Text>
              <Text style={type.small}>{shortAddr(entryAddr(e))}</Text>
            </View>
            <View style={[styles.dot, active && styles.dotOn]} />
          </Pressable>
        );
      })}
      {list.length < MAX_ACCOUNTS ? (
        <Pressable testID={`acct-add-${role}`} accessibilityRole="button" onPress={() => addAccount(role)} style={styles.add}>
          <Text style={[type.body, { color: colors.green, fontWeight: "700" }]}>+ New {role} account</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** "Act as": which farmer / operator account and which validator seat this browser uses. */
export function PresenterAccounts() {
  const farmer = useAccount("farmer");
  const operator = useAccount("operator");
  const seatId = useSeat();
  useEffect(() => {
    loadMulti(); // picks up a wallet that was just created
  }, [farmer, operator]);
  return (
    <View style={styles.group}>
      <Text style={styles.sub}>Farmers</Text>
      <RoleAccounts role="farmer" />
      <Text style={styles.sub}>Operators</Text>
      <RoleAccounts role="operator" />
      <Text style={styles.sub}>Validator seat</Text>
      {VALIDATORS.map((v) => (
        <Pressable
          key={v.id}
          testID={`seat-${v.seat}`}
          accessibilityRole="radio"
          accessibilityLabel={`${v.label}, ${v.seat} seat`}
          aria-checked={v.id === seatId}
          onPress={() => setSeat(v.id)}
          style={[styles.seat, v.id === seatId && styles.seatOn]}
        >
          <Text style={[type.body, styles.seatText, v.id === seatId && styles.on]}>
            {v.label} ({v.seat})
          </Text>
          <View style={[styles.dot, v.id === seatId && styles.dotOn]} />
        </Pressable>
      ))}
    </View>
  );
}

const LINKS: { id: string; label: string; to: string }[] = [
  { id: "home", label: "Home", to: "/" },
  { id: "farmer", label: "Farmer", to: "/farmer" },
  { id: "operator", label: "Operator", to: "/operator" },
  { id: "validator", label: "Validator", to: "/validator" },
  { id: "job", label: "Job story", to: "/job" },
  { id: "how", label: "How it works", to: "/how-it-works" },
];

/** "Jump to": the pages of the app. */
export function PresenterLinks() {
  return (
    <View style={styles.links}>
      {LINKS.map((l) => (
        <Button key={l.id} testID={`presenter-go-${l.id}`} small kind="secondary" label={l.label} onPress={() => router.push(l.to as Href)} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: 8 },
  sub: { ...type.small, fontWeight: "700", color: colors.ink, marginTop: 4 },
  links: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  seat: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.md,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  seatOn: { borderColor: colors.green, borderWidth: 2 },
  seatText: { flex: 1, flexShrink: 1 },
  on: { fontWeight: "700", color: colors.ink },
  dot: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.card },
  dotOn: { borderWidth: 8, borderColor: colors.green },
  add: { minHeight: 44, justifyContent: "center", paddingHorizontal: space.md },
});
