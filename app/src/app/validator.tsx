import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Pressable } from "@/components/ui/pressable";

import { hectares, litersPerHa } from "@/components/money";
import { Banner, Card, CardTitle, Fact, FactGrid, RoleShell, TwoUp, useTab , Button } from "@/components/ui";
import { SettleNow } from "@/components/settle-now";
import { ResetDemo, ValidatorEarnings, ValidatorProfile, ValidatorReviewed } from "@/components/tab-views";
import { notify } from "@/components/ui/notice";
import { describeJob, jobRef } from "@/session/info";
import { usePending, useSession } from "@/session/store";
import { ChallengeCard } from "@/components/validator/challenge-card";
import { ProofCard, type SampleKey } from "@/components/validator/proof-card";
import { BotVerdicts } from "@/components/validator/bot-card";
import { StakeCards } from "@/components/validator/stake-card";
import { useMode } from "@/devnet/mode";
import { useAccount } from "@/account/store";
import { ChainGate } from "@/components/chain-gate";
import { ModeBanner } from "@/components/devnet/mode-banner";
import { setSeat, useSeat } from "@/devnet/multi";
import { useActions } from "@/engine/actions";
import { useEngine } from "@/engine/useEngine";
import { DRONE, VALIDATORS, sampleRecords } from "@/engine/scenario";
import { EngineError, type Validator } from "@/engine/types";
import { colors, radius, space, type } from "@/theme";

const KEYS = Object.keys(sampleRecords) as SampleKey[];

