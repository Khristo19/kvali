import { StyleSheet, Text, View , TextInput } from "react-native";

import { computeVerdict } from "@kvali/proof/verdict";

import { Button, Card, CardTitle } from "@/components/ui";
import { hectares } from "@/components/money";
import { recordFor } from "@/engine/scenario";
import type { sampleRecords } from "@/engine/samples";
import type { Job, Validator } from "@/engine/types";
import { colors, space, type } from "@/theme";
import { useState } from "react";
import { recordTitle } from "@/components/records";
import { CheckList } from "./check-list";
import { FlightCard } from "./flight-card";

export type SampleKey = keyof typeof sampleRecords;
export { recordFor };

/** Tank readings from the sample manifest, if present. */
function tankOf(raw: any) {
  const t = raw?.tank;
  if (!t) return {};
  return { tankKgBefore: t.kg_before, tankKgAfter: t.kg_after, mixDensityKgPerL: t.mix_density_kg_per_l };
}

/** The FULL verdict (coverage + rate + flow-meter vs tank cross-check). */
export function fullVerdict(job: Job, key: SampleKey) {
  const r = recordFor(key, job.areaCha);
  return computeVerdict(
    { areaCha: job.areaCha, targetRateMlPerHa: job.targetRateMlPerHa, toleranceBps: job.toleranceBps },
    { litersMl: r.litersMl, areaCoveredCha: r.areaCoveredCha, ...tankOf(r.raw) },
  );
}

export function ProofCard({
  job,
  sampleKey,
  seat,
  validators,
  signed,
  refusal,
  onSign,
  onRefuse,
  locked,
}: {
  job: Job;
  sampleKey: SampleKey;
  seat: Validator;
  validators: Validator[];
  signed: string[];
  refusal: string | undefined;
  onSign: () => void;
  onRefuse: (reason: string) => void;
  /** Why the buttons are disabled (signed out). */
  locked?: string;
}) {
  const r = recordFor(sampleKey, job.areaCha);
  const v = fullVerdict(job, sampleKey);
  const failing = v.checks.filter((c) => !c.pass);
  const reason = failing.map((c) => `${c.name}: ${c.detail}`).join("; ");
  const mine = signed.includes(seat.id);
  const names = signed.map((id) => validators.find((x) => x.id === id)?.seat ?? id);

  const [flight, setFlight] = useState(false);
  const [asking, setAsking] = useState(false);
  const [text, setText] = useState("");
  const total = v.checks.length;
  const passed = v.checks.filter((c) => c.pass).length;
  return (
    <Card>
      <View style={styles.head}>
        <View style={{ flex: 1, flexShrink: 1, minWidth: 0 }}>
          <CardTitle>Record: {recordTitle(sampleKey)}</CardTitle>
          <Text style={type.body}>
            {(r.litersMl / 1000).toFixed(1)} L sprayed over {hectares(r.areaCoveredCha)} (job {hectares(job.areaCha)})
          </Text>
        </View>
        <Text style={[type.small, { color: v.pass ? colors.green : colors.error, fontWeight: "700", flexShrink: 0 }]}>{v.pass ? "Checks pass" : "Checks fail"}</Text>
      </View>
      <View style={styles.checkHead}>
        <Text style={type.subheading}>Checklist</Text>
        <Text style={[type.subheading, { color: colors.green }]}>
          {passed} / {total}
        </Text>
      </View>
      <CheckList checks={v.checks} />
      <Button testID="flight-toggle" small kind="secondary" label={flight ? "Hide flight vs field" : "See flight vs field"} onPress={() => setFlight(!flight)} />
      {flight ? <FlightCard job={job} sampleKey={sampleKey} /> : null}
      <Text accessibilityLabel={`Recommendation: ${v.pass ? "Sign" : "Refuse"}`} style={[type.subheading, { color: v.pass ? colors.green : colors.error }]}>
        Recommend: {v.pass ? "SIGN" : "REFUSE"}
      </Text>
      {!v.pass && <Text style={type.body}>Do not sign: {failing.map((c) => c.name).join(", ")} failed.</Text>}
      <Text style={type.small}>2 of 3 signatures needed. Signed: {signed.length} of 3{names.length ? ` (${names.join(", ")})` : ""}</Text>
      {refusal && <Text testID="refusal-text" style={[type.body, { color: colors.error }]}>Refusal recorded ({seat.seat} seat): {refusal}</Text>}
      {locked ? <Text style={[type.body, { color: colors.accent, fontWeight: "600" }]}>{locked}</Text> : null}
      <View style={styles.actions}>
        <Button
          testID="approve"
          label={mine ? "Signed by this seat" : "Approve — proof is good"}
          disabled={mine || !v.pass || !!locked}
          hint={locked ?? (!v.pass ? "Disabled because the full verdict fails" : undefined)}
          onPress={onSign}
        />
        {asking ? (
          <View style={styles.reasonBox}>
            <Text style={type.subheading}>Why do you refuse?</Text>
            <View style={styles.picks}>
              {QUICK_REASONS.map((q) => (
                <Button testID="refuse-quick" small key={q} kind={text === q ? "primary" : "secondary"} label={q} onPress={() => setText(q)} />
              ))}
            </View>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Write the reason (a few words)"
              accessibilityLabel="Reason for refusing"
              testID="refuse-reason"
              style={styles.input}
            />
            {!v.pass ? <Text style={type.small}>The checklist says: {reason}</Text> : null}
            <Button
              testID="refuse-send"
              label="Send refusal"
              kind="danger"
              disabled={text.trim().length < 3}
              onPress={() => {
                onRefuse(v.pass ? `Reason: ${text.trim()}` : `Auto-check: ${failing.map((c) => c.name).join(", ")} failed · Reason: ${text.trim()}`);
                setAsking(false);
                setText("");
              }}
            />
            <Button small kind="secondary" label="Cancel" onPress={() => setAsking(false)} />
          </View>
        ) : (
          <Button
            testID="refuse-open"
            label="Refuse and give a reason"
            kind="danger"
            disabled={!!locked}
            onPress={() => {
              setText("");
              setAsking(true);
            }}
          />
        )}
      </View>
    </Card>
  );
}

const QUICK_REASONS = ["Spray rate out of range", "Field not fully covered", "Pump was off", "Tank weights do not match the meter"];

const styles = StyleSheet.create({
  reasonBox: { gap: space.sm, padding: space.md, borderRadius: 12, borderWidth: 1, borderColor: colors.error },
  picks: { gap: space.sm },
  input: { minHeight: 48, borderWidth: 1.5, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12, fontSize: 16, color: colors.ink, backgroundColor: colors.background },
  head: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: space.md },
  checkHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  actions: { gap: space.md },
});
