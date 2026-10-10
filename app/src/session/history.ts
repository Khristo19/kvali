// Finished jobs per farmer account (key = the farmer's wallet address), kept in this browser only.
// The app has one job slot, so "Start a new job" wipes the finished job; this list is what remains of it.
import { useSyncExternalStore } from "react";

import { lsKey } from "@/env";

export interface HistoryEntry {
  /** On-chain job id (as text): the dedupe key. */
  id: string;
  /** Short job reference, e.g. "…97622". */
  ref: string;
  field: string;
  /** Hundredths of a hectare. */
  areaCha: number;
  state: "Released" | "Refunded" | "Cancelled";
  /** Unix seconds the job ended. */
  at: number;
  /** Paid to the operator (payment only, bond excluded) and returned to the farmer, in USDC base units as text. */
  paid: string;
  back: string;
  /** Transaction that settled the job (devnet signature, or a SIM- id). */
  tx?: string;
}

const MAX = 20;
const keyOf = (addr: string) => lsKey(`kvali.history.v1.${addr}`);
const EMPTY: HistoryEntry[] = [];
const cache = new Map<string, HistoryEntry[]>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function getHistory(addr: string): HistoryEntry[] {
  const hit = cache.get(addr);
  if (hit) return hit;
  let list = EMPTY;
  try {
    const raw = globalThis.localStorage?.getItem(keyOf(addr));
    const p = raw ? JSON.parse(raw) : null;
    if (Array.isArray(p)) list = p.filter((e): e is HistoryEntry => !!e && typeof e.id === "string" && typeof e.state === "string");
  } catch {
    /* storage blocked or corrupt: start empty */
  }
  cache.set(addr, list);
  return list;
}

/** Add a finished job (newest first, max 20). A job that is already listed is ignored. */
export function addHistory(addr: string, entry: HistoryEntry) {
  const cur = getHistory(addr);
  if (cur.some((e) => e.id === entry.id)) return;
  const next = [entry, ...cur].sort((a, b) => b.at - a.at).slice(0, MAX);
  cache.set(addr, next);
  try {
    globalThis.localStorage?.setItem(keyOf(addr), JSON.stringify(next));
  } catch {
    /* storage blocked: kept in memory for this visit */
  }
  emit();
}

export function useHistory(addr: string | null): HistoryEntry[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => (addr ? getHistory(addr) : EMPTY),
    () => EMPTY,
  );
}