export default function ValidatorScreen() {
  const { state } = useEngine();
  const actions = useActions();
  const tab = useTab("validator");
  const pending = usePending();
  const session = useSession();
  const validatorAcct = useAccount("validator");
  const locked = validatorAcct ? undefined : "Sign up as a validator first (home page) to add stake.";
  const seatId = useSeat(); // persisted on staging (account switcher), starts at the first seat on live
  const setSeatId = setSeat;
  const [votes, setVotes] = useState<Record<number, Record<string, boolean>>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [practice, setPractice] = useState(false);
  const [spot, setSpot] = useState(false);
  const devnet = useMode() === "devnet";

  const jobs = Object.values(state.jobs);
  const accepted = jobs.filter((j) => j.state === "Accepted");
  const challenged = jobs.filter((j) => j.state === "Challenged");
  const current = jobs[0];
  const spotKey = (session?.bots?.key ?? session?.recordKey ?? pending?.key) as SampleKey | undefined;

  const fail = (e: unknown) => {
    setNotice(null);
    setError(e instanceof EngineError ? `${e.code}: ${e.message}` : e instanceof Error ? e.message : String(e));
  };

  const vote = async (jobId: number, v: Validator, uphold: boolean) => {
    setError(null);
    const next = { ...(votes[jobId] ?? {}), [v.id]: uphold };
    setVotes({ ...votes, [jobId]: next });
    const agree = Object.entries(next).filter(([, u]) => u === uphold).map(([id]) => id);
    if (agree.length >= state.config.panelThreshold) {
      try {
        await actions.resolveChallenge(agree, jobId, uphold);
        setNotice(null);
      } catch (e) {
        fail(e);
      }
    } else {
      setNotice("Vote recorded. 1 more matching vote needed.");
    }
  };

  const first = accepted[0] ?? challenged[0];
  return (
    <RoleShell
      role="validator"
      title={tab === "" ? "Proof review" : tab === "reviewed" ? "Reviewed" : tab === "earnings" ? "Earnings" : "Profile"}
      subtitle={tab === "" ? (first ? `Job ${jobRef(first.id, session)} · checker bots: ${state.config.proofThreshold} of ${state.config.validators.length} must co-sign` : "Nothing to check right now") : undefined}
    >
      <ModeBanner />
      <ChainGate>
      {tab === "reviewed" && <ValidatorReviewed />}
      {tab === "earnings" && <ValidatorEarnings />}
      {tab === "profile" && (
        <>
          <ValidatorProfile />
          <ResetDemo />
        </>
      )}
      {tab === "" && (
        <>

      <TwoUp>
        <Card>
          <CardTitle>Your seat</CardTitle>
          {VALIDATORS.map((v) => (
            <Pressable
              key={v.id}
              testID={`seat-${v.seat}`}
              accessibilityRole="radio"
              accessibilityLabel={`${v.label}, ${v.seat} seat`}
              aria-checked={v.id === seatId}
              onPress={() => setSeatId(v.id)}
              style={[styles.seat, v.id === seatId && styles.seatOn]}
            >
              <Text style={[type.body, styles.seatText, v.id === seatId && { fontWeight: "700", color: colors.ink }]}>
                {v.label} ({v.seat})
              </Text>
              <View style={[styles.dot, v.id === seatId && styles.dotOn]} />
            </Pressable>
          ))}
          <Text style={type.small}>Validators share a {Number(state.config.validatorFeeBps) / 100}% fee pool on every settled job.</Text>
        </Card>
        <View style={{ gap: 16 }}>
          {error && (
            <View style={styles.error} accessibilityRole="alert">
              <Text style={[type.body, { color: colors.error, flexShrink: 1 }]}>{error}</Text>
            </View>
          )}
          {notice && !error && <Banner tone="ok" text={notice} />}
          {!current && (
            <Card>
              <Text style={type.body}>No job to check yet: post one from the Farmer page and accept it from the Operator page.</Text>
            </Card>
          )}
          {current && (
            <Card key={`sum-${current.id}`}>
              <CardTitle>Job {jobRef(current.id, session)}</CardTitle>
              <FactGrid>
                <Fact label="Field" value={`${describeJob(current, session).field}, ${hectares(current.areaCha)}`} />
                <Fact label="Drone" value={DRONE.model} />
                <Fact label="Spray by" value={new Date(current.sprayDeadline * 1000).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} />
                <Fact label="Product" value={describeJob(current, session).product} />
                <Fact label="Target" value={`${litersPerHa(current.targetRateMlPerHa)} ± ${current.toleranceBps / 100}%`} />
              </FactGrid>
            </Card>
          )}
        </View>
      </TwoUp>

      <BotVerdicts session={session} job={current} />
      <StakeCards locked={locked} />

      {current && (spotKey || accepted.length > 0) ? (
        <View style={styles.group}>
          <Button testID="spot-toggle" small kind="secondary" label={spot ? "Hide the spot-check view" : "Spot-check the record (checklist, flight vs field)"} onPress={() => setSpot(!spot)} />
          {spot && spotKey ? (
            <View style={styles.proofs}>
              <View style={styles.proofCell}>
                <ProofCard job={current} sampleKey={spotKey} note="Read-only: the bots already ran these checks. Use this view to spot-check the flight against the field." />
              </View>
            </View>
          ) : null}
          {spot && !spotKey ? (
            <Card>
              <Text style={type.body}>No record to look at yet.</Text>
            </Card>
          ) : null}
        </View>
      ) : null}
      {current && current.state === "Accepted" ? (
        <View style={styles.group}>
          <Button testID="practice-toggle" small kind="secondary" label={practice ? "Hide practice records" : "Show practice records (not on chain)"} onPress={() => setPractice(!practice)} />
          {practice ? (
            <View style={styles.practice}>
              <Text style={type.subheading}>Practice records (not on chain)</Text>
              <Text style={type.small}>Four sample records to learn the checklist. Nothing here touches the chain.</Text>
              <View style={styles.proofs}>
                {KEYS.map((key) => (
                  <View key={key} style={styles.proofCell}>
                    <ProofCard job={current} sampleKey={key} />
                  </View>
                ))}
              </View>
            </View>
          ) : null}
        </View>
      ) : null}

      {jobs.filter((j) => j.proof || j.payout).map((j) => (
        <View key={`done-${j.id}`} style={{ gap: 16 }}>
          <Banner
            testID="validator-job-banner"
            tone="ok"
            text={
              j.state === "ProofSubmitted"
                ? `Job ${jobRef(j.id, session)}: the proof is on chain with ${j.proof?.signers.length ?? 0} validator co-signatures. Waiting for the challenge window.`
                : j.state === "Challenged"
                  ? `Job ${jobRef(j.id, session)}: the farmer challenged it. See Challenges below.`
                  : j.state === "Released"
                    ? `Job ${jobRef(j.id, session)}: settled. The operator was paid.`
                    : `Job ${jobRef(j.id, session)}: ended (${j.state}).`
            }
          />
          <SettleNow job={j} />
        </View>
      ))}

      {challenged.length > 0 && <Text style={type.heading}>Challenges</Text>}
      {challenged.map((job) => (
        <ChallengeCard key={job.id} job={job} config={state.config} votes={votes[job.id] ?? {}} onVote={(v, u) => vote(job.id, v, u)} upholdOff={devnet ? "Switched off in the public demo: upholding would slash the shared demo validators' stakes. Slashing is proven by the program tests." : undefined} />
      ))}
        </>
      )}
      </ChainGate>
    </RoleShell>
  );
}

const styles = StyleSheet.create({
  error: { borderWidth: 1, borderColor: colors.error, backgroundColor: colors.card, borderRadius: radius.md, padding: space.md },
  seat: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.md,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  seatOn: { borderColor: colors.green, borderWidth: 2 },
  seatText: { flex: 1, flexShrink: 1 },
  dot: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.card },
  dotOn: { borderWidth: 8, borderColor: colors.green },
  practice: { gap: space.md, padding: space.md, borderRadius: radius.lg, borderWidth: 1, borderStyle: "dashed", borderColor: colors.border },
  group: { gap: space.lg },
  proofs: { flexDirection: "row", flexWrap: "wrap", gap: space.lg },
  proofCell: { flexGrow: 1, flexBasis: 340, minWidth: 0 },
});
