import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { hectares, lari, litersPerHa, usdc } from "@/components/money";
import {
  Banner,
  BigNumber,
  Button,
  Card,
  CardTitle,
  Divider,
  Fact,
  FactGrid,
  Row,
  StatusChip,
  useTick,
} from "@/components/ui";
import { windowLeft } from "@/engine/engine";
import { useActions } from "@/engine/actions";
import { useEngine } from "@/engine/useEngine";
import { EngineError, type Job } from "@/engine/types";
import { DRONE, SAMPLE_JOB_ID, WALLETS, sampleJob, recordFor, sampleRecords } from "@/engine/scenario";
import { colors, space, type } from "@/theme";

const date = (secs: number) => new Date(secs * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const dayMonth = (secs: number) => new Date(secs * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const both = (a: bigint) => `${usdc(a)} (${lari(a)})`;

export function Wallet() {
  const { engine } = useEngine();
  const b = engine.balance(WALLETS.operator);
  return (
    <Card>
      <Text style={type.label}>Your wallet</Text>
      <View accessible accessibilityLabel={`Wallet balance ${usdc(b)}`}>
        <BigNumber value={usdc(b)} sub={`${lari(b)} · operator`} />
      </View>
    </Card>
  );
}

/** One-line certificate status, as in the mockup. */
export function CertificateStrip() {
  const { state } = useEngine();
  const c = state.certificates[`${WALLETS.operator}:${DRONE.hash}`];
  const ok = !!c && !c.revoked;
  return (
    <View style={styles.strip}>
      <View style={[styles.stripDot, { backgroundColor: ok ? colors.green : colors.error }]} />
      <Text style={[type.body, { flex: 1, flexShrink: 1 }]}>
        {c ? (
          <>
            <Text style={styles.strong}>{c.droneModel}</Text> · certificate {c.revoked ? "revoked" : `valid until ${date(c.validUntil)}`}
          </>
        ) : (
          "No drone certificate found. You cannot accept jobs."
        )}
      </Text>
    </View>
  );
}

export function CertificateCard() {
  const { state } = useEngine();
  const c = state.certificates[`${WALLETS.operator}:${DRONE.hash}`];
  const limit = state.config.maxMeterErrorBps;
  return (
    <Card>
      <CardTitle>Your drone certificate</CardTitle>
      {!c ? (
        <Banner tone="error" text="No certificate found for this drone. You cannot accept jobs." />
      ) : (
        <>
          <Row label="Drone" value={c.droneModel} />
          <Row label="Meter error" value={`${(c.meterErrorBps / 100).toFixed(1)}% (limit ${limit / 100}%) ${c.meterErrorBps <= limit ? "OK" : "TOO HIGH"}`} />
          <Row label="Operator test" value={c.operatorPassed ? "Passed" : "Not passed"} />
          <Row label="Valid until" value={date(c.validUntil)} />
          <Row label="Issued by" value={state.config.validators.find((v) => v.id === c.issuedBy)?.label ?? c.issuedBy} />
          <Row label="Status" value={c.revoked ? "Revoked" : "Active"} />
        </>
      )}
      <Text style={type.body}>Kvali-standard calibration test; any certified test field can issue it.</Text>
    </Card>
  );
}

function plainError(e: unknown): string {
  if (e instanceof EngineError) {
    const rules: Record<string, string> = {
      coverage: "The program refuses this record: the drone covered too little of the field (needs at least 95%).",
      rate: "The program refuses this record: the spray rate is outside the allowed range for this job (too little or too much per hectare).",
      "validator-threshold": "The program refuses this record: not enough validators co-signed it.",
      "bond-too-small": "The bond must be at least the job amount.",
      "insufficient-funds": "Your wallet does not have enough money to lock this bond.",
      "operator-busy": "You already hold an active job. Finish it first.",
      "certificate-expired": "Your drone certificate has expired.",
      "certificate-revoked": "Your drone certificate was revoked.",
      "certificate-failed": "Your certificate does not meet the calibration standard.",
      "no-certificate": "No valid certificate for this operator and drone.",
      "past-deadline": "The spray deadline for this job has passed.",
    };
    return rules[e.code] ?? `The program refused this step (${e.code}): ${e.message}`;
  }
  if (e instanceof Error && e.name === "ChainError") return e.message;
  return "Something went wrong. Try again.";
}

/** "Vineyard + hazelnut" from the long sample crop text. */
function cropName(): string {
  const raw = sampleJob.raw as { crop?: string };
  const c = (raw.crop ?? "Field").split("(")[0].trim();
  return c.charAt(0).toUpperCase() + c.slice(1);
}

function jobCard(j: Job, feeBps: bigint, onAccept: () => void) {
  const raw = sampleJob.raw as { region?: string; product?: { label?: string } };
  const sample = j.id === SAMPLE_JOB_ID;
  const title = `${sample ? cropName() : `Job #${j.id}`} · ${hectares(j.areaCha).replace(".00", "")}`;
  const place = sample && raw.region ? raw.region.split(",")[0] : "Georgia";
  const product = sample ? (raw.product?.label ?? "").split("(")[0].trim() || "Spray product" : "Spray product";
  const receive = j.amount - (j.amount * feeBps) / 10_000n;
  return (
    <Card key={j.id}>
      <View style={styles.cardHead}>
        <View style={{ flex: 1, flexShrink: 1, minWidth: 0 }}>
          <Text style={styles.jobTitle}>{title}</Text>
          <Text style={type.small}>{place} · job #{j.id}</Text>
        </View>
        <StatusChip label="New" tone="green" />
      </View>
      <BigNumber value={usdc(j.amount)} size={30} sub={`${lari(j.amount)} · you receive ${usdc(receive)} after fee`} />
      <Divider />
      <FactGrid>
        <Fact label="Product" value={product} />
        <Fact label="Rate" value={litersPerHa(j.targetRateMlPerHa)} />
        <Fact label="Spray by" value={dayMonth(j.sprayDeadline)} />
        <Fact label="Area" value={hectares(j.areaCha)} />
      </FactGrid>
      <Text style={type.body}>You lock {usdc(j.amount)} as a bond; you get it back when the job is approved.</Text>
      <Button label={`Accept job ${j.id} and lock ${usdc(j.amount)} bond`} onPress={onAccept} />
    </Card>
  );
}

export function OpenJobs({ onError, onDone }: { onError: (m: string | null) => void; onDone: () => void }) {
  const { state } = useEngine();
  const actions = useActions();
  const jobs = Object.values(state.jobs).filter((j) => j.state === "Posted");
  const feeBps = state.config.kvaliFeeBps + state.config.validatorFeeBps;
  const accept = async (j: Job) => {
    try {
      await actions.acceptJob(j.id);
      onError(null);
      onDone();
    } catch (e) {
      onError(plainError(e));
    }
  };
  if (jobs.length === 0) {
    return (
      <Card>
        <CardTitle>Jobs near you</CardTitle>
        <Text style={type.body}>No open jobs. (Post one from the Farmer screen.)</Text>
      </Card>
    );
  }
  return <>{jobs.map((j) => jobCard(j, feeBps, () => accept(j)))}</>;
}

export function useOpenJobsText(): string {
  const { state } = useEngine();
  const n = Object.values(state.jobs).filter((j) => j.state === "Posted").length;
  return `${n} open ${n === 1 ? "job" : "jobs"} near you`;
}

const SAMPLE_INFO: { key: keyof typeof sampleRecords; title: string; desc: string }[] = [
  { key: "honest", title: "Honest flight", desc: "Whole field sprayed at the right rate; flow meter matches the tank weights." },
  { key: "pumpOff", title: "Pump off", desc: "Drone flew the field but the pump was off: almost no liquid sprayed." },
  { key: "halfField", title: "Half field", desc: "Only about half of the field was flown." },
  { key: "tankMismatch", title: "Tank mismatch", desc: "Flow meter says the full amount, but the tank weights show far less left the tank. (The simulated program only checks rate and coverage; the tank cross-check is a validator job.)" },
];

export function UploadRecord({ job, onError }: { job: Job; onError: (m: string | null) => void }) {
  const actions = useActions();
  const [key, setKey] = useState<keyof typeof sampleRecords>("honest");
  const r = recordFor(key, job.areaCha);
  const rate = job.areaCha > 0 ? Math.round(r.litersMl / (job.areaCha / 100)) : 0;
  const cov = Math.round((r.areaCoveredCha / job.areaCha) * 100);
  const submit = async () => {
    try {
      await actions.submitRecord(key, job.id);
      onError(null);
    } catch (e) {
      onError(plainError(e));
    }
  };
  return (
    <Card>
      <CardTitle>Upload spray record</CardTitle>
      <Text style={type.body}>Job #{job.id}. Pick a sample record from the drone (simulated).</Text>
      {SAMPLE_INFO.map((s) => (
        <Button small key={s.key} kind={s.key === key ? "primary" : "secondary"} label={s.title + (s.key === key ? " (selected)" : "")} onPress={() => setKey(s.key)} />
      ))}
      <Text style={type.body}>{SAMPLE_INFO.find((s) => s.key === key)?.desc}</Text>
      <Row label="Liquid sprayed" value={`${(r.litersMl / 1000).toFixed(1)} L`} />
      <Row label="Area covered" value={`${hectares(r.areaCoveredCha)} (${cov}% of field)`} />
      <Row label="Rate" value={`${litersPerHa(rate * 1)} (target ${litersPerHa(job.targetRateMlPerHa)})`} />
      <Text style={type.body}>
        In the demo, validator co-signatures are applied automatically here; the Validator screen shows the checking.
      </Text>
      <Button label="Submit spray record" onPress={submit} />
    </Card>
  );
}

function fmtSecs(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function Verdict({ job }: { job: Job }) {
  const { state } = useEngine();
  const actions = useActions();
  const now = useTick();
  const op = state.operators[WALLETS.operator];
  const p = job.proof;
  const received = state.log
    .filter((l) => l.jobId === job.id && (l.action === "settle" || l.action === "resolveChallenge" || l.action === "reclaimExpired"))
    .reduce((sum, l) => sum + (l.amounts[WALLETS.operator] ?? 0n), 0n);
  const remaining = windowLeft(job, now);
  const settle = async () => {
    try {
      await actions.settle(WALLETS.operator, job.id);
    } catch {
      /* window still open or already settled: UI state shows it */
    }
  };
  return (
    <Card>
      <CardTitle>Verdict and earnings</CardTitle>
      <Row label="Job state" value={job.state} />
      {p && (
        <>
          <Row label="Recorded rate" value={`${litersPerHa(p.appliedRateMlPerHa)} (target ${litersPerHa(job.targetRateMlPerHa)})`} />
          <Row label="Coverage" value={`${(p.coverageBps / 100).toFixed(1)}%`} />
          <Row label="Co-signed by" value={`${p.signers.length} validators`} />
        </>
      )}
      {job.state === "ProofSubmitted" && (
        <>
          <Row label="Challenge window" value={remaining > 0 ? `${fmtSecs(remaining)} left` : "closed"} />
          <Text style={type.body}>
            The farmer can challenge during the window. When it closes without a challenge, the money is released to you.
          </Text>
          <Button label="Collect payment" disabled={remaining > 0} onPress={settle} />
        </>
      )}
      {job.state === "Challenged" && <Banner tone="info" text="The farmer challenged this job. A validator panel will decide." />}
      {job.state === "Released" && (
        <Banner tone="ok" text={`Released. You received ${both(received)} (pay plus your bond back).${job.payout ? ` Job payout to you: ${usdc(job.payout.operator)}.` : ""}`} />
      )}
      {(job.state === "Refunded" || job.state === "Cancelled") && (
        <Banner tone="error" text={`Job ended: ${job.state}. You received ${both(received)}.`} />
      )}
      <Row label="Jobs completed" value={String(op?.jobsCompleted ?? 0)} />
      <Row label="Jobs failed" value={String(op?.jobsFailed ?? 0)} />
    </Card>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  stripDot: { width: 12, height: 12, borderRadius: 6 },
  strong: { fontWeight: "600", color: colors.ink },
  cardHead: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: space.md },
  jobTitle: { fontFamily: type.heading.fontFamily, fontSize: 20, lineHeight: 24, fontWeight: "700", color: colors.ink },
});
