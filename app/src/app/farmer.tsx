import { View } from "react-native";

import { RoleShell, TwoUp } from "@/components/ui";
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
import { fieldHa } from "@/data/fields";
import { selectedField, useFields } from "@/data/fields-store";
import { ChainCard } from "@/components/devnet/chain-card";
import { SAMPLE_JOB_ID } from "@/engine/scenario";
import { useEngine } from "@/engine/useEngine";

export default function Farmer() {
  const job = useEngine().state.jobs[SAMPLE_JOB_ID];
  const fs = useFields();
  const sel = selectedField(fs);
  const total = fs.fields.reduce((s, f) => s + fieldHa(f), 0);
  return (
    <RoleShell
      role="farmer"
      active={0}
      title="My fields"
      subtitle={`${fs.fields.length} ${fs.fields.length === 1 ? "field" : "fields"} · ${haText(total)} · Job #${SAMPLE_JOB_ID}`}
    >
      <SimBanner />
      {job ? (
        <>
          <TwoUp>
            <StatusCard />
            <MoneyCard />
          </TwoUp>
          <TwoUp>
            <TimelineCard />
            <View style={{ gap: 16 }}>
              <PayoutCard />
            </View>
          </TwoUp>
          <ActionsCard />
          <ChainCard />
          <TwoUp>
            <View style={{ gap: 16 }}>
              <MyFields />
            </View>
            <CropHealthCard fieldId={sel.id} />
          </TwoUp>
        </>
      ) : (
        <TwoUp>
          <View style={{ gap: 16 }}>
            <MyFields />
            <CropHealthCard fieldId={sel.id} />
          </View>
          <PostJobCard />
        </TwoUp>
      )}
      <DemoControls />
    </RoleShell>
  );
}
