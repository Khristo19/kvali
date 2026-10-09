import { StyleSheet, Text, View } from "react-native";

import { Button, Card, CardTitle } from "@/components/ui";
import { hectares } from "@/components/money";
import { fullVerdict, type SampleKey } from "@/engine/bots";
import { recordFor } from "@/engine/scenario";
import type { Job } from "@/engine/types";
import { colors, type } from "@/theme";
import { Suspense, lazy, useState } from "react";
import { recordTitle } from "@/components/records";
import { CheckList } from "./check-list";
import { Deferred, Skeleton, useAfterPaint } from "@/components/deferred";

// The map and satellite pictures are the heaviest part of the page: load their code lazily and mount them one frame after the card.
const FlightCard = lazy(() => import("./flight-card").then((m) => ({ default: m.FlightCard })));
const FLIGHT_H = 640;

export type { SampleKey };
export { recordFor, fullVerdict };

type ProofCardProps = {
  job: Job;
  sampleKey: SampleKey;
  /** Short note under the checklist (what the bots did with this record). */
  note?: string;
};

/** Spot-check view of one record: checklist and flight-vs-field map. Read-only: the bots already ran the arithmetic. */
export function ProofCard(props: ProofCardProps) {
  const ok = useAfterPaint();
  return ok ? <ProofCardBody {...props} /> : <Skeleton height={460} testID="proof-skeleton" />;
}

function ProofCardBody({ job, sampleKey, note }: ProofCardProps) {
  const r = recordFor(sampleKey, job.areaCha);
  const v = fullVerdict(job, sampleKey);
  const [flight, setFlight] = useState(false);
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
      {flight ? (
        <Deferred height={FLIGHT_H}>
          <Suspense fallback={<Skeleton height={FLIGHT_H} />}>
            <FlightCard job={job} sampleKey={sampleKey} />
          </Suspense>
        </Deferred>
      ) : null}
      {note ? <Text style={type.small}>{note}</Text> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  checkHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
});
