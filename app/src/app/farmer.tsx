import { Text, View } from "react-native";

import { router, type Href } from "expo-router";

import { useAccount } from "@/account/store";
import { Button, Card, CardTitle, RoleShell, TwoUp, useTab } from "@/components/ui";
import { type } from "@/theme";

import {
  ActionsCard,
  DemoControls,
  MoneyCard,
  PayoutCard,
  PostJobCard,
  SimBanner,
  StatusCard,
  TimelineCard,
} from "@/components/farmer/sections";
import { CropHealthCard, MyFields, haText } from "@/components/farmer/fields";
import { ChainGate } from "@/components/chain-gate";
import { HowSteps } from "@/components/how-steps";
import { SettleNow } from "@/components/settle-now";
import { FarmerPayments, ResetDemo } from "@/components/tab-views";
import { fieldHa } from "@/data/fields";
import { selectedField, useFields } from "@/data/fields-store";
import { ChainCard } from "@/components/devnet/chain-card";
import { SAMPLE_JOB_ID } from "@/engine/scenario";
import { useEngine } from "@/engine/useEngine";

const TITLES: Record<string, string> = { "": "My jobs", post: "Post a job", payments: "Payments", help: "Help" };

export default function Farmer() {
  const job = useEngine().state.jobs[SAMPLE_JOB_ID];
  const tab = useTab("farmer");
  const account = useAccount("farmer");
  const signedOut = !account && tab !== "help";
  const fs = useFields();
  const sel = selectedField(fs);
  const total = fs.fields.reduce((s, f) => s + fieldHa(f), 0);
  const fieldsText = `${fs.fields.length} ${fs.fields.length === 1 ? "field" : "fields"} · ${haText(total)}`;
  return (
    <RoleShell
      role="farmer"
      title={TITLES[tab]}
      subtitle={tab === "" ? `${fieldsText}${account ? (job ? ` · Job: ${job.state}` : " · no job yet") : ""}` : tab === "post" ? fieldsText : undefined}
    >
      <SimBanner />
      <ChainGate>
      {signedOut ? (
        <>
          <Card testID="signup-card">
            <CardTitle>Sign up as a farmer</CardTitle>
            <Text style={type.body}>Create a demo account to get your own devnet wallet and post a spray job. Meanwhile you can look at the fields below.</Text>
            <Button testID="farmer-signup" label="Sign up as a farmer" onPress={() => router.replace("/?role=farmer" as Href)} />
          </Card>
          <TwoUp>
            <MyFields />
            <CropHealthCard fieldId={sel.id} />
          </TwoUp>
        </>
      ) : (
      <>
      {tab === "" &&
        (job ? (
          <>
            <TwoUp>
              <StatusCard />
              <MoneyCard />
            </TwoUp>
            <TwoUp>
              <TimelineCard />
              <View style={{ gap: 16 }}>
                <PayoutCard />
                <SettleNow job={job} />
              </View>
            </TwoUp>
            <ActionsCard />
            <ChainCard />
            <TwoUp>
              <View style={{ gap: 16 }}>
                <MyFields />
              </View>
              <View style={{ gap: 16 }}>
                <PostJobCard />
                <CropHealthCard fieldId={sel.id} />
              </View>
            </TwoUp>
          </>
        ) : (
          <>
            <Card>
              <CardTitle>No job yet</CardTitle>
              <Text style={type.body}>You have not posted a job. Pick a field below and post one; it will then be listed here with its status.</Text>
            </Card>
            <TwoUp>
              <View style={{ gap: 16 }}>
                <MyFields />
                <CropHealthCard fieldId={sel.id} />
              </View>
              <PostJobCard />
            </TwoUp>
          </>
        ))}
      {tab === "post" && (
        <TwoUp>
          <View style={{ gap: 16 }}>
            <MyFields />
            <CropHealthCard fieldId={sel.id} />
          </View>
          <PostJobCard />
        </TwoUp>
      )}
      {tab === "payments" && <FarmerPayments />}
      {tab === "help" && (
        <>
          <HowSteps />
          <ResetDemo />
        </>
      )}
      {(tab === "" || tab === "post") && <DemoControls />}
      </>
      )}
      </ChainGate>
    </RoleShell>
  );
}
