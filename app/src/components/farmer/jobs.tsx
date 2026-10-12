import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";

import { usdc, whenText } from "@/components/money";
import { TxId } from "@/components/job/ui";
import { jobLog } from "@/components/job/helpers";
import { ChainCard } from "@/components/devnet/chain-card";
import { SettleNow } from "@/components/settle-now";
import { Button, Card, StatusChip, TwoUp } from "@/components/ui";
import { fieldHa, fieldHash, type Field } from "@/data/fields";
import { selectField, selectedField, useFields } from "@/data/fields-store";
import { keys } from "@/devnet/keys";
import { SAMPLE_JOB_ID } from "@/engine/scenario";
import type { Action, Job } from "@/engine/types";
import { useEngine } from "@/engine/useEngine";
import { addHistory, historyForField, useHistory, type HistoryEntry } from "@/session/history";
import { describeJob, jobRef } from "@/session/info";
import { usePending, useSession } from "@/session/store";
import { colors, type } from "@/theme";
import { CropHealthCard, FieldCard, fieldStatus, haText, type FieldView } from "./fields";
import { ActionsCard, CurrentJobCard, MoneyCard, PayoutCard, PostJobCard, StatusCard, TimelineCard } from "./sections";

const JOB_ID = SAMPLE_JOB_ID;
const ENDING: Action[] = ["settle", "resolveChallenge", "cancelJob", "reclaimExpired"];

/** Section heading of the farmer pages. */
export function SectionTitle({ children, sub }: { children: string; sub?: string }) {
  return (
    <View style={{ gap: 2, paddingTop: 8 }}>
      <Text accessibilityRole="header" style={type.heading}>
        {children}
      </Text>
      {sub ? <Text style={type.small}>{sub}</Text> : null}
    </View>
  );
}

/** The finished current job as a history row (null while it is still running). */
function useFinishedEntry(): { addr: string; entry: HistoryEntry } | null {
  const { state } = useEngine();
  const session = useSession();
  const job: Job | undefined = state.jobs[JOB_ID];
  if (!job || !job.payout || (job.state !== "Released" && job.state !== "Refunded" && job.state !== "Cancelled")) return null;
  const p = job.payout;
  const bondBack = p.operator < job.bond ? p.operator : job.bond;
  const settle = jobLog(state.log, job).filter((l) => ENDING.includes(l.action)).pop();
  const at = job.endedAt ?? settle?.time ?? job.postedAt;
  return {
    addr: session?.farmer ?? keys.farmer.publicKey.toBase58(),
    entry: {
      id: String(session?.chainJobId ?? `${job.postedAt}`),
      ref: jobRef(job.id, session),
      field: describeJob(job, session).field,
      fieldHash: job.fieldHash,
      areaCha: job.areaCha,
      state: job.state,
      at,
      paid: String(p.operator - bondBack),
      back: String(p.farmer),
      tx: settle?.tx,
    },
  };
}

