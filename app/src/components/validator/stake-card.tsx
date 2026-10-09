import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { LiveLeft } from "@/components/live-clock";
import { clock, usdc } from "@/components/money";
import { Button, Card, CardTitle, ErrorText } from "@/components/ui";
import { notify } from "@/components/ui/notice";
import { explorerAddr, readStakes, readStakingParams, stakeMore, type StakeInfo, type StakingParams } from "@/devnet/client";
import { friendlyMessage } from "@/devnet/rpc";
import { useDevnetState } from "@/devnet/mode";
import { VALIDATORS } from "@/engine/scenario";
import { colors, radius, space, type } from "@/theme";
import { ExtLink } from "@/components/ui/ext-link";

const ADD = 100_000_000n; // "Stake more" adds $100 of test USDC
const IDS = VALIDATORS.map((v) => v.id);

type Status = "active" | "unstaking" | "slashed" | "not staked";
export const statusOf = (s: StakeInfo | null | undefined): Status => (!s ? "not staked" : s.slashed ? "slashed" : s.unstakeRequestedAt > 0 ? "unstaking" : s.amount > 0n ? "active" : "not staked");

/** Stakes of the three checker seats, re-read every 15 s while the card is on screen. */
function useStakes() {
  const [stakes, setStakes] = useState<Record<string, StakeInfo | null> | null>(null);
  const [params, setParams] = useState<StakingParams | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const [s, p] = await Promise.all([readStakes(IDS), readStakingParams()]);
      setStakes(s);
      setParams(p);
      setError(null);
    } catch (e) {
      setError(friendlyMessage(e instanceof Error ? e.message : "Could not read the stakes."));
    }
  }, []);
  useEffect(() => {
    void load();
    const id = setInterval(() => {
      if (typeof document === "undefined" || document.visibilityState !== "hidden") void load();
    }, 15000);
    return () => clearInterval(id);
  }, [load]);
  return { stakes, params, error, reload: load };
}

/** One "Stake" card for the three checker seats: staked amount, status, proofs co-signed, open co-signs. */
export function StakeCards({ locked }: { locked?: string }) {
  const dev = useDevnetState();
  const { stakes, params, error, reload } = useStakes();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  if (dev.mode !== "devnet") return null;

  const add = async (id: string) => {
    setBusy(id);
    setErr(null);
    try {
      await stakeMore(id, ADD);
      notify("ok", "Stake added: $100.00 test USDC locked in the stake vault.");
      await reload();
    } catch (e) {
      setErr(friendlyMessage(e instanceof Error ? e.message : "Could not add stake."));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card testID="stake-card">
      <CardTitle>Stake</CardTitle>
      <Text style={type.body}>Checkers lock their own USDC. If a panel rules that a proof they signed was false, their stake goes to the farmer and they lose their seat.</Text>
      {params ? (
        <Text style={type.small} testID="stake-min">
          {params.minStake > 0n ? `Minimum stake to co-sign: ${usdc(params.minStake)}.` : "No minimum stake is required yet."} Unstaking waits {params.cooldownSecs >= 3600 ? `${Math.round(params.cooldownSecs / 3600)} h` : `${params.cooldownSecs} s`} (cooldown), and is blocked while a co-signed proof is still open.
        </Text>
      ) : null}
      {error && !stakes ? <ErrorText message={error} /> : null}
      <View style={styles.seats}>
        {VALIDATORS.map((v) => {
          const s = stakes?.[v.id];
          const status = stakes ? statusOf(s) : null;
          return (
            <View key={v.id} style={styles.seat} testID={`stake-seat-${v.seat}`}>
              <Text style={styles.seatTitle}>{v.label}</Text>
              <Text testID={`stake-amount-${v.seat}`} style={styles.amount}>
                {stakes ? usdc(s?.amount ?? 0n) : "…"}
              </Text>
              <Text testID={`stake-status-${v.seat}`} style={[styles.status, status === "active" ? { color: colors.green } : status === "slashed" ? { color: colors.error } : null]}>
                {status ?? "reading…"}
              </Text>
              {s && s.unstakeRequestedAt > 0 && params && !s.slashed ? (
                <LiveLeft
                  endsAt={s.unstakeRequestedAt + params.cooldownSecs}
                  render={(left) => <Text style={type.small}>{left > 0 ? `Cooldown: ${clock(left)} left` : "Cooldown over: ready to withdraw"}</Text>}
                />
              ) : null}
              <Text style={type.small} testID={`stake-cosigned-${v.seat}`}>Proofs co-signed: {s?.proofsCosigned ?? 0}</Text>
              <Text style={type.small} testID={`stake-open-${v.seat}`}>Open co-signs: {s?.openCosigns ?? 0}</Text>
              {s ? (
                <ExtLink url={explorerAddr(s.stakePda)} style={styles.link}>
                  Stake account on Explorer
                </ExtLink>
              ) : null}
              <View style={styles.actions}>
                <Button
                  testID={`stake-more-${v.seat}`}
                  small
                  label={busy === v.id ? "Staking…" : "Stake more (+$100)"}
                  kind="secondary"
                  disabled={!!locked || !!busy || !stakes || status === "slashed" || status === "unstaking"}
                  hint={locked ?? (status === "slashed" ? "A slashed stake can never be added to" : status === "unstaking" ? "Not while unstaking" : undefined)}
                  onPress={() => void add(v.id)}
                />
                <Button testID={`request-unstake-${v.seat}`} small label="Request unstake" kind="secondary" disabled hint="Demo seats stay staked" onPress={() => undefined} />
                <Button testID={`withdraw-${v.seat}`} small label="Withdraw" kind="secondary" disabled hint="Demo seats stay staked" onPress={() => undefined} />
              </View>
            </View>
          );
        })}
      </View>
      <Text style={type.small}>Demo seats stay staked: Request unstake and Withdraw are switched off for the three public demo seats, and slashing is never run on them here (the program tests prove it).</Text>
      {locked ? <Text style={[type.small, { color: colors.accent, fontWeight: "600" }]}>{locked}</Text> : null}
      <ErrorText message={err} />
    </Card>
  );
}

const styles = StyleSheet.create({
  seats: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  seat: { flexGrow: 1, flexBasis: 220, minWidth: 0, gap: 4, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  seatTitle: { ...type.subheading },
  amount: { ...type.heading },
  status: { ...type.body, fontWeight: "700" },
  actions: { gap: space.sm, marginTop: space.sm },
  link: { ...type.small, color: colors.accent, textDecorationLine: "underline" },
});
