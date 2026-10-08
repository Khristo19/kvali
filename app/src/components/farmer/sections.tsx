import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { clock, lari, lariAmount, litersPerHa, usdc, whenText } from "@/components/money";
import { Banner, BigNumber, Button, Card, CardTitle, ErrorText, Icon, Row, TimelineStep, useTick, type StepState } from "@/components/ui";
import {
  WALLETS,
  sampleJob,
  sampleRecords,
  SAMPLE_AMOUNT,
  SAMPLE_JOB_ID,
} from "@/engine/scenario";
import { windowLeft } from "@/engine/engine";
import { ModeBanner } from "@/components/devnet/mode-banner";
import { TxId } from "@/components/job/ui";
import { useActions } from "@/engine/actions";
import { useEngine } from "@/engine/useEngine";
import type { Job, JobState } from "@/engine/types";
import { colors, type } from "@/theme";
import { fieldHa, fieldHash } from "@/data/fields";
import { selectedField, useFields } from "@/data/fields-store";
import { areaCha } from "@/geo/geo";
import { haText } from "./fields";
import { errorMessage } from "./ui";

const JOB_ID = SAMPLE_JOB_ID;

export function SimBanner() {
  return <ModeBanner />;
}

function useJob(): Job | undefined {
  return useEngine().state.jobs[JOB_ID];
}

/** "Kakheti" from "Kakheti, Georgia (village batch ...)". */
export function regionName(): string {
  const raw = sampleJob.raw as { region?: string };
  return raw.region ? raw.region.split(",")[0] : "Georgia";
}

export function PostJobCard() {
  const { state } = useEngine();
  const actions = useActions();
  const job = state.jobs[JOB_ID];
  const field = selectedField(useFields());
  const [err, setErr] = useState<string | null>(null);
  const deadline = new Date(sampleJob.sprayDeadline);
  const deadlineText = isNaN(deadline.getTime()) ? sampleJob.sprayDeadline : deadline.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

  const post = async () => {
    try {
      setErr(null);
      await actions.postJob(JOB_ID, { hash: fieldHash(field), areaCha: areaCha(field.outline) });
    } catch (e) {
      setErr(errorMessage(e));
    }
  };

  return (
    <Card>
      <CardTitle>Post a spray job</CardTitle>
      <BigNumber caption="Price" value={lariAmount(SAMPLE_AMOUNT)} sub={`${usdc(SAMPLE_AMOUNT)} USDC`} />
      <Row label="Field" value={field.name} sub={`${haText(fieldHa(field))} · ${field.crop}`} />
      <Row label="Product" value={field.product} />
      <Row label="Target" value={litersPerHa(sampleJob.targetRateMlPerHa)} />
      <Row label="Spray by" value={deadlineText} />
      <Text style={type.body}>Your {usdc(SAMPLE_AMOUNT)} is held safely until the spraying is checked.</Text>
      {job ? (
        <>
          <Text style={[type.body, { color: colors.green, fontWeight: "600" }]}>
            {job.payout ? `This job is finished (${job.state}).` : `Job posted. ${usdc(job.amount)} is held safely.`}
          </Text>
          {job.payout ? (
            <Button label="Start a new job" onPress={() => void actions.newJob(JOB_ID).catch(() => undefined)} />
          ) : job.state === "Posted" ? (
            <Button label="Cancel this job and take the money back" kind="secondary" onPress={() => void actions.cancelJob(JOB_ID).catch(() => undefined)} />
          ) : null}
        </>
      ) : (
        <Button label={`Post job and hold ${usdc(SAMPLE_AMOUNT)}`} onPress={post} />
      )}
      <ErrorText message={err} />
    </Card>
  );
}

/** Index into STEPS of the step that is happening now (STEPS.length when everything is done). */
function currentStep(s: JobState): number {
  switch (s) {
    case "Posted":
      return 1;
    case "Accepted":
      return 2;
    case "ProofSubmitted":
    case "Challenged":
      return 4;
    default:
      return 6;
  }
}