/** Writes a job to the history as soon as it has ended (so posting the next job can wipe it safely). Renders nothing. */
export function HistoryRecorder() {
  const fin = useFinishedEntry();
  const addr = fin?.addr;
  const entry = fin?.entry;
  useEffect(() => {
    if (addr && entry) addHistory(addr, entry);
  }, [addr, entry?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function viewOf(f: Field): FieldView {
  return { id: f.id, name: f.name, hash: fieldHash(f), ha: fieldHa(f), crop: f.crop, product: f.product, field: f };
}

/**
 * The farmer home ("My fields"). On top, "Post a spray job" in one step: pick a field (or add one), the date, post.
 * While a job runs, a note says so instead (one job at a time). Then one card per field with its status, the chosen
 * field's current job, its crop health and its past jobs.
 */
export function FieldsHome({ signedIn }: { signedIn: boolean }) {
  const { state } = useEngine();
  // Signed out: only the fields (no job, no money on screen).
  const job: Job | undefined = signedIn ? state.jobs[JOB_ID] : undefined;
  const fs = useFields();
  const session = useSession();
  const pending = usePending();
  const addr = keys.farmer.publicKey.toBase58();
  const history = useHistory(signedIn ? addr : null);
  const [picked, setPicked] = useState<string | null>(null);

  const views = fs.fields.map(viewOf);
  // The job's field; a stand-in from the job itself when this browser no longer has it (e.g. a drawn field after a reload).
  const jobView: FieldView | undefined = job
    ? (views.find((v) => v.hash === job.fieldHash) ?? {
        id: "job-field",
        name: describeJob(job, session).field,
        hash: job.fieldHash,
        ha: job.areaCha / 100,
        crop: session?.crop,
        product: session?.product,
      })
    : undefined;
  const list = jobView && !jobView.field ? [...views, jobView] : views;
  const focus = list.find((v) => v.id === picked) ?? jobView ?? viewOf(selectedField(fs));
  const jobHere = !!job && focus.hash === job.fieldHash;
  const running = !!job && !job.payout;

  const pick = (v: FieldView) => {
    setPicked(v.id);
    if (v.field) selectField(v.id);
  };

  return (
    <>
      {signedIn && !running ? <PostJobCard onChoose={setPicked} /> : null}
      {running && jobView ? (
        <Card testID="one-job-note">
          <Text style={type.body}>
            One job at a time: your job on {jobView.name} is {job.state === "Posted" ? "waiting for an operator" : "running"}. You can post the next one when it is
            finished{job.state === "Posted" ? ", or cancel this one" : ""}.
          </Text>
          {focus.id !== jobView.id ? <Button small kind="secondary" label={`Open ${jobView.name}`} onPress={() => pick(jobView)} /> : null}
        </Card>
      ) : null}
      <SectionTitle sub="Tap a field to see its job and crop health">My fields</SectionTitle>
      <Button testID="add-field" kind="secondary" label="+ Add a field" onPress={() => router.push("/mark-field" as never)} />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 16 }}>
        {list.map((v) => {
          const here = !!job && v.hash === job.fieldHash;
          const status = fieldStatus(job, here, historyForField(history, v)[0], pending);
          const action = here && focus.id !== v.id ? <Button small kind="secondary" label="See the job" onPress={() => pick(v)} /> : null;
          return <FieldCard key={v.id} view={v} selected={v.id === focus.id} status={status} onSelect={() => pick(v)} action={action} />;
        })}
      </View>

      <SectionTitle sub={[haText(focus.ha), focus.crop, focus.product].filter(Boolean).join(" · ")}>{focus.name}</SectionTitle>
      {job && jobHere ? (
        <>
          <TwoUp>
            <StatusCard />
            <MoneyCard />
          </TwoUp>
          <TwoUp>
            <TimelineCard />
            <View style={{ gap: 16 }}>
              <PayoutCard />
              <SettleNow job={job} />
            </View>
          </TwoUp>
          <ActionsCard />
          <CurrentJobCard job={job} />
          <ChainCard />
        </>
      ) : null}
      {focus.field ? <CropHealthCard fieldId={focus.id} /> : null}
      {signedIn ? (
        <>
          <SectionTitle sub="Paid out, refunded or cancelled">Past jobs on this field</SectionTitle>
          <HistoryCard addr={addr} field={{ name: focus.name, hash: focus.hash }} />
        </>
      ) : null}
    </>
  );
}

const OUTCOME: Record<HistoryEntry["state"], string> = { Released: "Paid to operator", Refunded: "Refunded", Cancelled: "Cancelled" };

function HistoryRow({ e }: { e: HistoryEntry }) {
  const paid = BigInt(e.paid);
  const back = BigInt(e.back);
  const money = e.state === "Released" ? `${usdc(paid)} paid to the operator` : `${usdc(back)} returned to you`;
  return (
    <View testID="history-row" style={{ gap: 4, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <Text style={[type.subheading, { flexShrink: 1 }]}>{e.field}</Text>
        <StatusChip label={OUTCOME[e.state]} tone={e.state === "Released" ? "green" : "muted"} />
      </View>
      <Text style={type.body}>
        {haText(e.areaCha / 100)} · {whenText(e.at)} · job {e.ref}
      </Text>
      <Text style={[type.body, { color: colors.ink, fontWeight: "600" }]}>{money}</Text>
      {e.tx ? <TxId tx={e.tx} /> : null}
    </View>
  );
}

/** Finished jobs of this farmer account (only those of `field` when given), newest first. */
export function HistoryCard({ addr, field }: { addr: string; field?: { name: string; hash: string } }) {
  const all = useHistory(addr);
  const list = field ? historyForField(all, field) : all;
  return (
    <Card testID="history-card">
      {list.length === 0 ? (
        <Text style={type.body}>{field ? "No finished jobs on this field yet." : "No finished jobs yet."}</Text>
      ) : (
        list.map((e) => <HistoryRow key={e.id} e={e} />)
      )}
    </Card>
  );
}
