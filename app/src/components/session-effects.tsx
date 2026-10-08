// Root-level effects: load the saved demo account and, when a challenge window ends with nobody challenging,
// settle the job on its own (a few seconds after the window closes; the "Settle now" buttons do the same by hand).
import { useEffect, useRef } from "react";

import { loadAccount } from "@/account/store";
import { notify } from "@/components/ui/notice";
import { useTick } from "@/components/ui/use-tick";
import { useDevnetState } from "@/devnet/mode";
import { useActions } from "@/engine/actions";
import { windowLeft } from "@/engine/engine";
import { SAMPLE_JOB_ID, WALLETS } from "@/engine/scenario";
import { useEngine } from "@/engine/useEngine";

export const AUTO_SETTLE_GRACE_SECS = 5;

export function SessionEffects() {
  const { state } = useEngine();
  const actions = useActions();
  const dev = useDevnetState();
  const now = useTick();
  const tried = useRef<string>("");

  useEffect(() => {
    loadAccount();
  }, []);

  const job = state.jobs[SAMPLE_JOB_ID];
  const due = !!job && job.state === "ProofSubmitted" && windowLeft(job, now) === 0 && now >= (job.proof?.windowEndsAt ?? 0) + AUTO_SETTLE_GRACE_SECS;
  const key = job ? `${dev.mode}:${dev.chainJobId}:${job.proof?.proofHash}` : "";
  useEffect(() => {
    if (!due || dev.busy || tried.current === key) return;
    if (dev.mode === "devnet" && dev.status !== "ready") return;
    tried.current = key;
    actions.settle(WALLETS.farmer, SAMPLE_JOB_ID).catch(() => {
      notify("error", "Automatic settlement did not go through. Press \"Settle now\" to try again.");
    });
  }, [due, key, dev.busy, dev.mode, dev.status, actions]);
  return null;
}
