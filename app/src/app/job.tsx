import { useLocalSearchParams } from "expo-router";

import { useAccount } from "@/account/store";
import { SettleNow } from "@/components/settle-now";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { hectares, lariAmount, litersPerHa, usdc } from "@/components/money";
import { BigNumber, Button, Card, RoleShell, TwoUp } from "@/components/ui";
import type { ChipTone } from "@/components/ui";
import { jobLog } from "@/components/job/helpers";
import { Countdown, MoneyWent, SprayCheck, Timeline } from "@/components/job/sections";
import { Chip, Row, useTick } from "@/components/job/ui";
import { ModeBanner } from "@/components/devnet/mode-banner";
import { ChainCard } from "@/components/devnet/chain-card";
import { useActions } from "@/engine/actions";
import { SAMPLE_JOB_ID } from "@/engine/scenario";
import { windowLeft } from "@/engine/engine";
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

export default function JobStory() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const jobId = id && Number.isFinite(Number(id)) ? Number(id) : SAMPLE_JOB_ID;
  const { engine, state } = useEngine();
  const actions = useActions();
  const [error, setError] = useState<string | null>(null);
  const now = useTick();
  const account = useAccount();
  const role = account?.role ?? "farmer";

  const job = state.jobs[jobId];

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
        <Card>
          <Text style={[type.body, { color: colors.ink }]}>No job yet. Post one from the Farmer page.</Text>
          <Text style={type.body}>Presenter shortcut: posts, accepts and submits a record for you, with real transactions in Devnet mode.</Text>
          <Button label="Presenter: run the whole job automatically" onPress={runDemo} />
          {error && <Text style={styles.error}>{error}</Text>}
        </Card>
      </RoleShell>
    );
  }

  const remaining = windowLeft(job, now);
  const entries = jobLog(state.log, job);
  const base = job.postedAt;
  const ended = job.payout !== null;

  return (
    <RoleShell role={role} active={-1} title="Job story" subtitle={`Job #${job.id}`}>
      <ModeBanner />

      <Card>
        <View style={styles.head}>
          <Text style={type.heading}>Job #{job.id}</Text>
          <Chip label={job.state} tone={STATE_TONE[job.state]} />
        </View>
        <Row left="Field" right={hectares(job.areaCha)} />
        <Row left="Target" right={`${litersPerHa(job.targetRateMlPerHa)} ± ${job.toleranceBps / 100}%`} />
        <BigNumber caption="Price" value={lariAmount(job.amount)} sub={`${usdc(job.amount)} USDC`} />
      </Card>

      {job.state === "ProofSubmitted" && (
        <Countdown secs={remaining} total={state.config.challengeWindowSecs} />
      )}
      <SettleNow job={job} />
      {!ended && (job.state === "Posted" || job.state === "Accepted") && (
        <Button label="Presenter: run the rest of the job automatically" onPress={runDemo} />
      )}
      {error && <Text style={styles.error}>{error}</Text>}

      <TwoUp>
        <Timeline entries={entries} base={base} />
        <View style={{ gap: 16 }}>
          <SprayCheck job={job} config={state.config} />
          <MoneyWent job={job} />
          <ChainCard />
        </View>
      </TwoUp>
    </RoleShell>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: space.md },
  error: { ...type.body, color: colors.error },
});
