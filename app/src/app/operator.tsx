import { useState } from "react";
import { View , Text } from "react-native";

import { CertificateCard, CertificateStrip, OpenJobs, UploadRecord, Verdict, Wallet, useOpenJobsText } from "@/components/operator/sections";
import { OperatorEarnings, OperatorMine, ResetDemo } from "@/components/tab-views";
import { ChainGate } from "@/components/chain-gate";
import { ModeBanner } from "@/components/devnet/mode-banner";
import { router, type Href } from "expo-router";

import { useAccount } from "@/account/store";
import { setDevnetState, useDevnetState } from "@/devnet/mode";
import { ensureWallet } from "@/devnet/provision";
import { Banner, Button, Card, CardTitle, RoleShell, TwoUp, notify, useTab } from "@/components/ui";
import { type } from "@/theme";
import { useEngineState } from "@/engine/useEngine";
import { WALLETS } from "@/engine/scenario";

const TITLES: Record<string, string> = { "": "Jobs near you", mine: "My jobs", earnings: "Earnings", drones: "My drones" };

export default function Operator() {
  const state = useEngineState();
  const tab = useTab("operator");
  const [error, setError] = useState<string | null>(null);
  const op = state.operators[WALLETS.operator];
  const mine = Object.values(state.jobs)
    .filter((j) => j.operator === WALLETS.operator)
    .sort((a, b) => b.id - a.id);
  const active = op?.activeJob != null ? state.jobs[op.activeJob] : undefined;
  const current = active ?? mine[0];
  const openText = useOpenJobsText();
  const dev = useDevnetState();
  const account = useAccount("operator");
  // Devnet: no certificate or wallet is shown until this browser's operator account exists on chain.
  // Signed out, or signed up but not on chain yet: only the sign-up / setup card (plus a read-only job list), no wallet, certificate or earnings.
  const needsSetup = !account || (dev.mode === "devnet" && dev.status === "ready" && !!dev.snapshot && !dev.snapshot.operatorRegistered);

  return (
    <RoleShell role="operator" title={account ? TITLES[tab] : "Jobs near you"} subtitle={tab === "" && account ? openText : undefined}>
      <ModeBanner />
      <ChainGate>
      {needsSetup ? (
        <Card>
          <CardTitle>Get your operator wallet</CardTitle>
          <Text style={type.body}>
            {account
              ? "Your operator wallet and drone certificate are not on the chain yet. Press the button to create them (a few seconds, test money only)."
              : "Sign up as a drone operator to get a devnet wallet with test money and a drone calibration certificate."}
          </Text>
          {account ? (
            <Button
              label="Set up my operator wallet"
              disabled={!!dev.walletNote}
              onPress={() => {
                setDevnetState({ walletNote: "Setting up your devnet wallet…", walletOk: false });
                void ensureWallet("operator").catch((e: Error) => notify("error", e.message));
              }}
            />
          ) : (
            <Button label="Sign up as a drone operator" onPress={() => router.replace("/?role=operator" as Href)} />
          )}
        </Card>
      ) : null}
      {needsSetup ? <OpenJobs onError={setError} onDone={() => undefined} /> : <CertificateStrip />}
      {error && <Banner tone="error" text={error} />}
      {needsSetup ? null : tab === "" && (
        <TwoUp>
          <View style={{ gap: 16 }}>
            <OpenJobs onError={setError} onDone={() => undefined} />
            {active && active.state === "Accepted" && <UploadRecord job={active} onError={setError} />}
            {current && current.state !== "Accepted" && <Verdict job={current} />}
          </View>
          <View style={{ gap: 16 }}>
            <Wallet />
            <CertificateCard />
          </View>
        </TwoUp>
      )}
      {!needsSetup && tab === "mine" && (
        <>
          {active && active.state === "Accepted" && <UploadRecord job={active} onError={setError} />}
          <OperatorMine />
          {current && current.state !== "Accepted" && <Verdict job={current} />}
        </>
      )}
      {!needsSetup && tab === "earnings" && (
        <TwoUp>
          <Wallet />
          <OperatorEarnings />
        </TwoUp>
      )}
      {!needsSetup && tab === "drones" && (
        <>
          <CertificateCard />
          <ResetDemo />
        </>
      )}
      </ChainGate>
    </RoleShell>
  );
}
