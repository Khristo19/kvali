// Content of the secondary tabs (Payments, My jobs, Earnings, Drones, Reviewed, Profile ...). Small read-only views of the shared job.
import { router, type Href } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";

import { resetBurners } from "@/devnet/keys";
import { resetSessionStorage , useSession } from "@/session/store";
import { signOut , addressFor, roleLabel, shortAddr, useAccount } from "@/account/store";

import { lari, litersPerHa, usdc } from "@/components/money";
import { actorName, jobLog, moneyLine } from "@/components/job/helpers";
import { TxId } from "@/components/job/ui";
import { jobRef } from "@/session/info";
import { Banner, Button, Card, CardTitle, Row, StatusChip } from "@/components/ui";
import { SAMPLE_JOB_ID, VALIDATORS, WALLETS } from "@/engine/scenario";
import { useEngine } from "@/engine/useEngine";
import type { Job } from "@/engine/types";
import { type } from "@/theme";

const ENDED = ["Released", "Refunded", "Cancelled"];
const tone = (s: Job["state"]) => (s === "Released" ? "green" : s === "Refunded" || s === "Cancelled" ? "muted" : "orange");

function LogList({ job }: { job: Job }) {
  const { state } = useEngine();
  const entries = jobLog(state.log, job).filter((e) => e.action !== "issueCertificate");
  return (
    <>
      {entries.map((e) => (
        <View key={e.seq} style={{ gap: 2 }}>
          <Text style={[type.body, { fontWeight: "600" }]}>
            {actorName(e.actor)}: {e.action}
          </Text>
          {moneyLine(e).map((m) => (
            <Text key={m} style={type.small}>
              {m}
            </Text>
          ))}
          <TxId tx={e.tx} />
        </View>
      ))}
    </>
  );
}

export function FarmerPayments() {
  const { state } = useEngine();
  const job = state.jobs[SAMPLE_JOB_ID];
  const bal = state.balances[WALLETS.farmer] ?? 0n;
  const held = job && !ENDED.includes(job.state) ? job.amount : 0n;
  return (
    <>
      <Card>
        <CardTitle>Payments</CardTitle>
        <Row label="Your balance (test USDC)" value={usdc(bal)} sub={lari(bal)} />
        <Row label="Held safely for this job" value={usdc(held)} sub={lari(held)} />
        {job?.payout ? (
          <>
            <Row label="Back to you" value={usdc(job.payout.farmer)} />
            <Row label="Paid to the operator" value={usdc(job.payout.operator)} />
            <Row label="Kvali fee" value={usdc(job.payout.kvali)} />
            <Row label="Validators" value={usdc(job.payout.validators)} />
          </>
        ) : null}
        {!job ? <Text style={type.body}>No payments yet. Post a job first.</Text> : null}
      </Card>
      {job ? (
        <Card>
          <CardTitle>Every payment step, with proof</CardTitle>
          <LogList job={job} />
          <Button label="Open the job story" kind="secondary" onPress={() => router.push("/job?from=farmer" as Href)} />
        </Card>
      ) : null}
    </>
  );
}

export function OperatorMine() {
  const { state } = useEngine();
  const session = useSession();
  const mine = Object.values(state.jobs).filter((j) => j.operator === WALLETS.operator);
  return (
    <Card>
      <CardTitle>My jobs</CardTitle>
      {mine.length === 0 ? <Text style={type.body}>You have not accepted a job yet. Open the Jobs tab to find one.</Text> : null}
      {mine.map((j) => (
        <View key={j.id} style={{ gap: 6 }}>
          <Row label={`Job ${jobRef(j.id, session)}`} value={j.state} sub={`${usdc(j.amount)} · bond ${usdc(j.bond)}`} />
          <StatusChip label={j.state} tone={tone(j.state)} />
          <Button small kind="secondary" label="Open the job story" onPress={() => router.push("/job?from=operator" as Href)} />
        </View>
      ))}
    </Card>
  );
}

