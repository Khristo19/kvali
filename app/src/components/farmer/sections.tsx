import { router, type Href } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Pressable } from "@/components/ui/pressable";

import { clock, lari, lariAmount, litersPerHa, usdc, whenText } from "@/components/money";
import { Banner, BigNumber, Button, Card, CardTitle, ErrorText, Icon, Row, TimelineStep, useReached, type StepState } from "@/components/ui";
import {
  WALLETS,
  sampleJob,
  sampleRecords,
  SAMPLE_AMOUNT,
  SAMPLE_JOB_ID,
  DEMO_DEADLINE_SECS,
} from "@/engine/scenario";
import { LiveLeft } from "@/components/live-clock";
import { ModeBanner } from "@/components/devnet/mode-banner";
import { TxId } from "@/components/job/ui";
import { useActions } from "@/engine/actions";
import { useEngine } from "@/engine/useEngine";
import type { Job, JobState } from "@/engine/types";
import { colors, type } from "@/theme";
import { fieldHa, fieldHash } from "@/data/fields";
import { selectedField, useFields } from "@/data/fields-store";
import { useAccount } from "@/account/store";
import { describeJob } from "@/session/info";
import { usePending, useSession } from "@/session/store";
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
  const session = useSession();
  const field = selectedField(useFields());
  const farmer = useAccount("farmer");
  const [err, setErr] = useState<string | null>(null);
  const expired = useReached(job?.sprayDeadline);

  const post = async () => {
    try {
      setErr(null);
      await actions.postJob(JOB_ID, { hash: fieldHash(field), areaCha: areaCha(field.outline), name: field.name, crop: field.crop, product: field.product, farmerName: farmer?.name });
    } catch (e) {
      setErr(errorMessage(e));
    }
  };

  if (job) {
    const d = describeJob(job, session);
    return (
      <Card>
        <CardTitle>Your current job</CardTitle>
        <Row testID="job-id" label="Job" value={d.ref} sub={job.state} />
        <Row label="Field" value={d.field} sub={`${haText(job.areaCha / 100)}${d.crop ? ` · ${d.crop}` : ""}`} />
        <Row label="Product" value={d.product} />
        <Row label="Target" value={litersPerHa(job.targetRateMlPerHa)} />
        <Row label="Spray by" value={whenText(job.sprayDeadline)} />
        <Text style={[type.body, { color: colors.green, fontWeight: "600" }]}>
          {job.payout ? `This job is finished (${job.state}).` : `${usdc(job.amount)} is held safely.`}
        </Text>
        {job.payout ? (
          <Button testID="new-job" label="Start a new job" onPress={() => void actions.newJob(JOB_ID).catch(() => undefined)} />
        ) : job.state === "Posted" ? (
          <Button testID="cancel-job" label="Cancel this job and take the money back" kind="secondary" onPress={() => void actions.cancelJob(JOB_ID).catch(() => undefined)} />
        ) : job.state === "Accepted" ? (
          <>
            <LiveLeft
              endsAt={job.sprayDeadline}
              render={(left) => (
                <Text style={type.small}>
                  {left > 0
                    ? `If the operator cannot deliver an accepted record, you can release the job after the spray-by deadline (${whenText(job.sprayDeadline)}, ${Math.ceil(left / 60)} min left): the payment and the operator's bond are returned.`
                    : "The spray-by deadline has passed. Release the job to get your payment back (the operator's bond is returned too)."}
                </Text>
              )}
            />
            <Button testID="release-job" label="Release this job (after the deadline)" kind="secondary" disabled={!expired} hint="Available once the spray-by deadline has passed" onPress={() => void actions.reclaimExpired(JOB_ID).catch(() => undefined)} />
          </>
        ) : null}
        <ErrorText message={err} />
      </Card>
    );
  }

  return (
    <Card>
      <CardTitle>Post a spray job</CardTitle>
      <BigNumber caption="Price" value={lariAmount(SAMPLE_AMOUNT)} sub={`${usdc(SAMPLE_AMOUNT)} USDC`} />
      <Row label="Field" value={field.name} sub={`${haText(fieldHa(field))} · ${field.crop}`} />
      <Row label="Product" value={field.product} />
      <Row label="Target" value={litersPerHa(sampleJob.targetRateMlPerHa)} />
      <Row label="Spray by" value={`${DEMO_DEADLINE_SECS / 60} minutes after posting (demo)`} />
      <Text style={type.body}>Your {usdc(SAMPLE_AMOUNT)} is held safely until the spraying is checked.</Text>
      <Button testID="post-job" label={`Post job and hold ${usdc(SAMPLE_AMOUNT)}`} onPress={post} disabled={!farmer} hint={farmer ? undefined : "Sign up as a farmer first"} />
      {farmer ? null : (
        <>
          <Text style={[type.body, { color: colors.accent, fontWeight: "600" }]}>Sign up as a farmer first: you need your own demo wallet to post a job.</Text>
          <Button testID="farmer-signup" small kind="secondary" label="Sign up as a farmer" onPress={() => router.replace("/?role=farmer" as Href)} />
        </>
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
  const pending = usePending();
  const job = state.jobs[JOB_ID];
  const ended = useReached(job?.proof?.windowEndsAt);
  if (!job) {
    return (
      <Card>
        <CardTitle>Job status</CardTitle>
        <Text style={type.body}>No job yet. Post one above.</Text>
      </Card>
    );
  }
  const h = headline(job, ended ? 0 : 1);
  const counting = job.state === "ProofSubmitted" && !ended;
  return (
    <Card testID="job-status">
      <View style={styles.titleRow}>
        <View style={[styles.badge, !h.done && styles.badgeOpen]}>
          {h.done ? <Icon name="check" color={colors.card} size={18} /> : <View style={styles.badgeDot} />}
        </View>
        <Text testID="job-status-title" style={styles.statusTitle}>{h.title}</Text>
      </View>
      <Text style={type.body}>{h.text}</Text>
      {job.state === "Accepted" && pending?.refusal ? (
        <Banner testID="refusal-banner" tone="error" text={`A validator refused the operator's record: ${pending.refusal}. The job stays open until the operator sends a new record.`} />
      ) : null}
      {job.state === "Accepted" && pending && !pending.refusal ? (
        <Banner testID="record-pending-banner" tone="info" text={`The operator sent a record. Validators are checking it (${pending.approvals.length} of 2 approvals).`} />
      ) : null}
      {counting ? (
        <View style={styles.countdown}>
          <LiveLeft endsAt={job.proof?.windowEndsAt ?? 0} render={(left) => <BigNumber caption="Window closes in" value={clock(left)} size={40} live />} />
        </View>
      ) : null}
    </Card>
  );
}

export function MoneyCard() {
  const job = useJob();
  if (!job) return null;
  const p = job.payout;
  if (p && job.state === "Released") {
    const bondBack = p.operator < job.bond ? p.operator : job.bond;
    const pay = p.operator - bondBack;
    return (
      <Card testID="money-card" style={styles.moneyCard}>
        <BigNumber caption="Paid to the operator" value={usdc(pay)} sub={`${lari(pay)} · plus the operator's own ${usdc(bondBack)} bond returned`} />
        <View style={styles.lockTile}>
          <Icon name="lock" color={colors.green} size={26} />
        </View>
      </Card>
    );
  }
  const caption = !p ? "Payment held safely" : "Payment returned to you";
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
  const ended = useReached(job?.proof?.windowEndsAt);
  if (!job) return null;
  const cur = currentStep(job.state);
  const p = job.proof;
  const left = ended ? 0 : 1;
  const when = (a: string) => {
    const t = at(a);
    return t ? whenText(t) : "";
  };
  const join = (...parts: string[]) => parts.filter(Boolean).join(" · ");
  const lastTitle = job.state === "Refunded" ? "Money returned to you" : job.state === "Cancelled" ? "Job cancelled" : "Operator paid";
  const bondBack = job.payout ? (job.payout.operator < job.bond ? job.payout.operator : job.bond) : 0n;
  const pay = job.payout ? job.payout.operator - bondBack : 0n;
  const lastDetail =
    job.payout && job.state === "Released"
      ? `Payment ${usdc(pay)} (${lari(pay)}) released; the operator's ${usdc(bondBack)} bond was returned separately`
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
  const closed = useReached(job?.proof?.windowEndsAt);
  if (!job) return null;
  const bond = (job.amount * state.config.challengeBondBps) / 10_000n;
  const pct = Number(state.config.challengeBondBps) / 100;
  const open = !!job.proof && job.state === "ProofSubmitted" && !closed;

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
      {job.proof ? <Button testID="see-proof" label="See the proof" onPress={() => router.push("/job?from=farmer" as Href)} /> : null}
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
  const bondBack = p.operator < job.bond ? p.operator : job.bond;
  const rows: [string, bigint][] = [
    ["To the operator: payment", p.operator - bondBack],
    ["To the operator: their own bond back (not your money)", bondBack],
    ["Kvali fee", p.kvali],
    ["Validators", p.validators],
  ];
  return (
    <Card testID="payout-card">
      <CardTitle>{title}</CardTitle>
      <Row testID="payout-farmer" label="Back to you (farmer)" value={usdc(p.farmer)} sub={p.farmer === 0n ? "paid in full: nothing to return" : lari(p.farmer)} />
      {rows.map(([l, v], i) => (
        <Row key={l} testID={`payout-${["operator", "bond", "kvali", "validators"][i]}`} label={l} value={usdc(v)} sub={lari(v)} />
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
        testID="demo-controls-toggle"
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
          <Button testID="demo-accept" small label="Operator accepts the job" kind="secondary" disabled={!job || job.state !== "Posted"} onPress={() => run(() => actions.acceptJob(JOB_ID))} />
          {records.map((k) => (
            <Button testID={`demo-submit-${k}`} small key={k} label={`Operator submits record: ${k} (validators co-sign automatically)`} kind="secondary" disabled={!job || job.state !== "Accepted"} onPress={() => run(() => actions.submitRecord(k, JOB_ID))} />
          ))}
          <Button testID="demo-settle" small label="Settle after window" kind="secondary" disabled={!job || job.state !== "ProofSubmitted"} onPress={() => run(() => actions.settle(WALLETS.farmer, JOB_ID))} />
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
