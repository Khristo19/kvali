import { Text } from "react-native";

import { clock } from "@/components/money";
import { LiveLeft } from "@/components/live-clock";
import { Button, Card, CardTitle, Row, useReached } from "@/components/ui";
import { useDevnetState } from "@/devnet/mode";
import { useActions } from "@/engine/actions";
import { WALLETS } from "@/engine/scenario";
import type { Job } from "@/engine/types";
import { type } from "@/theme";

/** Challenge window countdown and the "Settle now" button (any role may press it; the app also settles by itself shortly after the window ends). */
export function SettleNow({ job }: { job: Job | undefined }) {
  const actions = useActions();
  const dev = useDevnetState();
  const closed = useReached(job?.proof?.windowEndsAt);
  if (!job || job.state !== "ProofSubmitted") return null;
  const left = closed ? 0 : 1;
  return (
    <Card>
      <CardTitle>Settlement</CardTitle>
      <LiveLeft endsAt={job.proof?.windowEndsAt ?? 0} render={(secs) => <Row label="Challenge window" value={secs > 0 ? `${clock(secs)} left` : "closed"} />} />
      <Text style={type.body}>
        {left > 0
          ? "The farmer can challenge until the window closes. After that anyone can settle the job, and the operator is paid."
          : "The window is closed and nobody challenged. Settle now to pay the operator (this page also does it by itself in a few seconds)."}
      </Text>
      <Button
        label="Settle now"
        disabled={left > 0 || !!dev.busy}
        hint={left > 0 ? "Available when the challenge window closes" : undefined}
        onPress={() => void actions.settle(WALLETS.farmer, job.id).catch(() => undefined)}
      />
      {left > 0 ? <Text style={type.small}>Disabled until the window closes.</Text> : null}
    </Card>
  );
}
