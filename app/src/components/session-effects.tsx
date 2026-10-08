// Root-level effects: load the saved demo account and, when a challenge window ends with nobody challenging,
// settle the job on its own (a few seconds after the window closes; the "Settle now" buttons do the same by hand).
import { useEffect, useRef } from "react";

import { loadAccount } from "@/account/store";
import { notify } from "@/components/ui/notice";
import { useTick } from "@/components/ui/use-tick";
import { useDevnetState , getDevnetState } from "@/devnet/mode";
import { useActions } from "@/engine/actions";
import { windowLeft } from "@/engine/engine";
import { SAMPLE_JOB_ID, WALLETS } from "@/engine/scenario";
import { syncChain } from "@/devnet/bridge";
import { useEngine } from "@/engine/useEngine";

export const AUTO_SETTLE_GRACE_SECS = 5;

export function SessionEffects() {
  const { engine, state } = useEngine();
  const actions = useActions();
  const dev = useDevnetState();
  const now = useTick();
  const tried = useRef<string>("");

  useEffect(() => {
    loadAccount();
  }, []);

  // Devnet balances and the job window come from the chain: re-read every 20 s while a page is open.
  useEffect(() => {
    if (dev.mode !== "devnet" || dev.status !== "ready") return;
    const id = setInterval(() => {
      if (!getDevnetState().busy) void syncChain(engine).catch(() => undefined);
    }, 20000);
    return () => clearInterval(id);
  }, [dev.mode, dev.status, engine]);

  // After the wallet was funded / the operator certified, re-read balances and the operator account right away.
  useEffect(() => {
    if (dev.walletReadyAt > 0 && dev.mode === "devnet") void syncChain(engine).catch(() => undefined);
  }, [dev.walletReadyAt, dev.mode, engine]);

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
