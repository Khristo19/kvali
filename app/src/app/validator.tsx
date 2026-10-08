import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Pressable } from "@/components/ui/pressable";

import { hectares, litersPerHa } from "@/components/money";
import { Banner, Card, CardTitle, Fact, FactGrid, RoleShell, TwoUp, useTab , Button } from "@/components/ui";
import { SettleNow } from "@/components/settle-now";
import { ResetDemo, ValidatorEarnings, ValidatorProfile, ValidatorReviewed } from "@/components/tab-views";
import { notify } from "@/components/ui/notice";
import { describeJob, jobRef } from "@/session/info";
import { recordTitle } from "@/components/records";
import { setPending, usePending, useSession } from "@/session/store";
import { ChallengeCard } from "@/components/validator/challenge-card";
import { ProofCard, fullVerdict, type SampleKey } from "@/components/validator/proof-card";
import { useAccount } from "@/account/store";
import { ChainGate } from "@/components/chain-gate";
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
  const validatorAcct = useAccount("validator");
  const locked = validatorAcct ? undefined : "Sign up as a validator first (home page) to approve or refuse.";
  const [seatId, setSeatId] = useState(VALIDATORS[0].id);
  const [sigs, setSigs] = useState<Record<string, string[]>>({});
  const [refusals, setRefusals] = useState<Record<string, string>>({});
  const [votes, setVotes] = useState<Record<number, Record<string, boolean>>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [practice, setPractice] = useState(false);

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
        setNotice(null);
      } catch (e) {
        fail(e);
      }
    } else {
      setNotice(`Approval recorded for the ${seat.seat} seat. 1 more seat is needed: pick another seat and approve.`);
      notify("ok", "Approval recorded. 1 more seat is needed: pick another seat above and approve again.");
    }
  };

  // Practice records never touch the chain: approvals stay in this page.
  const practiceSign = (jobId: number, key: SampleKey) => {
    const job = state.jobs[jobId];
    if (!fullVerdict(job, key).pass) return fail(new Error("Full verdict fails; this record must be refused."));
    const k = `practice:${key}`;
    const list = Array.from(new Set([...(sigs[k] ?? []), seat.id]));
    setSigs({ ...sigs, [k]: list });
    setError(null);
    setNotice(list.length >= state.config.proofThreshold ? "Practice only: 2 seats approved, but nothing was sent to the chain." : `Practice approval recorded for the ${seat.seat} seat.`);
  };

  const refuse = (jobId: number, key: SampleKey, reason: string) => {
    setError(null);
    setNotice(`Refusal recorded: ${reason}. (Demo only: not an on-chain transaction.)`);
    if (pending?.key === key) {
      setPending({ ...pending, refusal: `${reason} (${seat.seat} seat)` });
      notify("info", "Refusal recorded in this demo (not an on-chain transaction); the proof is not submitted, so no money moves. The operator is told to send a different record.");
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
      subtitle={tab === "" ? (first ? `Job ${jobRef(first.id, session)} · ${state.config.proofThreshold} of ${state.config.validators.length} checks needed` : "Nothing to check right now") : undefined}
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
          {notice && !error && (accepted.length > 0 || challenged.length > 0) && <Banner tone="ok" text={notice} />}
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

      {accepted.map((job) => (
        <View key={job.id} style={styles.group}>
          <Text style={type.heading}>Proofs to check, job {jobRef(job.id, session)}</Text>
          {pending ? (
            <>
              <Text style={type.small}>
                The operator sent the record &ldquo;{recordTitle(pending.key)}&rdquo; (Demo: simulated drone flight). Approve it with 2 of the 3 seats; the 2nd approval submits the proof on chain, co-signed by both validators.
              </Text>
              <View style={styles.proofs}>
                <View style={styles.proofCell}>
                  <ProofCard
                    locked={locked}
                    job={job}
                    sampleKey={pending.key as SampleKey}
                    seat={seat}
                    validators={VALIDATORS}
                    signed={pending.approvals}
                    refusal={pending.refusal}
                    onSign={() => sign(job.id, pending.key as SampleKey)}
                    onRefuse={(reason) => refuse(job.id, pending.key as SampleKey, reason)}
                  />
                </View>
              </View>
            </>
          ) : (
            <Card>
              <Text style={type.body}>The operator has not sent a record yet. When they press &ldquo;Send the record to the validators&rdquo; it appears here.</Text>
            </Card>
          )}
          <Button
            small
            kind="secondary"
            label={practice ? "Hide practice records" : "Show practice records (not on chain)"}
            onPress={() => setPractice(!practice)}
          />
          {practice ? (
            <View style={styles.practice}>
              <Text style={type.subheading}>Practice records (not on chain)</Text>
              <Text style={type.small}>Four sample records to learn the checklist. Approving or refusing here changes nothing on the chain and does not affect the job.</Text>
              <View style={styles.proofs}>
                {KEYS.map((key) => (
                  <View key={key} style={styles.proofCell}>
                    <ProofCard
                    locked={locked}
                      job={job}
                      sampleKey={key}
                      seat={seat}
                      validators={VALIDATORS}
                      signed={sigs[`practice:${key}`] ?? []}
                      refusal={refusals[`practice:${key}`]}
                      onSign={() => practiceSign(job.id, key)}
                      onRefuse={(reason) => {
                        setRefusals({ ...refusals, [`practice:${key}`]: reason });
                        setNotice(`Practice refusal (${recordTitle(key)}). Nothing was sent to the chain.`);
                      }}
                    />
                  </View>
                ))}
              </View>
            </View>
          ) : null}
        </View>
      ))}

      {jobs.filter((j) => j.proof || j.payout).map((j) => (
        <View key={`done-${j.id}`} style={{ gap: 16 }}>
          <Banner
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
        <ChallengeCard key={job.id} job={job} config={state.config} votes={votes[job.id] ?? {}} onVote={(v, u) => vote(job.id, v, u)} />
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
