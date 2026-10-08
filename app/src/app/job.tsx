import { router, useLocalSearchParams } from "expo-router";

import { LiveLeft } from "@/components/live-clock";
import { ChainGate } from "@/components/chain-gate";

import { describeJob, jobRef } from "@/session/info";
import { useSession } from "@/session/store";
import { useAccount } from "@/account/store";
import { SettleNow } from "@/components/settle-now";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { hectares, lariAmount, litersPerHa, usdc } from "@/components/money";
import { BigNumber, Button, Card, RoleShell, TwoUp } from "@/components/ui";
import type { ChipTone } from "@/components/ui";
import { jobLog } from "@/components/job/helpers";
import { Countdown, MoneyWent, SprayCheck, Timeline } from "@/components/job/sections";
import { Chip, Row, TxId } from "@/components/job/ui";
import { ModeBanner } from "@/components/devnet/mode-banner";
import { ChainCard } from "@/components/devnet/chain-card";
import { useActions } from "@/engine/actions";
import { SAMPLE_JOB_ID } from "@/engine/scenario";
import { useEngine } from "@/engine/useEngine";
import type { JobState } from "@/engine/types";
import { colors, space, type } from "@/theme";

const STATE_TONE: Record<JobState, ChipTone> = {
  Posted: "muted",
  Accepted: "muted",
  ProofSubmitted: "orange",
  Challenged: "orange",
  Released: "green",
  Refunded: "green",
  Cancelled: "muted",
};

/** The job is shared by all roles: links to each role's page. */
function RoleLinks() {
  return (
    <View style={styles.links}>
      <Text style={type.label}>Open this demo as:</Text>
      <View style={styles.linkRow}>
        {([["Farmer", "/farmer"], ["Drone operator", "/operator"], ["Validator", "/validator"], ["Home", "/"]] as const).map(([label, href]) => (
          <View key={label} style={{ flexGrow: 1, flexBasis: 140 }}>
            <Button small kind="secondary" label={label} onPress={() => router.replace(href)} />
          </View>
        ))}
      </View>
    </View>
  );
}

export default function JobStory() {
  const { id, from } = useLocalSearchParams<{ id?: string; from?: string }>();
  const jobId = id && Number.isFinite(Number(id)) ? Number(id) : SAMPLE_JOB_ID;
  const { engine, state } = useEngine();
  const actions = useActions();
  const [error, setError] = useState<string | null>(null);
  const session = useSession();
  // Neutral page: the job is shared by all roles. Only show a role's nav if the page was opened from that role.
  const role = from === "farmer" || from === "operator" || from === "validator" ? from : undefined;

  const job = state.jobs[jobId];

  const farmerAcct = useAccount("farmer");
  const operatorAcct = useAccount("operator");
  const run = async (fn: () => Promise<void>) => {
    try {
      setError(null);
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    }
  };

  // Moves the sample job forward from wherever it is, so one tap fills the timeline.
  const runDemo = () =>
    run(async () => {
      if (!state.jobs[jobId]) await actions.postJob(jobId);
      if (engine.getState().jobs[jobId].state === "Posted") await actions.acceptJob(jobId);
      if (engine.getState().jobs[jobId].state === "Accepted") await actions.submitRecord("honest", jobId);
    });

  if (!job) {
    return (
      <RoleShell role={role} active={-1} title="Job story" subtitle="Every step, in plain words">
        <RoleLinks />
        <ChainGate>
        <Card>
          <Text style={[type.body, { color: colors.ink }]}>No job yet. Post one from the Farmer page.</Text>
          <Text style={type.body}>Presenter shortcut: posts, accepts and submits a record for you, with real transactions in Devnet mode.</Text>
          <Button
            label="Presenter: run the whole job automatically"
            onPress={runDemo}
            disabled={!farmerAcct || !operatorAcct}
            hint={!farmerAcct || !operatorAcct ? "Sign up as a farmer and as a drone operator first (home page)." : undefined}
          />
          {!farmerAcct || !operatorAcct ? <Text style={type.small}>Sign up as a farmer and as a drone operator first (home page).</Text> : null}
          {error && <Text style={styles.error}>{error}</Text>}
        </Card>
        </ChainGate>
      </RoleShell>
    );
  }

  const entries = jobLog(state.log, job);
  const base = job.postedAt;
  const cert = job.operator !== null ? state.log.find((l) => l.action === "issueCertificate") : undefined;
  const ended = job.payout !== null;

  return (
    <RoleShell role={role} active={-1} title="Job story" subtitle={`${describeJob(job, session).field} · job ${jobRef(job.id, session)}`}>
      <RoleLinks />
      <ModeBanner />
      <ChainGate>
      <Card>
        <View style={styles.head}>
          <Text style={type.heading}>Job {jobRef(job.id, session)}</Text>
          <Chip label={job.state} tone={STATE_TONE[job.state]} />
        </View>
        <Row left="Field" right={`${describeJob(job, session).field}, ${hectares(job.areaCha)}`} />
        <Row left="Product" right={describeJob(job, session).product} />
        <Row left="Target" right={`${litersPerHa(job.targetRateMlPerHa)} ± ${job.toleranceBps / 100}%`} />
        <BigNumber caption="Price" value={lariAmount(job.amount)} sub={`${usdc(job.amount)} USDC`} />
      </Card>

      {job.state === "ProofSubmitted" && (
        <LiveLeft endsAt={job.proof?.windowEndsAt ?? 0} render={(remaining) => <Countdown secs={remaining} total={state.config.challengeWindowSecs} />} />
      )}
      <SettleNow job={job} />
      {!ended && (job.state === "Posted" || job.state === "Accepted") && (
        <Button label="Presenter: run the rest of the job automatically" onPress={runDemo} />
      )}
      {error && <Text style={styles.error}>{error}</Text>}

      <TwoUp>
        <View style={{ gap: 16 }}>
          <Timeline entries={entries} base={base} />
          {cert ? (
            <Card>
              <Text style={type.subheading}>Before the job</Text>
              <Text style={type.body}>The operator&apos;s drone calibration certificate was issued by a validator.</Text>
              <TxId tx={cert.tx} />
            </Card>
          ) : null}
        </View>
        <View style={{ gap: 16 }}>
          <SprayCheck job={job} config={state.config} />
          <MoneyWent job={job} />
          <ChainCard />
        </View>
      </TwoUp>
      </ChainGate>
    </RoleShell>
  );
}

const styles = StyleSheet.create({
  links: { gap: 6 },
  linkRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: space.md },
  error: { ...type.body, color: colors.error },
});