/** Headline for the status card. */
function headline(job: Job, left: number): { title: string; text: string; done: boolean } {
  const signed = job.proof?.signers.length ?? 0;
  switch (job.state) {
    case "Posted":
      return { title: "Waiting for an operator", text: "Your job is posted. A certified drone operator will accept it.", done: false };
    case "Accepted":
      return { title: "Operator accepted", text: "The operator will spray your field and upload the spray record.", done: false };
    case "ProofSubmitted":
      return {
        title: "Proof checked",
        text:
          left > 0
            ? `Your field was sprayed and ${signed} of 3 agronomists confirmed it. Payment goes to the operator when the window closes.`
            : "The window is closed. Payment goes to the operator now.",
        done: true,
      };
    case "Challenged":
      return { title: "Under review", text: "You raised a challenge. A panel of agronomists is deciding.", done: false };
    case "Released":
      return { title: "Operator paid", text: "The spraying was checked and nobody challenged it. The job is finished.", done: true };
    case "Refunded":
      return { title: "Money returned", text: "The challenge was upheld, so your payment came back to you.", done: true };
    default:
      return { title: "Job cancelled", text: "The job was cancelled and your payment came back to you.", done: false };
  }
}

export function StatusCard() {
  const { state } = useEngine();
  const job = state.jobs[JOB_ID];
  const now = useTick();
  if (!job) {
    return (
      <Card>
        <CardTitle>Job status</CardTitle>
        <Text style={type.body}>No job yet. Post one above.</Text>
      </Card>
    );
  }
  const left = windowLeft(job, now);
  const h = headline(job, left);
  const counting = job.state === "ProofSubmitted" && left > 0;
  return (
    <Card>
      <View style={styles.titleRow}>
        <View style={[styles.badge, !h.done && styles.badgeOpen]}>
          {h.done ? <Icon name="check" color={colors.card} size={18} /> : <View style={styles.badgeDot} />}
        </View>
        <Text style={styles.statusTitle}>{h.title}</Text>
      </View>
      <Text style={type.body}>{h.text}</Text>
      {counting ? (
        <View style={styles.countdown}>
          <BigNumber caption="Window closes in" value={clock(left)} size={40} live />
        </View>
      ) : null}
    </Card>
  );
}

export function MoneyCard() {
  const job = useJob();
  if (!job) return null;
  const ended = job.payout !== null;
  const caption = !ended ? "Payment held safely" : job.state === "Released" ? "Payment released" : "Payment returned to you";
  return (
    <Card style={styles.moneyCard}>
      <BigNumber caption={caption} value={lariAmount(job.amount)} sub={`${usdc(job.amount)} USDC`} />
      <View style={styles.lockTile}>
        <Icon name="lock" color={colors.green} size={26} />
      </View>
    </Card>
  );
}

function useLogTime() {
  const { state } = useEngine();
  return (action: string): number | undefined => state.log.find((l) => l.jobId === JOB_ID && l.action === action)?.time;
}

export function TimelineCard() {
  const job = useJob();
  const win = useEngine().state.config.challengeWindowSecs;
  const at = useLogTime();
  const now = useTick();
  if (!job) return null;
  const cur = currentStep(job.state);
  const p = job.proof;
  const left = windowLeft(job, now);
  const when = (a: string) => {
    const t = at(a);
    return t ? whenText(t) : "";
  };
  const join = (...parts: string[]) => parts.filter(Boolean).join(" · ");
  const lastTitle = job.state === "Refunded" ? "Money returned to you" : job.state === "Cancelled" ? "Job cancelled" : "Operator paid";
  const lastDetail =
    job.payout && job.state === "Released"
      ? `${lariAmount(job.payout.operator)} released automatically`
      : job.state === "Refunded" || job.state === "Cancelled"
        ? "Your payment came back to you"
        : `${lariAmount(job.amount)} is released automatically`;
  const windowDetail =
    job.state === "Challenged"
      ? "You challenged. A panel is reviewing."
      : p && cur === 4
        ? left > 0
          ? `Closes ${whenText(p.windowEndsAt)}. You can still raise a challenge.`
          : "Window closed. Waiting for payment."
        : p
          ? `Closed ${whenText(p.windowEndsAt)}`
          : "Opens after the proof is checked";
  const steps: { title: string; detail: string }[] = [
    { title: "Job posted", detail: when("postJob") || whenText(job.postedAt) },
    { title: "Operator accepted", detail: cur > 1 ? when("acceptJob") : "Waiting for an operator" },
    {
      title: "Field sprayed",
      detail: p ? join(`${(p.areaCoveredCha / 100).toFixed(2)} ha`, litersPerHa(p.appliedRateMlPerHa), when("submitProof")) : "After the operator accepts",
    },
    { title: "Proof checked", detail: p ? join(`${p.signers.length} of 3 agronomists approved`, when("submitProof")) : "Agronomists check the spray record" },
    { title: win >= 3600 ? `${Math.round(win / 3600)}-hour window` : `${win}-second window`, detail: windowDetail },
    { title: lastTitle, detail: lastDetail },
  ];
  // steps[0..cur-1] are done, steps[cur] is current (cur may equal steps.length when all done).
  const stateOf = (i: number): StepState => (i < cur ? "done" : i === cur ? "current" : "todo");
  return (
    <Card>
      <CardTitle>What happened</CardTitle>
      <View>
        {steps.map((s, i) => (
          <TimelineStep key={s.title} state={stateOf(i)} title={s.title} detail={s.detail} last={i === steps.length - 1} />
        ))}
      </View>
    </Card>
  );
}

