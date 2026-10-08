import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { hectares, litersPerHa } from "@/components/money";
import { Banner, Card, CardTitle, Fact, FactGrid, RoleShell, TwoUp, useTab } from "@/components/ui";
import { SettleNow } from "@/components/settle-now";
import { ValidatorEarnings, ValidatorProfile, ValidatorReviewed } from "@/components/tab-views";
import { notify } from "@/components/ui/notice";
import { describeJob, jobRef } from "@/session/info";
import { recordTitle } from "@/components/records";
import { setPending, usePending, useSession } from "@/session/store";
import { ChallengeCard } from "@/components/validator/challenge-card";
import { ProofCard, fullVerdict, type SampleKey } from "@/components/validator/proof-card";
import { ModeBanner } from "@/components/devnet/mode-banner";
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
  const [seatId, setSeatId] = useState(VALIDATORS[0].id);
  const [sigs, setSigs] = useState<Record<string, string[]>>({});
  const [refusals, setRefusals] = useState<Record<string, string>>({});
  const [votes, setVotes] = useState<Record<number, Record<string, boolean>>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const seat = VALIDATORS.find((v) => v.id === seatId)!;
  const jobs = Object.values(state.jobs);
  const accepted = jobs.filter((j) => j.state === "Accepted");
  const challenged = jobs.filter((j) => j.state === "Challenged");

  const fail = (e: unknown) => {
    setNotice(null);
    setError(e instanceof EngineError ? `${e.code}: ${e.message}` : e instanceof Error ? e.message : String(e));
  };

  const sign = async (jobId: number, key: SampleKey) => {
    setError(null);
    const k = `${jobId}:${key}`;
    const job = state.jobs[jobId];
    // Validators run the FULL verdict before signing.
    if (!fullVerdict(job, key).pass) return fail(new Error("Full verdict fails; this record must be refused."));
    const isPending = pending?.key === key;
    const list = Array.from(new Set([...(isPending ? pending.approvals : (sigs[k] ?? [])), seat.id]));
    if (isPending) setPending({ ...pending, approvals: list, refusal: undefined });
    else setSigs({ ...sigs, [k]: list });
    if (list.length >= state.config.proofThreshold) {
      try {
        await actions.submitRecord(key, jobId, list);
        setNotice(`Job ${jobId}: ${list.length} seats approved, proof submitted on chain. The challenge window is open.`);
      } catch (e) {
        fail(e);
      }
    } else {
      setNotice(`Approval recorded for the ${seat.seat} seat. 1 more seat is needed: pick another seat and approve.`);
      notify("ok", "Approval recorded. 1 more seat is needed: pick another seat above and approve again.");
    }
  };

  const refuse = (jobId: number, key: SampleKey, reason: string) => {
    setError(null);
    setNotice(`Refusal recorded for ${key}.`);
    if (pending?.key === key) {
      setPending({ ...pending, refusal: `${reason} (${seat.seat} seat)` });
      notify("info", "Refusal recorded. Nothing is sent to the chain; the operator is told to submit a different record.");
    }
    setRefusals({ ...refusals, [`${jobId}:${key}`]: reason });
  };

  const vote = async (jobId: number, v: Validator, uphold: boolean) => {
    setError(null);
    const next = { ...(votes[jobId] ?? {}), [v.id]: uphold };
    setVotes({ ...votes, [jobId]: next });
    const agree = Object.entries(next).filter(([, u]) => u === uphold).map(([id]) => id);
    if (agree.length >= state.config.panelThreshold) {
      try {
        await actions.resolveChallenge(agree, jobId, uphold);
        setNotice(uphold ? `Job ${jobId}: challenge upheld, farmer refunded.` : `Job ${jobId}: challenge rejected, operator paid.`);
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
      subtitle={tab === "" ? (first ? `Job ${jobRef(first.id, session)} · ${state.config.proofThreshold} of ${state.config.validators.length} checks needed` : "Nothing to check right now") : undefined}
    >
      <ModeBanner />
      {tab === "reviewed" && <ValidatorReviewed />}
      {tab === "earnings" && <ValidatorEarnings />}
      {tab === "profile" && <ValidatorProfile />}
      {tab === "" && (
        <>

      <TwoUp>
        <Card>
          <CardTitle>Your seat</CardTitle>
          {VALIDATORS.map((v) => (
            <Pressable
              key={v.id}
              accessibilityRole="radio"
              accessibilityLabel={`${v.label}, ${v.seat} seat`}
              accessibilityState={{ selected: v.id === seatId }}
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
          {accepted.length === 0 && challenged.length === 0 && (
            <Card>
              <Text style={type.body}>No job to check yet: post one from the Farmer page and accept it from the Operator page.</Text>
            </Card>
          )}
          {accepted.map((job) => (
            <Card key={`sum-${job.id}`}>
              <CardTitle>Job {jobRef(job.id, session)}</CardTitle>
              <FactGrid>
                <Fact label="Field" value={`${describeJob(job, session).field}, ${hectares(job.areaCha)}`} />
                <Fact label="Drone" value={DRONE.model} />
                <Fact label="Spray by" value={new Date(job.sprayDeadline * 1000).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} />
                <Fact label="Product" value={describeJob(job, session).product} />
                <Fact label="Target" value={`${litersPerHa(job.targetRateMlPerHa)} ± ${job.toleranceBps / 100}%`} />
              </FactGrid>
            </Card>
          ))}
        </View>
      </TwoUp>

      {accepted.map((job) => {
        const queue = pending ? ([pending.key] as SampleKey[]) : KEYS;
        return (
          <View key={job.id} style={styles.group}>
            <Text style={type.heading}>Proofs to check, job {jobRef(job.id, session)}</Text>
            <Text style={type.small}>
              {pending
                ? `The operator sent the record "${recordTitle(pending.key)}" (Demo: simulated drone flight). Approve it with 2 of the 3 seats; the 2nd approval submits the proof on chain, co-signed by both validators.`
                : "The operator has not sent a record yet. Demo queue: 4 sample spray records checked against this job. Each runs the full verdict first."}
            </Text>
            <View style={styles.proofs}>
              {queue.map((key) => (
                <View key={key} style={styles.proofCell}>
                  <ProofCard
                    job={job}
                    sampleKey={key}
                    seat={seat}
                    validators={VALIDATORS}
                    signed={pending?.key === key ? pending.approvals : (sigs[`${job.id}:${key}`] ?? [])}
                    refusal={pending?.key === key ? pending.refusal : refusals[`${job.id}:${key}`]}
                    onSign={() => sign(job.id, key)}
                    onRefuse={(reason) => refuse(job.id, key, reason)}
                  />
                </View>
              ))}
            </View>
          </View>
        );
      })}

      {jobs.filter((j) => j.state === "ProofSubmitted").map((j) => (
        <View key={`done-${j.id}`} style={{ gap: 16 }}>
          <Banner tone="ok" text={`Job ${jobRef(j.id, session)}: the proof is on chain with ${j.proof?.signers.length ?? 0} validator co-signatures.`} />
          <SettleNow job={j} />
        </View>
      ))}

      {challenged.length > 0 && <Text style={type.heading}>Challenges</Text>}
      {challenged.map((job) => (
        <ChallengeCard key={job.id} job={job} config={state.config} votes={votes[job.id] ?? {}} onVote={(v, u) => vote(job.id, v, u)} />
      ))}
        </>
      )}
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
  group: { gap: space.lg },
  proofs: { flexDirection: "row", flexWrap: "wrap", gap: space.lg },
  proofCell: { flexGrow: 1, flexBasis: 340, minWidth: 0 },
});
