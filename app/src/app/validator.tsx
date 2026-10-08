import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { hectares, litersPerHa } from "@/components/money";
import { Banner, Card, CardTitle, Fact, FactGrid, RoleShell, TwoUp } from "@/components/ui";
import { ChallengeCard } from "@/components/validator/challenge-card";
import { ProofCard, fullVerdict, type SampleKey } from "@/components/validator/proof-card";
import { ModeBanner } from "@/components/devnet/mode-banner";
import { useActions } from "@/engine/actions";
import { useEngine } from "@/engine/useEngine";
import { DRONE, SAMPLE_JOB_ID, VALIDATORS, sampleJob, sampleRecords } from "@/engine/scenario";
import { EngineError, type Validator } from "@/engine/types";
import { colors, radius, space, type } from "@/theme";

const KEYS = Object.keys(sampleRecords) as SampleKey[];

export default function ValidatorScreen() {
  const { state } = useEngine();
  const actions = useActions();
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
    const list = Array.from(new Set([...(sigs[k] ?? []), seat.id]));
    setSigs({ ...sigs, [k]: list });
    if (list.length >= state.config.proofThreshold) {
      try {
        await actions.submitRecord(key, jobId, list);
        setNotice(`Job ${jobId}: ${list.length} seats signed, proof submitted. The challenge window is open.`);
      } catch (e) {
        fail(e);
      }
    } else {
      setNotice("Signature collected. 1 more needed.");
    }
  };

  const refuse = (jobId: number, key: SampleKey, reason: string) => {
    setError(null);
    setNotice(`Refusal recorded for ${key}.`);
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
  const raw = sampleJob.raw as { region?: string; product?: { label?: string } };
  return (
    <RoleShell
      role="validator"
      active={0}
      title="Proof review"
      subtitle={first ? `Job #${first.id} · ${state.config.proofThreshold} of ${state.config.validators.length} checks needed` : "Nothing to check right now"}
    >
      <ModeBanner />

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
              <Text style={type.body}>No job to check yet — post one from the Farmer screen and accept it from the Operator screen.</Text>
            </Card>
          )}
          {accepted.map((job) => (
            <Card key={`sum-${job.id}`}>
              <CardTitle>Job #{job.id}</CardTitle>
              <FactGrid>
                <Fact label="Field" value={`${hectares(job.areaCha)}${job.id === SAMPLE_JOB_ID && raw.region ? `, ${raw.region.split(",")[0]}` : ""}`} />
                <Fact label="Drone" value={DRONE.model} />
                <Fact label="Product" value={job.id === SAMPLE_JOB_ID ? ((raw.product?.label ?? "").split("(")[0].trim() || "Spray product") : "Spray product"} />
                <Fact label="Target" value={`${litersPerHa(job.targetRateMlPerHa)} ± ${job.toleranceBps / 100}%`} />
              </FactGrid>
            </Card>
          ))}
        </View>
      </TwoUp>

      {accepted.map((job) => (
        <View key={job.id} style={styles.group}>
          <Text style={type.heading}>Proofs to check, job {job.id}</Text>
          <Text style={type.small}>Demo queue: 4 sample spray records checked against this job. Each runs the full verdict first.</Text>
          <View style={styles.proofs}>
            {KEYS.map((key) => (
              <View key={key} style={styles.proofCell}>
                <ProofCard
                  job={job}
                  sampleKey={key}
                  seat={seat}
                  validators={VALIDATORS}
                  signed={sigs[`${job.id}:${key}`] ?? []}
                  refusal={refusals[`${job.id}:${key}`]}
                  onSign={() => sign(job.id, key)}
                  onRefuse={(reason) => refuse(job.id, key, reason)}
                />
              </View>
            ))}
          </View>
        </View>
      ))}

      {challenged.length > 0 && <Text style={type.heading}>Challenges</Text>}
      {challenged.map((job) => (
        <ChallengeCard key={job.id} job={job} config={state.config} votes={votes[job.id] ?? {}} onVote={(v, u) => vote(job.id, v, u)} />
      ))}
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
