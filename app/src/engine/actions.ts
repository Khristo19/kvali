// One async action API for the screens. Simulated mode calls the in-memory engine; devnet mode sends real transactions
// (src/devnet/bridge.ts) and mirrors them into the local engine so every screen keeps working.
// Every action reports its result in the notice bar (success or the plain-words reason it failed), then rethrows on failure.
import { useMemo } from "react";

import { notify } from "@/components/ui/notice";
import { devnetActions, type DevActions } from "@/devnet/bridge";
import { useMode } from "@/devnet/mode";
import type { Engine } from "./engine";
import { acceptSampleJob, postSampleJob, submitSampleRecord, PROOF_SIGNERS, type sampleRecords } from "./scenario";
import { useEngineInstance } from "./useEngine";
import { EngineError } from "./types";

export type Actions = DevActions;

function simActions(e: Engine): Actions {
  return {
    postJob: async (id, field) => void postSampleJob(e, id, field),
    acceptJob: async (id) => acceptSampleJob(e, id),
    submitRecord: async (k: keyof typeof sampleRecords, id, signers = PROOF_SIGNERS) => submitSampleRecord(e, k, id, signers),
    settle: async (caller, id) => e.settle(caller, id),
    challenge: async (farmer, id) => e.challenge(farmer, id, "SIM-evidence-hash"),
    resolveChallenge: async (signers, id, upheld) => e.resolveChallenge(signers, id, upheld, "SIM-panel-report"),
    cancelJob: async (id) => e.cancelJob("farmer-group-1", id),
    acceptOpenJob: async () => {
      throw new Error("There are no other open jobs in the simulation.");
    },
    continueHeldJob: async () => {
      throw new Error("Nothing to continue in the simulation.");
    },
    newJob: async (id) => e.chainResetJob(id),
  };
}

function plain(e: unknown): string {
  if (e instanceof EngineError) return `The program refused it (${e.code}): ${e.message}`;
  return e instanceof Error ? e.message : "Something went wrong. Try again.";
}

const OK: Record<keyof Actions, string> = {
  postJob: "Job posted. The payment is held safely until the spraying is checked.",
  acceptJob: "Job accepted. Your bond is locked. Next: fly the job (use \"Demo: simulate the drone flight\" below).",
  submitRecord: "Spray record submitted with the validators' co-signatures. The 60 second challenge window is open.",
  settle: "Settled. The operator was paid.",
  challenge: "Challenge raised. A validator panel will decide.",
  resolveChallenge: "The panel has decided and the money was paid out.",
  cancelJob: "Job cancelled. Your payment came back.",
  acceptOpenJob: "Job accepted. Your bond is locked. Next: fly the job (use \"Demo: simulate the drone flight\" below).",
  continueHeldJob: "Continuing the job you hold on chain.",
  newJob: "Ready for a new job.",
};

function withNotices(a: Actions): Actions {
  const out = {} as Actions;
  (Object.keys(a) as (keyof Actions)[]).forEach((k) => {
    out[k] = (async (...args: unknown[]) => {
      try {
        await (a[k] as (...x: unknown[]) => Promise<void>)(...args);
        notify("ok", OK[k]);
      } catch (e) {
        notify("error", plain(e));
        throw e;
      }
    }) as never;
  });
  return out;
}

/** Actions for the current mode. */
export function useActions(): Actions {
  const mode = useMode();
  const engine = useEngineInstance();
  return useMemo(() => withNotices(mode === "devnet" ? devnetActions(engine) : simActions(engine)), [mode, engine]);
}
