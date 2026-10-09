import { StyleSheet, Text, View } from "react-native";

import { recordTitle } from "@/components/records";
import { Banner, Card, CardTitle, Icon } from "@/components/ui";
import { ExtLink } from "@/components/ui/ext-link";
import { explorerTx } from "@/devnet/client";
import type { Job } from "@/engine/types";
import type { Session } from "@/session/store";
import { colors, space, type } from "@/theme";
import { CheckList } from "./check-list";

/** "Bot verdicts": what each checker bot checked and signed, with the transaction link. Humans do certificates, spot checks and challenges. */
export function BotVerdicts({ session, job }: { session: Session | null; job: Job | undefined }) {
  const run = session?.bots;
  const submitSig = run?.sig ?? [...(session?.txs ?? [])].reverse().find((t) => t.action === "submitProof")?.sig;
  return (
    <Card testID="bot-verdicts">
      <CardTitle>Bot verdicts</CardTitle>
      <Text style={type.body}>
        The arithmetic is automatic: when an operator submits a spray record, the three checker bots (the validator seats) each run the same checks. If
        it passes, 2 of 3 co-sign and the proof goes on chain by itself. People only issue certificates, spot-check records and judge challenges.
      </Text>
      {!run && !job?.proof ? <Text style={type.body}>No record yet. When the operator sends one, the bots check it here.</Text> : null}
      {run ? (
        <>
          <Text style={type.subheading}>Record: {recordTitle(run.key)}</Text>
          <Text style={type.small}>What every bot checked:</Text>
          <CheckList checks={run.checks} />
          <Banner
            testID="bot-outcome"
            tone={run.pass ? "ok" : "error"}
            text={
              run.pass
                ? `All checks pass. ${run.bots.filter((b) => b.signed).length} of 3 bots co-signed and the proof was submitted on chain.`
                : `Refused: ${run.reason ?? "checks failed"}. Nothing was signed and nothing was paid.`
            }
          />
          {run.bots.map((b) => (
            <View key={b.id} style={styles.bot} testID={`bot-row-${b.seat}`}>
              <View style={[styles.mark, b.pass ? styles.markOn : styles.markOff]}>{b.pass ? <Icon name="check" color={colors.card} size={16} /> : null}</View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[type.body, { fontWeight: "600", color: colors.ink }]}>{b.label}</Text>
                <Text style={type.small}>
                  {b.pass ? (b.signed ? "Checks passed. Co-signed." : "Checks passed. Not needed: 2 of 3 had already signed.") : "Checks failed. Refused to sign."}
                </Text>
                {b.signed && submitSig ? (
                  <ExtLink testID="bot-tx-link" url={explorerTx(submitSig)} style={styles.link}>
                    Co-sign transaction on Explorer
                  </ExtLink>
                ) : null}
              </View>
            </View>
          ))}
        </>
      ) : null}
      {!run && job?.proof ? (
        <>
          <Text style={type.body}>The proof on chain carries {job.proof.signers.length} validator co-signatures.</Text>
          {submitSig ? (
            <ExtLink testID="bot-tx-link" url={explorerTx(submitSig)} style={styles.link}>
              Co-sign transaction on Explorer
            </ExtLink>
          ) : null}
        </>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  bot: { flexDirection: "row", gap: space.md, alignItems: "flex-start", paddingTop: space.sm, borderTopWidth: 1, borderTopColor: colors.border },
  mark: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, alignItems: "center", justifyContent: "center", marginTop: 2 },
  markOn: { backgroundColor: colors.green, borderColor: colors.green },
  markOff: { borderColor: colors.error, backgroundColor: colors.card },
  link: { ...type.small, color: colors.accent, textDecorationLine: "underline" },
});