/** Buttons under the timeline: see the proof, challenge flow, details. */
export function ActionsCard() {
  const { state } = useEngine();
  const actions = useActions();
  const job = state.jobs[JOB_ID];
  const [confirm, setConfirm] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const now = useTick();
  if (!job) return null;
  const bond = (job.amount * state.config.challengeBondBps) / 10_000n;
  const pct = Number(state.config.challengeBondBps) / 100;
  const open = !!job.proof && job.state === "ProofSubmitted" && windowLeft(job, now) > 0;

  const go = async () => {
    try {
      setErr(null);
      await actions.challenge(WALLETS.farmer, JOB_ID);
      setConfirm(false);
    } catch (e) {
      setErr(errorMessage(e));
    }
  };

  return (
    <View style={styles.actions}>
      {job.proof ? <Button label="See the proof" onPress={() => router.push("/job")} /> : null}
      {job.state === "Challenged" ? (
        <Banner text={`You challenged this job and put up ${usdc(job.challenge?.bond ?? bond)} (${lariAmount(job.challenge?.bond ?? bond)}). A panel will decide.`} />
      ) : open && !confirm ? (
        <>
          <Button label="Something is wrong — challenge" kind="warn" onPress={() => setConfirm(true)} />
          <Text style={styles.note}>
            A challenge locks {lariAmount(bond)} ({pct}%) until an agronomist decides.
          </Text>
        </>
      ) : open && confirm ? (
        <Card>
          <CardTitle>Challenge this record</CardTitle>
          <Text style={[type.body, { color: colors.ink, fontWeight: "600" }]}>
            To challenge you put up a deposit of {usdc(bond)} ({lari(bond)}), which is {pct}% of the job.
          </Text>
          <Text style={type.body}>If you are right (upheld): you get your {usdc(job.amount)} back and your deposit back.</Text>
          <Text style={type.body}>If you are wrong (rejected): you lose the deposit and the operator is paid.</Text>
          <Button label={`Challenge and lock ${usdc(bond)}`} kind="danger" onPress={go} />
          <Button label="Cancel" kind="secondary" onPress={() => setConfirm(false)} />
        </Card>
      ) : job.proof && job.state === "ProofSubmitted" ? (
        <Text style={styles.note}>The challenge window is closed.</Text>
      ) : null}
      <ErrorText message={err} />
      <DetailsToggle />
    </View>
  );
}

