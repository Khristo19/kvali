// Mode switch store: "devnet" (real Solana devnet transactions) or "simulated" (in-memory engine).
// Plain external store so both React and non-React code can use it.
import { useSyncExternalStore } from "react";
import { Platform } from "react-native";

import type { ChainJob, ChainSnapshot } from "./client";

export type Mode = "devnet" | "sim";
export type Status = "idle" | "connecting" | "ready" | "unreachable";

export interface LastTx {
  label: string;
  sig: string | null;
  ok: boolean;
  /** Short plain-text reason when the program refused it. */
  error?: string;
  /** Date.now() when it happened (pages only show results from after they opened). */
  at: number;
}

export interface DevnetState {
  mode: Mode;
  status: Status;
  /** True when devnet was wanted but could not be reached, so we fell back to the simulation. */
  fellBack: boolean;
  busy: string | null;
  last: LastTx | null;
  /** On-chain id of the job posted from this session (local job id 17 maps to it). */
  chainJobId: number | null;
  snapshot: ChainSnapshot | null;
  /** Open (Posted) jobs read from the chain, newest first. null = not read yet. */
  openJobs: ChainJob[] | null;
  /** A job the demo operator still holds on chain that is not this session's job (for example from an earlier visit). */
  heldJob: ChainJob | null;
  /** Last message from a restore / adopt step, shown on the pages. */
  restoreNote: string | null;
  /** Progress of the burner-wallet setup (null when idle). */
  walletNote: string | null;
  /** The RPC layer is waiting out a rate limit (HTTP 429) and retrying. */
  rpcBusy: boolean;
  /** The last known job was shown from local storage while the chain is being read. */
  cachedReady: boolean;
  /** True for a few seconds after the wallet was funded (shows the check mark). */
  walletOk: boolean;
  walletReadyAt: number;
}

let state: DevnetState = {
  // Devnet by default on web; native stays simulated until it has been tried on a device.
  mode: Platform.OS === "web" ? "devnet" : "sim",
  status: "idle",
  fellBack: false,
  busy: null,
  last: null,
  chainJobId: null,
  snapshot: null,
  openJobs: null,
  heldJob: null,
  restoreNote: null,
  walletNote: null,
  rpcBusy: false,
  cachedReady: false,
  walletOk: false,
  walletReadyAt: 0,
};
const listeners = new Set<() => void>();

export const getDevnetState = () => state;
export function setDevnetState(patch: Partial<DevnetState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}
export const subscribeDevnet = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
export const useDevnetState = () => useSyncExternalStore(subscribeDevnet, getDevnetState, getDevnetState);
export const useMode = () => useDevnetState().mode;
