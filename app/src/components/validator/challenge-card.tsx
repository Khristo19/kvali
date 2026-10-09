import { StyleSheet, Text, View } from "react-native";

import { Card, CardTitle } from "@/components/ui";
import { hectares, lari, litersPerHa, usdc } from "@/components/money";
import type { Config, Job, Validator } from "@/engine/types";
import { colors, space, type } from "@/theme";
import { Btn } from "./ui";
import { jobRef } from "@/session/info";
import { useSession } from "@/session/store";

export function ChallengeCard({
  job,
  config,
  votes,
  onVote,
  upholdOff,
}: {
  job: Job;
  config: Config;
  /** seat id -> true = uphold, false = reject */
  votes: Record<string, boolean>;
  onVote: (seat: Validator, uphold: boolean) => void;
  /** Why Uphold is disabled (public devnet demo: upholding would slash the shared demo validators). */
  upholdOff?: string;
}) {
  const session = useSession();
  const c = job.challenge;
  const p = job.proof;
  if (!c || !p) return null;
  const panelFee = (job.amount * config.panelFeeBps) / 10_000n;
  return (
    <Card>
      <CardTitle>Job {jobRef(job.id, session)} challenged</CardTitle>
      <Text style={type.body}>Farmer evidence hash: {c.evidenceHash}</Text>
      <Text style={type.body}>
        Bond: {usdc(c.bond)} ({lari(c.bond)})
      </Text>
      <Text style={type.body}>
        Proof: {(p.litersMl / 1000).toFixed(1)} L over {hectares(p.areaCoveredCha)}, {litersPerHa(p.appliedRateMlPerHa)} applied
        (target {litersPerHa(job.targetRateMlPerHa)}), coverage {(p.coverageBps / 100).toFixed(1)}%
      </Text>
      <Text style={type.small}>2 of 3 panel votes needed. Panel fee: {config.panelFeeBps / 100n}% of the job = {usdc(panelFee)}, paid by the loser.</Text>
      {config.validators.map((v) => {
        const vote = votes[v.id];
        return (
          <View key={v.id} style={styles.seat}>
            <Text style={[type.body, styles.name]}>
              {v.label}
              {vote === undefined ? "" : vote ? ": Uphold" : ": Reject"}
            </Text>
            <View style={styles.actions}>
              <Btn label={`Uphold (${v.seat})`} kind={vote === true ? "primary" : "ghost"} disabled={!!upholdOff} hint={upholdOff} onPress={() => onVote(v, true)} />
              <Btn label={`Reject (${v.seat})`} kind={vote === false ? "primary" : "ghost"} onPress={() => onVote(v, false)} />
            </View>
          </View>
        );
      })}
      {upholdOff ? <Text style={type.small}>{upholdOff}</Text> : null}
      <Text style={type.small}>
        Uphold: the farmer was right, so the farmer gets the money back and the operator bond is lost. Reject: the proof stands, so the
        operator is paid and the farmer loses the challenge bond.
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  seat: { gap: space.xs, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space.sm },
  name: { fontWeight: "600" },
  actions: { gap: space.sm },
});
