// One async action API for the screens. Simulated mode calls the in-memory engine; devnet mode sends real transactions
// (src/devnet/bridge.ts) and mirrors them into the local engine so every screen keeps working.
import { useMemo } from "react";

import { devnetActions } from "@/devnet/bridge";
import { useMode } from "@/devnet/mode";
import type { Engine } from "./engine";
import { acceptSampleJob, postSampleJob, submitSampleRecord, PROOF_SIGNERS, type sampleRecords } from "./scenario";
import { useEngineInstance } from "./useEngine";

export interface Actions {
  postJob(jobId: number, field?: { hash: string; areaCha: number }): Promise<void>;
  acceptJob(jobId: number): Promise<void>;
  submitRecord(which: keyof typeof sampleRecords, jobId: number, signers?: string[]): Promise<void>;
  settle(caller: string, jobId: number): Promise<void>;
  challenge(farmer: string, jobId: number): Promise<void>;
  resolveChallenge(signers: string[], jobId: number, upheld: boolean): Promise<void>;
}

function simActions(e: Engine): Actions {
  return {
    postJob: async (id, field) => void postSampleJob(e, id, field),
    acceptJob: async (id) => acceptSampleJob(e, id),
    submitRecord: async (k, id, signers = PROOF_SIGNERS) => submitSampleRecord(e, k, id, signers),
    settle: async (caller, id) => e.settle(caller, id),
    challenge: async (farmer, id) => e.challenge(farmer, id, "SIM-evidence-hash"),
    resolveChallenge: async (signers, id, upheld) => e.resolveChallenge(signers, id, upheld, "SIM-panel-report"),
  };
}

/** Actions for the current mode. */
export function useActions(): Actions {
  const mode = useMode();
  const engine = useEngineInstance();
  return useMemo(() => (mode === "devnet" ? devnetActions(engine) : simActions(engine)), [mode, engine]);
}
