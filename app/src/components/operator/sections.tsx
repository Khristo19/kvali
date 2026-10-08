import { router } from "expo-router";
import { useAccount } from "@/account/store";
import { describeJob, jobRef } from "@/session/info";
import { recordTitle } from "@/components/records";
import { useSession, type Session } from "@/session/store";
import { useEffect, useState } from "react";
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
import { SettleNow } from "@/components/settle-now";
import { windowLeft } from "@/engine/engine";
import { refreshOpenJobs } from "@/devnet/bridge";
import type { ChainJob } from "@/devnet/client";
import { useDevnetState } from "@/devnet/mode";
import { notify } from "@/components/ui/notice";
import { setPending, usePending } from "@/session/store";
import { useActions } from "@/engine/actions";
import { useEngine } from "@/engine/useEngine";
import { EngineError, type Job } from "@/engine/types";
import { DRONE, WALLETS, recordFor, sampleRecords } from "@/engine/scenario";
import { colors, space, type } from "@/theme";

const date = (secs: number) => new Date(secs * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const both = (a: bigint) => `${usdc(a)} (${lari(a)})`;

export function Wallet() {
  const { state } = useEngine();
  const b = state.balances[WALLETS.operator] ?? 0n;
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

const when = (secs: number) => new Date(secs * 1000).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const SIGN_UP_FIRST = "Sign up as a drone operator first: you need your own demo wallet to accept a job.";

function jobCard(j: Job, feeBps: bigint, onAccept: () => void, o: { onChain?: boolean; session: Session | null; disabledReason?: string; mine?: boolean }) {
  const d = describeJob(j, o.session);
  const title = `${d.field} · ${hectares(j.areaCha)}`;
  const receive = j.amount - (j.amount * feeBps) / 10_000n;
  return (
    <Card key={`${j.id}-${o.onChain ? "chain" : "mine"}`}>
      <View style={styles.cardHead}>
        <View style={{ flex: 1, flexShrink: 1, minWidth: 0 }}>
          <Text style={styles.jobTitle}>{title}</Text>
          <Text style={type.small}>
            {d.farmer ? `Farmer: ${d.farmer} · ` : ""}job {d.ref}
            {o.onChain ? " · read from Solana devnet" : ""}
          </Text>
        </View>
        <StatusChip label={o.mine ? "Your demo job" : "Open"} tone="green" />
      </View>
      <BigNumber value={usdc(j.amount)} size={30} sub={`${lari(j.amount)} · you receive ${usdc(receive)} after fee`} />
      <Divider />
      <FactGrid>
        <Fact label="Field" value={d.field} />
        <Fact label="Product" value={d.product} />
        <Fact label="Rate" value={litersPerHa(j.targetRateMlPerHa)} />
        <Fact label="Area" value={hectares(j.areaCha)} />
        <Fact label="Spray by" value={when(j.sprayDeadline)} />
        <Fact label="Price" value={usdc(j.amount)} />
      </FactGrid>
      <Text style={type.body}>You lock {usdc(j.amount)} as a bond; you get it back when the job is approved.</Text>
      <Button label={`Accept job ${d.ref} and lock ${usdc(j.amount)} bond`} disabled={!!o.disabledReason} hint={o.disabledReason} onPress={onAccept} />
      {o.disabledReason ? <Text style={type.small}>{o.disabledReason}</Text> : null}
    </Card>
  );
}

/** Open job accounts read from the chain, shaped like local jobs so the same card can show them. */
function chainAsJob(c: ChainJob): Job {
  return {
    id: c.chainJobId, farmer: WALLETS.farmer, amount: c.amount, fieldHash: c.fieldHash, areaCha: c.areaCha, targetRateMlPerHa: c.targetRateMlPerHa,
    toleranceBps: c.toleranceBps, postedAt: c.createdAt, sprayDeadline: c.sprayDeadline, state: "Posted", operator: null, droneHash: null, bond: 0n,
    proof: null, challenge: null, payout: null, endedAt: null,
  };
}

/** Refresh the chain's open jobs when the page opens (devnet mode). */
export function useChainJobs() {
  const dev = useDevnetState();
  useEffect(() => {
    if (dev.mode === "devnet" && dev.status === "ready") void refreshOpenJobs();
  }, [dev.mode, dev.status, dev.chainJobId]);
  const extra = (dev.mode === "devnet" ? (dev.openJobs ?? []) : []).filter((c) => c.chainJobId !== dev.chainJobId);
  return { dev, extra, held: dev.mode === "devnet" ? dev.heldJob : null };
}

export function OpenJobs({ onError, onDone }: { onError: (m: string | null) => void; onDone: () => void }) {
  const { state } = useEngine();
  const actions = useActions();
  const { dev, extra, held } = useChainJobs();
  const session = useSession();
  const operatorAcct = useAccount("operator");
  const [showOthers, setShowOthers] = useState(false);
  const jobs = Object.values(state.jobs).filter((j) => j.state === "Posted");
  const feeBps = state.config.kvaliFeeBps + state.config.validatorFeeBps;
  const run = async (fn: () => Promise<void>) => {
    try {
      await fn();
      onError(null);
      onDone();
    } catch (e) {
      onError(plainError(e));
    }
  };
  const local = state.jobs[17];
  const busyReason = local && !['Released', 'Refunded', 'Cancelled'].includes(local.state) ? (local.state === 'Posted' ? 'The demo job above is still open. Accept it, or ask the farmer to cancel it, before taking another one.' : 'You are working on the demo job. Finish it or release it first.') : undefined;
  const reading = dev.mode === "devnet" && dev.openJobs === null;
  const none = jobs.length === 0 && extra.length === 0 && !held;
  return (
    <>
      {held ? (
        <Card>
          <CardTitle>You still hold a job on chain</CardTitle>
          <Text style={type.body}>
            Job …{String(held.chainJobId).slice(-5)} is {held.state} and your bond is locked in it (from an earlier visit). Continue it to finish it here.
          </Text>
          <Button label={`Continue job …${String(held.chainJobId).slice(-5)}`} onPress={() => void run(() => actions.continueHeldJob(held.chainJobId))} />
        </Card>
      ) : null}
      {jobs.map((j) => jobCard(j, feeBps, () => void run(() => actions.acceptJob(j.id)), { session, mine: true, disabledReason: operatorAcct ? undefined : SIGN_UP_FIRST }))}
      {extra.length > 0 ? (
        <Button
          small
          kind="secondary"
          label={`${showOthers || jobs.length === 0 ? "Hide" : "Show"} other open jobs on devnet from other visitors (${extra.length})`}
          onPress={() => setShowOthers(!(showOthers || jobs.length === 0))}
        />
      ) : null}
      {(showOthers || jobs.length === 0) && extra.map((c) =>
        jobCard(chainAsJob(c), feeBps, () => void run(() => actions.acceptOpenJob(c.chainJobId)), {
          onChain: true,
          session,
          disabledReason: operatorAcct ? busyReason : SIGN_UP_FIRST,
        }),
      )}
      {none ? (
        <Card>
          <CardTitle>Jobs near you</CardTitle>
          <Text style={type.body}>
            {reading ? "Reading open jobs from Solana devnet…" : "No open jobs right now. Post one from the Farmer page, then come back."}
          </Text>
        </Card>
      ) : null}
      {dev.mode === "devnet" && dev.status === "ready" ? (
        <Button small kind="secondary" label="Refresh open jobs from the chain" onPress={() => void refreshOpenJobs()} />
      ) : null}
    </>
  );
}

export function useOpenJobsText(): string {
  const { state } = useEngine();
  const { extra } = useChainJobs();
  const n = Object.values(state.jobs).filter((j) => j.state === "Posted").length + extra.length;
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
  const pending = usePending();
  const session = useSession();
  const [key, setKey] = useState<keyof typeof sampleRecords>((pending?.key as keyof typeof sampleRecords) ?? "honest");
  const r = recordFor(key, job.areaCha);
  const rate = job.areaCha > 0 ? Math.round(r.litersMl / (job.areaCha / 100)) : 0;
  const cov = Math.round((r.areaCoveredCha / job.areaCha) * 100);
  const stage = () => {
    onError(null);
    setPending({ key, approvals: [] });
    notify("ok", `Record "${recordTitle(key)}" sent to the validators. Open the Validator page and approve it with 2 of 3 seats.`);
  };
  const shortcut = async () => {
    try {
      await actions.submitRecord(key, job.id);
      onError(null);
    } catch (e) {
      onError(plainError(e));
    }
  };
  return (
    <Card>
      <CardTitle>Demo: simulate the drone flight</CardTitle>
      <Text style={type.body}>
        Presenter control. A real drone would upload its flight log after spraying {describeJob(job, session).field} (job {jobRef(job.id, session)}). Here you pick a sample record instead.
      </Text>
      {SAMPLE_INFO.map((s) => (
        <Button small key={s.key} kind={s.key === key ? "primary" : "secondary"} label={s.title + (s.key === key ? " (selected)" : "")} onPress={() => setKey(s.key)} />
      ))}
      <Text style={type.body}>{SAMPLE_INFO.find((s) => s.key === key)?.desc}</Text>
      <Row label="Liquid sprayed" value={`${(r.litersMl / 1000).toFixed(1)} L`} />
      <Row label="Area covered" value={`${hectares(r.areaCoveredCha)} (${cov}% of field)`} />
      <Row label="Rate" value={`${litersPerHa(rate * 1)} (target ${litersPerHa(job.targetRateMlPerHa)})`} />
      <Text style={type.body}>
        How it works: the program only accepts a spray record when 2 of the 3 validators co-sign it in the same transaction. So this button hands the
        record to the validators; they approve it on the Validator page, and then the proof is submitted on chain.
      </Text>
      {pending ? (
        <Banner
          tone={pending.refusal ? "error" : "info"}
          text={
            pending.refusal
              ? `A validator refused the record "${recordTitle(pending.key)}": ${pending.refusal}. Pick another record and send it again, or release the job below.`
              : `Waiting for validators: record "${recordTitle(pending.key)}", ${pending.approvals.length} of 2 approvals.`
          }
        />
      ) : null}
      <Button label="Send the record to the validators" onPress={stage} />
      {pending ? <Button label="Open the Validator page" kind="secondary" onPress={() => router.replace("/validator")} /> : null}
      <Button small kind="secondary" label="Presenter shortcut: skip the validators (co-sign automatically)" onPress={shortcut} />
      <ReleaseJob job={job} />
    </Card>
  );
}

/** Way out of a stuck accepted job: after the spray-by deadline the program returns payment and bond (reclaim_expired). */
export function ReleaseJob({ job }: { job: Job }) {
  const actions = useActions();
  const now = useTick();
  if (job.state !== "Accepted") return null;
  const left = job.sprayDeadline - now;
  return (
    <>
      <Divider />
      <Text style={type.label}>Stuck? Release this job</Text>
      <Text style={type.small}>
        {left > 0
          ? `Demo jobs must be sprayed within 30 minutes (until ${when(job.sprayDeadline)}). If no good record is accepted by then, the program returns the farmer's payment and your bond: press the button after the deadline (${Math.ceil(left / 60)} min left).`
          : "The spray-by deadline has passed with no accepted proof. Release the job to return the payment and the bond."}
      </Text>
      <Button small kind="warn" label="Release this job (after the deadline)" disabled={left > 0} hint="Available once the spray-by deadline has passed" onPress={() => void actions.reclaimExpired(job.id).catch(() => undefined)} />
    </>
  );
}

function fmtSecs(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function Verdict({ job }: { job: Job }) {
  const { state } = useEngine();
  const now = useTick();
  const op = state.operators[WALLETS.operator];
  const p = job.proof;
  const received = state.log
    .filter((l) => l.jobId === job.id && (l.action === "settle" || l.action === "resolveChallenge" || l.action === "reclaimExpired"))
    .reduce((sum, l) => sum + (l.amounts[WALLETS.operator] ?? 0n), 0n);
  const remaining = windowLeft(job, now);
  return (
    <>
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
    <SettleNow job={job} />
    </>
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
