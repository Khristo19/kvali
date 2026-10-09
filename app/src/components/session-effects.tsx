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
import { pollChain, syncChain } from "@/devnet/bridge";
import { useEngine } from "@/engine/useEngine";

export const AUTO_SETTLE_GRACE_SECS = 5;

export function SessionEffects() {
  const { engine, state } = useEngine();
  const actions = useActions();
  const dev = useDevnetState();
  const now = useTick();

  useEffect(() => {
    loadAccount();
  }, []);

  // Devnet balances and the job window come from the chain: re-read every 30 s while the tab is visible (no polling in a hidden tab).
  useEffect(() => {
    if (dev.mode !== "devnet" || dev.status !== "ready") return;
    const poll = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      if (!getDevnetState().busy) void pollChain(engine).catch(() => undefined);
    };
    const id = setInterval(poll, 30000);
    document.addEventListener?.("visibilitychange", poll);
    return () => {
      clearInterval(id);
      document.removeEventListener?.("visibilitychange", poll);
    };
  }, [dev.mode, dev.status, engine]);

  // After the wallet was funded / the operator certified, re-read balances and the operator account right away.
  useEffect(() => {
    if (dev.walletReadyAt > 0 && dev.mode === "devnet") void syncChain(engine).catch(() => undefined);
  }, [dev.walletReadyAt, dev.mode, engine]);

  const job = state.jobs[SAMPLE_JOB_ID];
  const due = !!job && job.state === "ProofSubmitted" && windowLeft(job, now) === 0 && now >= (job.proof?.windowEndsAt ?? 0) + AUTO_SETTLE_GRACE_SECS;
  const key = job ? `${dev.mode}:${dev.chainJobId}:${job.proof?.proofHash}` : "";
  // Auto-settle keeps trying (bounded, growing pauses) instead of giving up on the first error; the card shows the status.
  const tries = useRef({ key: "", n: 0, next: 0, running: false });
  useEffect(() => {
    if (!due || dev.busy || tries.current.running) return;
    if (dev.mode === "devnet" && dev.status !== "ready") return;
    const t = tries.current;
    if (t.key !== key) {
      t.key = key;
      t.n = 0;
      t.next = 0;
    }
    if (t.n >= 10 || now < t.next) return;
    t.running = true;
    actions
      .settle(WALLETS.farmer, SAMPLE_JOB_ID)
      .catch(() => {
        t.n += 1;
        t.next = now + Math.min(60, 5 * 2 ** t.n);
        notify(
          "info",
          t.n >= 10 ? 'Automatic settlement gave up. Press "Settle now" to try again.' : "Settling is taking a moment (devnet is busy). The app is retrying by itself.",
        );
      })
      .finally(() => {
        t.running = false;
      });
  }, [due, key, now, dev.busy, dev.mode, dev.status, actions]);
  return null;
}
