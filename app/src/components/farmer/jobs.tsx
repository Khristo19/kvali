import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";

import { lari, usdc, whenText } from "@/components/money";
import { TxId } from "@/components/job/ui";
import { jobLog } from "@/components/job/helpers";
import { Button, Card, CardTitle, ErrorText, Row, StatusChip, TwoUp } from "@/components/ui";
import { fieldHa } from "@/data/fields";
import { selectField, useFields } from "@/data/fields-store";
import { keys } from "@/devnet/keys";
import { useActions } from "@/engine/actions";
import { SAMPLE_JOB_ID, SAMPLE_AMOUNT } from "@/engine/scenario";
import type { Action, Job } from "@/engine/types";
import { useEngine } from "@/engine/useEngine";
import { addHistory, useHistory, type HistoryEntry } from "@/session/history";
import { jobRef } from "@/session/info";
import { useSession } from "@/session/store";
import { colors, type } from "@/theme";
import { CropHealthCard, MyFields, haText } from "./fields";
import { usePostJob } from "./sections";

const JOB_ID = SAMPLE_JOB_ID;
const ENDING: Action[] = ["settle", "resolveChallenge", "cancelJob", "reclaimExpired"];

/** Section heading of the "My jobs" tab. */
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
      field: session?.fieldName ?? "Field",
      areaCha: job.areaCha,
      state: job.state,
      at,
      paid: String(p.operator - bondBack),
      back: String(p.farmer),
      tx: settle?.tx,
    },
  };
}

/** Writes a job to the history as soon as it has ended (so "Start a new job" can wipe it safely). Renders nothing. */
export function HistoryRecorder() {
  const fin = useFinishedEntry();
  const addr = fin?.addr;
  const entry = fin?.entry;
  useEffect(() => {
    if (addr && entry) addHistory(addr, entry);
  }, [addr, entry?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

/** First thing on the page: add a field or post a job on the selected field; the field list and crop health sit under a toggle. */
export function StartCard() {
  const { state } = useEngine();
  const actions = useActions();
  const job = state.jobs[JOB_ID];
  const { post, err, field, farmer } = usePostJob();
  const { fields, selectedId } = useFields();
  const [open, setOpen] = useState(false);
  const fin = useFinishedEntry();
  const newJob = () => {
    if (fin) addHistory(fin.addr, fin.entry);
    void actions.newJob(JOB_ID).catch(() => undefined);
  };
  return (
    <>
      <Card testID="start-card">
        <CardTitle>Start</CardTitle>
        <Row label="Field for the next job" value={field.name} sub={`${haText(fieldHa(field))} · ${field.crop}`} />
        {fields.length > 1 ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {fields.map((f) => (
              <Button key={f.id} testID={`use-field-${f.id}`} small kind={f.id === selectedId ? "primary" : "secondary"} label={f.name} onPress={() => selectField(f.id)} />
            ))}
          </View>
        ) : null}
        <TwoUp>
          <Button testID="add-field" kind="secondary" label="+ Add a field" onPress={() => router.push("/mark-field" as never)} />
          <Button
            testID="post-job"
            label="Post a new job"
            onPress={post}
            disabled={!farmer || !!job}
            hint={!farmer ? "Sign up as a farmer first" : job ? "You have a job in progress" : `Holds ${usdc(SAMPLE_AMOUNT)} until the spraying is checked`}
          />
        </TwoUp>
        {job ? (
          <Text style={type.small}>You have a job in progress; one job at a time in the demo.</Text>
        ) : (
          <Text style={type.small}>Posting holds {usdc(SAMPLE_AMOUNT)} ({lari(SAMPLE_AMOUNT)}) safely until the spraying is checked.</Text>
        )}
        {job?.payout ? <Button testID="new-job" label="Start a new job" onPress={newJob} /> : null}
        <ErrorText message={err} />
        <Button small kind="secondary" testID="fields-toggle" label={open ? "Hide my fields and crop health" : "My fields and crop health"} onPress={() => setOpen(!open)} />
      </Card>
      {open ? (
        <TwoUp>
          <View style={{ gap: 16 }}>
            <MyFields />
          </View>
          <CropHealthCard fieldId={field.id} />
        </TwoUp>
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

/** Finished jobs of this farmer account, newest first. */
export function HistoryCard({ addr }: { addr: string }) {
  const list = useHistory(addr);
  return (
    <Card testID="history-card">
      {list.length === 0 ? <Text style={type.body}>No finished jobs yet.</Text> : list.map((e) => <HistoryRow key={e.id} e={e} />)}
    </Card>
  );
}
