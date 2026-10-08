import { StyleSheet, Text, View } from "react-native";

import { computeVerdict } from "@kvali/proof/verdict";

import { Button, Card, CardTitle, StatusChip } from "@/components/ui";
import { hectares } from "@/components/money";
import { recordFor } from "@/engine/scenario";
import type { sampleRecords } from "@/engine/samples";
import type { Job, Validator } from "@/engine/types";
import { colors, space, type } from "@/theme";
import { useState } from "react";
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
}: {
  job: Job;
  sampleKey: SampleKey;
  seat: Validator;
  validators: Validator[];
  signed: string[];
  refusal: string | undefined;
  onSign: () => void;
  onRefuse: (reason: string) => void;
}) {
  const r = recordFor(sampleKey, job.areaCha);
  const v = fullVerdict(job, sampleKey);
  const failing = v.checks.filter((c) => !c.pass);
  const reason = failing.map((c) => `${c.name}: ${c.detail}`).join("; ");
  const mine = signed.includes(seat.id);
  const names = signed.map((id) => validators.find((x) => x.id === id)?.seat ?? id);

  const [flight, setFlight] = useState(false);
  const total = v.checks.length;
  const passed = v.checks.filter((c) => c.pass).length;
  return (
    <Card>
      <View style={styles.head}>
        <View style={{ flex: 1, flexShrink: 1, minWidth: 0 }}>
          <CardTitle>Record: {r.sample}</CardTitle>
          <Text style={type.body}>
            {(r.litersMl / 1000).toFixed(1)} L sprayed over {hectares(r.areaCoveredCha)} (job {hectares(job.areaCha)})
          </Text>
        </View>
        <StatusChip label={v.pass ? "Sign" : "Refuse"} tone={v.pass ? "green" : "red"} />
      </View>
      <View style={styles.checkHead}>
        <Text style={type.subheading}>Checklist</Text>
        <Text style={[type.subheading, { color: colors.green }]}>
          {passed} / {total}
        </Text>
      </View>
      <CheckList checks={v.checks} />
      <Button small kind="secondary" label={flight ? "Hide flight vs field" : "See flight vs field"} onPress={() => setFlight(!flight)} />
      {flight ? <FlightCard job={job} sampleKey={sampleKey} /> : null}
      <Text accessibilityLabel={`Recommendation: ${v.pass ? "Sign" : "Refuse"}`} style={[type.subheading, { color: v.pass ? colors.green : colors.error }]}>
        Recommend: {v.pass ? "SIGN" : "REFUSE"}
      </Text>
      {!v.pass && <Text style={type.body}>Do not sign: {failing.map((c) => c.name).join(", ")} failed.</Text>}
      <Text style={type.small}>2 of 3 signatures needed. Signed: {signed.length} of 3{names.length ? ` (${names.join(", ")})` : ""}</Text>
      {refusal && <Text style={[type.body, { color: colors.error }]}>Refusal recorded ({seat.seat} seat): {refusal}</Text>}
      <View style={styles.actions}>
        <Button
          label={mine ? "Signed by this seat" : "Approve — proof is good"}
          disabled={mine || !v.pass}
          hint={!v.pass ? "Disabled because the full verdict fails" : undefined}
          onPress={onSign}
        />
        <Button label="Refuse and give a reason" kind="danger" onPress={() => onRefuse(v.pass ? "refused by validator (verdict passes)" : reason)} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: space.md },
  checkHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  actions: { gap: space.md },
});
