import { StyleSheet, Text, View } from "react-native";

import { clock, lari, litersPerHa, usdc } from "@/components/money";
import { BigNumber, Card, CardTitle, TimelineStep } from "@/components/ui";
import { actorName, describe, moneyLine, payoutRows, relTime } from "./helpers";
import { Row, TxId } from "./ui";
import { VALIDATORS } from "@/engine/scenario";
import type { Config, EventLogEntry, Job } from "@/engine/types";
import { colors, radius, space, type } from "@/theme";

export function Timeline({ entries, base }: { entries: EventLogEntry[]; base: number }) {
  return (
    <Card>
      <CardTitle>What happened</CardTitle>
      <View>
        {entries.map((e, i) => (
          <TimelineStep
            key={e.seq}
            state="done"
            last={i === entries.length - 1}
            title={actorName(e.actor)}
            detail={`${relTime(e.time, base)} · ${describe(e)}`}
          >
            {moneyLine(e).map((m) => (
              <Text key={m} style={styles.money}>{m}</Text>
            ))}
            <TxId tx={e.tx} />
          </TimelineStep>
        ))}
      </View>
    </Card>
  );
}

export function Countdown({ secs, total }: { secs: number; total: number }) {
  return (
    <Card>
      <BigNumber
        caption="Challenge window"
        value={secs > 0 ? clock(secs) : "Window closed"}
        size={secs > 0 ? 40 : 28}
        color={secs > 0 ? colors.ink : colors.green}
        live
      />
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${total > 0 ? Math.min(100, ((total - secs) / total) * 100) : 100}%` }]} />
      </View>
      <Text style={type.body}>
        {secs > 0 ? "The farmer can still dispute the spray result." : "No dispute was raised. Anyone can now settle the job."}
      </Text>
    </Card>
  );
}

export function SprayCheck({ job, config }: { job: Job; config: Config }) {
  const p = job.proof;
  if (!p) return null;
  const tol = (job.targetRateMlPerHa * job.toleranceBps) / 10_000;
  const lo = job.targetRateMlPerHa - tol;
  const hi = job.targetRateMlPerHa + tol;
  const max = job.targetRateMlPerHa * 1.5;
  const pct = (v: number) => `${Math.max(0, Math.min(100, (v / max) * 100))}%` as const;
  const inBand = p.appliedRateMlPerHa >= lo && p.appliedRateMlPerHa <= hi;
  const covOk = p.coverageBps >= config.minCoverageBps;
  return (
    <Card>
      <CardTitle>Spray check</CardTitle>
      <Row left="Applied" right={`${litersPerHa(p.appliedRateMlPerHa)} ${inBand ? "✓" : "✗"}`} bold />
      <View
        style={styles.bar}
        accessible
        accessibilityLabel={`Applied ${litersPerHa(p.appliedRateMlPerHa)}, allowed ${litersPerHa(lo)} to ${litersPerHa(hi)}`}
      >
        <View style={[styles.band, { left: pct(lo), width: `${((hi - lo) / max) * 100}%` }]} />
        <View style={[styles.marker, { left: pct(p.appliedRateMlPerHa), backgroundColor: inBand ? colors.green : colors.accent }]} />
      </View>
      <Text style={styles.small}>
        Allowed band {litersPerHa(lo)} to {litersPerHa(hi)} (target {litersPerHa(job.targetRateMlPerHa)} ± {job.toleranceBps / 100}%)
      </Text>
      <Row
        left="Coverage"
        right={`${(p.coverageBps / 100).toFixed(1)}% (min ${(config.minCoverageBps / 100).toFixed(0)}%) ${covOk ? "✓" : "✗"}`}
      />
      <Text style={[type.subheading, { marginTop: space.sm }]}>Validators who signed</Text>
      {p.signers.map((s) => (
        <Text key={s} style={type.body}>
          ✓ {VALIDATORS.find((v) => v.id === s)?.label ?? s}
        </Text>
      ))}
    </Card>
  );
}

export function MoneyWent({ job }: { job: Job }) {
  const r = payoutRows(job, {
    operator: colors.green,
    kvali: colors.accent,
    validators: "#7A8F5C",
    farmer: "#C98B4B",
    bond: "#9AA597",
  });
  if (!r) return null;
  const ok = r.total === r.expected;
  return (
    <Card>
      <CardTitle>Where the money went</CardTitle>
      <View style={styles.stack} accessibilityLabel="Proportional split of the payment" accessible>
        {r.rows.map((x) => (
          <View key={x.label} style={{ flex: Number(x.value), backgroundColor: x.color }} />
        ))}
      </View>
      {r.rows.map((x) => (
        <View key={x.label} style={styles.legendRow}>
          <View style={[styles.swatch, { backgroundColor: x.color }]} />
          <View style={{ flex: 1 }}>
            <Row left={x.label} right={`${usdc(x.value)} · ${lari(x.value)}`} />
          </View>
        </View>
      ))}
      <Row left="Total" right={`${usdc(r.total)} · ${lari(r.total)}`} bold />
      <Text testID="adds-up" style={[styles.small, { color: ok ? colors.green : colors.accent }]} accessibilityLabel={ok ? "Adds up" : "Does not add up"}>
        {ok
          ? `Adds up ✓  (payment ${usdc(job.amount)} + bonds ${usdc(r.expected - job.amount)})`
          : `Does not add up: expected ${usdc(r.expected)}`}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  money: { fontSize: 15, color: colors.green, fontWeight: "600" },
  track: { height: 10, borderRadius: 5, backgroundColor: colors.border, overflow: "hidden" },
  fill: { height: 10, backgroundColor: colors.green },
  bar: { height: 22, borderRadius: radius.sm, backgroundColor: colors.border, overflow: "hidden", position: "relative" },
  band: { position: "absolute", top: 0, bottom: 0, backgroundColor: "#A9C4AE" },
  marker: { position: "absolute", top: 0, bottom: 0, width: 4, marginLeft: -2 },
  small: { fontSize: 15, lineHeight: 21, color: colors.muted, flexShrink: 1 },
  stack: { flexDirection: "row", height: 20, borderRadius: radius.sm, overflow: "hidden" },
  legendRow: { flexDirection: "row", alignItems: "flex-start", gap: space.sm },
  swatch: { width: 12, height: 12, borderRadius: 3, marginTop: 6 },
});
