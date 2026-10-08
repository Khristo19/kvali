import { useState } from "react";
import { View } from "react-native";

import { CertificateCard, CertificateStrip, OpenJobs, UploadRecord, Verdict, Wallet, useOpenJobsText } from "@/components/operator/sections";
import { OperatorEarnings, OperatorMine } from "@/components/tab-views";
import { ModeBanner } from "@/components/devnet/mode-banner";
import { Banner, RoleShell, TwoUp, useTab } from "@/components/ui";
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

  return (
    <RoleShell role="operator" title={TITLES[tab]} subtitle={tab === "" ? openText : undefined}>
      <ModeBanner />
      <CertificateStrip />
      {error && <Banner tone="error" text={error} />}
      {tab === "" && (
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
      {tab === "mine" && (
        <>
          {active && active.state === "Accepted" && <UploadRecord job={active} onError={setError} />}
          <OperatorMine />
          {current && current.state !== "Accepted" && <Verdict job={current} />}
        </>
      )}
      {tab === "earnings" && (
        <TwoUp>
          <Wallet />
          <OperatorEarnings />
        </TwoUp>
      )}
      {tab === "drones" && <CertificateCard />}
    </RoleShell>
  );
}
