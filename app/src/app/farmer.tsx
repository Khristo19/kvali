import { Text } from "react-native";

import { router, type Href } from "expo-router";

import { useAccount } from "@/account/store";
import { Button, Card, CardTitle, RoleShell, useTab } from "@/components/ui";
import { type } from "@/theme";

import { haText } from "@/components/farmer/fields";
import { FieldsHome, HistoryRecorder } from "@/components/farmer/jobs";
import { ChainGate } from "@/components/chain-gate";
import { HowSteps } from "@/components/how-steps";
import { FarmerPayments } from "@/components/tab-views";
import { fieldHa } from "@/data/fields";
import { useFields } from "@/data/fields-store";
import { SAMPLE_JOB_ID } from "@/engine/scenario";
import { useEngine } from "@/engine/useEngine";

const TITLES: Record<string, string> = { "": "My fields", payments: "Payments", help: "Help" };

export default function Farmer() {
  const job = useEngine().state.jobs[SAMPLE_JOB_ID];
  const tab = useTab("farmer");
  const account = useAccount("farmer");
  const signedOut = !account && tab !== "help";
  const fs = useFields();
  const total = fs.fields.reduce((s, f) => s + fieldHa(f), 0);
  const fieldsText = `${fs.fields.length} ${fs.fields.length === 1 ? "field" : "fields"} · ${haText(total)}`;
  const running = account && job && !job.payout ? " · 1 job running" : "";
  return (
    <RoleShell role="farmer" title={TITLES[tab]} subtitle={tab === "" ? `${fieldsText}${running}` : undefined}>
      <ChainGate>
        {signedOut ? (
          <>
            <Card testID="signup-card">
              <CardTitle>Sign up as a farmer</CardTitle>
              <Text style={type.body}>Create an account to get your own wallet and post a spray job. Meanwhile you can look at your fields below.</Text>
              <Button testID="farmer-signup" label="Sign up as a farmer" onPress={() => router.replace("/?role=farmer" as Href)} />
            </Card>
            <FieldsHome signedIn={false} />
          </>
        ) : (
          <>
            {tab === "" && (
              <>
                <HistoryRecorder />
                <FieldsHome signedIn />
              </>
            )}
            {tab === "payments" && <FarmerPayments />}
            {tab === "help" && <HowSteps />}
          </>
        )}
      </ChainGate>
    </RoleShell>
  );
}
