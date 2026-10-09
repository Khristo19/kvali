// Root-level effects: load the saved demo account and, when a challenge window ends with nobody challenging,
// settle the job on its own (a few seconds after the window closes; the "Settle now" buttons do the same by hand).
import { useEffect, useRef } from "react";

import { loadAccount } from "@/account/store";
import { consumeFresh, loadMulti } from "@/devnet/multi";
import { ensureWallet } from "@/devnet/provision";
import { SWITCHER } from "@/env";
import { notify } from "@/components/ui/notice";
import { useTick } from "@/components/ui/use-tick";
import { useDevnetState, getDevnetState, setDevnetState } from "@/devnet/mode";
import { useActions } from "@/engine/actions";
import { windowLeft } from "@/engine/engine";
import { SAMPLE_JOB_ID, WALLETS, type sampleRecords } from "@/engine/scenario";
import { pollChain, releaseCosigns, syncChain } from "@/devnet/bridge";
import { usePending, useSession } from "@/session/store";
import { useEngine } from "@/engine/useEngine";

export const AUTO_SETTLE_GRACE_SECS = 5;

export function SessionEffects() {
  const { engine, state } = useEngine();
  const actions = useActions();
  const dev = useDevnetState();
  const now = useTick();

  useEffect(() => {
    loadAccount();
    if (SWITCHER) {
      // Staging account switcher: read the saved accounts, and fund an account that was just created (same flow as the first sign-up).
      loadMulti();
      for (const role of consumeFresh()) {
        if (getDevnetState().mode !== "devnet") continue;
        setDevnetState({ walletNote: "Setting up your own devnet wallet: funding it with test SOL and test USDC...", walletOk: false });
        void ensureWallet(role).catch((e: Error) => notify("error", e.message));
      }
    }
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

  // The checker bots run in whichever browser has the job open: a record that was sent but not yet checked (tab closed, reload,
  // the farmer's tab in the same browser) is picked up here. The bot run itself checks the chain first, so two tabs never double-submit.
  const pending = usePending();
  const session = useSession();
  const botTry = useRef({ key: "", n: 0, next: 0 });
  const botReady = dev.mode === "devnet" && dev.status === "ready" && !dev.busy;
  useEffect(() => {
    if (!botReady || !pending || pending.refusal || job?.state !== "Accepted") return;
    const t = botTry.current;
    const k = `${dev.chainJobId}:${pending.key}`;
    if (t.key !== k) {
      t.key = k;
      t.n = 0;
      t.next = 0;
    }
    if (t.n >= 3 || now < t.next) return;
    t.n += 1;
    t.next = now + 20;
    actions.submitRecord(pending.key as keyof typeof sampleRecords, SAMPLE_JOB_ID).catch(() => undefined);
  }, [botReady, pending, job?.state, dev.chainJobId, now, actions]);

  // After settlement, free the co-signers' stake locks (release_cosign, permissionless) so the stakes can be withdrawn later.
  const settled = dev.mode === "devnet" && dev.status === "ready" && job?.state === "Released" && !!session && !session.released;
  useEffect(() => {
    if (settled) void releaseCosigns().catch(() => undefined);
  }, [settled, session?.chainJobId]);
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