export function OperatorEarnings() {
  const { state } = useEngine();
  const op = state.operators[WALLETS.operator];
  const bal = state.balances[WALLETS.operator] ?? 0n;
  const earned = state.log
    .filter((l) => l.action === "settle" || l.action === "resolveChallenge" || l.action === "reclaimExpired")
    .reduce((s, l) => s + (l.amounts[WALLETS.operator] ?? 0n), 0n);
  const job = state.jobs[SAMPLE_JOB_ID];
  return (
    <>
      <Card>
        <CardTitle>Earnings</CardTitle>
        <Row testID="earnings-wallet" label="Wallet balance" value={usdc(bal)} sub={lari(bal)} />
        <Row testID="earnings-paid-out" label="Paid out in this session" value={usdc(earned)} sub="payment after fees plus your bond back" />
        <Row testID="earnings-completed" label="Jobs completed" value={String(op?.jobsCompleted ?? 0)} />
        <Row label="Jobs failed" value={String(op?.jobsFailed ?? 0)} />
        {job?.payout ? <Row testID="earnings-last-payout" label="Last job: operator payout" value={usdc(job.payout.operator)} /> : null}
      </Card>
      {job ? (
        <Card>
          <CardTitle>Payment steps</CardTitle>
          <LogList job={job} />
        </Card>
      ) : null}
    </>
  );
}

export function ValidatorReviewed() {
  const { state } = useEngine();
  const session = useSession();
  const done = Object.values(state.jobs).filter((j) => j.proof);
  return (
    <Card>
      <CardTitle>Reviewed</CardTitle>
      {done.length === 0 ? <Text style={type.body}>Nothing reviewed yet. Records the checker bots co-signed appear here once the proof is on chain.</Text> : null}
      {done.map((j) => (
        <View key={j.id} style={{ gap: 4 }}>
          <Row label={`Job ${jobRef(j.id, session)}`} value={j.state} sub={`${j.proof!.signers.length} of 3 bots co-signed`} />
          <Row label="Applied rate" value={litersPerHa(j.proof!.appliedRateMlPerHa)} sub={`target ${litersPerHa(j.targetRateMlPerHa)}`} />
          <Row label="Coverage" value={`${(j.proof!.coverageBps / 100).toFixed(1)}%`} />
        </View>
      ))}
      {done.length > 0 ? <Button small kind="secondary" label="Open the job story" onPress={() => router.push("/job?from=validator" as Href)} /> : null}
    </Card>
  );
}

export function ValidatorEarnings() {
  const { state } = useEngine();
  const pool = state.balances[WALLETS.validatorPool] ?? 0n;
  const settled = Object.values(state.jobs).filter((j) => j.state === "Released").length;
  return (
    <Card>
      <CardTitle>Earnings</CardTitle>
      <Row label="Validator fee pool" value={usdc(pool)} sub={lari(pool)} />
      <Row label="Fee on each settled job" value={`${Number(state.config.validatorFeeBps) / 100}%`} />
      <Row label="Jobs settled in this session" value={String(settled)} />
      <Text style={type.small}>The pool is shared by the three validator seats.</Text>
    </Card>
  );
}

export function ValidatorProfile() {
  const a = useAccount("validator");
  return (
    <Card>
      <CardTitle>Profile</CardTitle>
      {a ? <Row label="Signed in as" value={a.name} sub={`${roleLabel(a.role)} · ${a.email}`} /> : <Banner text="Not signed in. Go to the home page to create a demo account." />}
      {a?.role === "validator" ? <Row label="Your devnet address" value={shortAddr(addressFor("validator"))} /> : null}
      {VALIDATORS.map((v) => (
        <Row key={v.id} label={v.label} value={`${v.seat} seat`} />
      ))}
      <Text style={type.small}>A proof needs 2 of the 3 checker seats to co-sign. The seats run as bots in this demo; each has its own USDC stake.</Text>
    </Card>
  );
}

/** Clears this browser's demo wallets, accounts and current job. Confirms inline (no browser dialog). */
export function ResetDemo() {
  const [ask, setAsk] = useState(false);
  const doReset = () => {
    resetBurners();
    resetSessionStorage();
    signOut();
    router.replace("/");
    setTimeout(() => globalThis.location?.reload(), 60);
  };
  return (
    <Card>
      <CardTitle>Reset demo in this browser</CardTitle>
      <Text style={type.body}>Starts from zero: forgets the demo accounts, the wallets generated in this browser and the current job.</Text>
      {ask ? (
        <>
          <Banner tone="error" text="This cannot be undone. Test money left in the old wallets is not recoverable from this page." />
          <Button testID="reset-confirm" label="Yes, reset everything" kind="danger" onPress={doReset} />
          <Button label="Cancel" kind="secondary" small onPress={() => setAsk(false)} />
        </>
      ) : (
        <Button testID="reset-demo" label="Reset demo in this browser" kind="secondary" small onPress={() => setAsk(true)} />
      )}
    </Card>
  );
}