/** "Details": spray record numbers and the technical ids (hidden by default). */
function DetailsToggle() {
  const { state } = useEngine();
  const [open, setOpen] = useState(false);
  const job = state.jobs[JOB_ID];
  const log = state.log.filter((l) => l.jobId === JOB_ID);
  const p = job?.proof;
  return (
    <View style={{ gap: 12 }}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} style={styles.detailsLink}>
        <Text style={styles.detailsText}>{open ? "Hide details" : "Details"}</Text>
      </Pressable>
      {open && job ? (
        <Card>
          <CardTitle>Spray record</CardTitle>
          {p ? (
            <>
              <Text style={[type.body, { color: colors.ink }]}>
                Sprayed {(p.areaCoveredCha / 100).toFixed(1)} of {(job.areaCha / 100).toFixed(1)} ha at {litersPerHa(p.appliedRateMlPerHa)}, target{" "}
                {litersPerHa(job.targetRateMlPerHa)}.
              </Text>
              <Row label="Liquid used" value={`${(p.litersMl / 1000).toFixed(1)} L`} />
              <Row label="Area covered" value={`${(p.areaCoveredCha / 100).toFixed(1)} ha (${(p.coverageBps / 100).toFixed(0)}%)`} />
              <Row label="Applied rate" value={litersPerHa(p.appliedRateMlPerHa)} sub={`target ${litersPerHa(job.targetRateMlPerHa)}`} />
              <Row label="Validators who signed" value={`${p.signers.length} of 3`} />
            </>
          ) : (
            <Text style={type.body}>No spray record yet.</Text>
          )}
          <CardTitle>Technical ids</CardTitle>
          <Text style={[styles.tx, styles.hash]} selectable>
            Field outline, SHA-256: {job.fieldHash}
          </Text>
          {log.map((l) => (
            <View key={l.seq} style={{ gap: 2 }}>
              <Text style={styles.tx}>{l.action}</Text>
              <TxId tx={l.tx} />
            </View>
          ))}
        </Card>
      ) : null}
    </View>
  );
}

export function PayoutCard() {
  const job = useJob();
  if (!job || !job.payout) return null;
  const p = job.payout;
  const title = job.state === "Refunded" ? "Refunded" : job.state === "Released" ? "Paid out" : "Job ended";
  const rows: [string, bigint][] = [
    ["Back to you (farmer)", p.farmer],
    ["Operator", p.operator],
    ["Kvali fee", p.kvali],
    ["Validators", p.validators],
  ];
  return (
    <Card>
      <CardTitle>{title}</CardTitle>
      {rows.map(([l, v]) => (
        <Row key={l} label={l} value={usdc(v)} sub={lari(v)} />
      ))}
    </Card>
  );
}

export function DemoControls() {
  const { state } = useEngine();
  const actions = useActions();
  const job = state.jobs[JOB_ID];
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useTick();

  const run = async (fn: () => Promise<void>) => {
    try {
      setErr(null);
      await fn();
    } catch (e) {
      setErr(errorMessage(e));
    }
  };
  const records = Object.keys(sampleRecords) as (keyof typeof sampleRecords)[];

  return (
    <Card>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Demo controls, presenter only"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
        style={{ minHeight: 44, justifyContent: "center" }}
      >
        <Text style={type.label}>{open ? "▾" : "▸"} DEMO CONTROLS (presenter only)</Text>
      </Pressable>
      {open ? (
        <>
          <Text style={type.small}>
            Demo only. These play the operator and validator roles so the farmer screen can be shown alone. The proper flow is on the Operator page
            (&ldquo;Demo: simulate the drone flight&rdquo;) and the Validator page. Not part of the real app.
          </Text>
          {!job ? <Text style={type.body}>Post a job first: these buttons need a job.</Text> : null}
          <Button small label="Operator accepts the job" kind="secondary" disabled={!job || job.state !== "Posted"} onPress={() => run(() => actions.acceptJob(JOB_ID))} />
          {records.map((k) => (
            <Button small key={k} label={`Operator submits record: ${k} (validators co-sign automatically)`} kind="secondary" disabled={!job || job.state !== "Accepted"} onPress={() => run(() => actions.submitRecord(k, JOB_ID))} />
          ))}
          <Button small label="Settle after window" kind="secondary" disabled={!job || job.state !== "ProofSubmitted"} onPress={() => run(() => actions.settle(WALLETS.farmer, JOB_ID))} />
          <ErrorText message={err} />
        </>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  badge: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.green, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  badgeOpen: { backgroundColor: colors.card, borderWidth: 4, borderColor: colors.green },
  badgeDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.green },
  statusTitle: { ...type.heading, flexShrink: 1 },
  countdown: { paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border },
  moneyCard: { flexDirection: "row", alignItems: "center", gap: 16, justifyContent: "space-between" },
  lockTile: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  actions: { gap: 12 },
  note: { ...type.small, textAlign: "center" },
  detailsLink: { alignSelf: "center", minHeight: 44, justifyContent: "center", paddingHorizontal: 14 },
  detailsText: { ...type.body, fontWeight: "600", color: colors.green, textDecorationLine: "underline" },
  tx: { ...type.small, fontSize: 14 },
  hash: { wordBreak: "break-all" } as never,
});
