// Mode switch store: "devnet" (real Solana devnet transactions) or "simulated" (in-memory engine).
// Plain external store so both React and non-React code can use it.
import { useSyncExternalStore } from "react";
import { Platform } from "react-native";

import type { ChainSnapshot } from "./client";

export type Mode = "devnet" | "sim";
export type Status = "idle" | "connecting" | "ready" | "unreachable";

export interface LastTx {
  label: string;
  sig: string | null;
  ok: boolean;
  /** Short plain-text reason when the program refused it. */
  error?: string;
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
