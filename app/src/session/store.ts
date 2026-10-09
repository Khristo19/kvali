// The current demo job, persisted in localStorage so every role page and every reload sees the SAME job.
// In devnet mode the app re-reads the job from the chain on load (src/devnet/bridge.ts restoreSession) and rebuilds the
// local mirror from it; this store only keeps what the chain does not hold: which job, the signatures to link to
// Explorer, which sample record was used and which validator seats approved it.
import { useSyncExternalStore } from "react";

export interface SessionTx {
  action: string;
  sig: string;
  time?: number;
}
export interface PendingRecord {
  /** Key of engine/samples sampleRecords. */
  key: string;
  /** Validator seat ids that approved so far (2 are needed). */
  approvals: string[];
  /** Set when a validator seat refused the record. */
  refusal?: string;
}
export interface Session {
  chainJobId: number;
  /** Wallet that posted the job (base58). Jobs from other visitors have another farmer than this browser's. */
  farmer: string;
  fieldHash: string;
  areaCha: number;
  sprayDeadline: number;
  /** Details shown on every role page (the chain only holds the field hash). */
  fieldName?: string;
  crop?: string;
  product?: string;
  farmerName?: string;
  txs: SessionTx[];
  /** Record that was actually submitted on chain. */
  recordKey: string | null;
  signers: string[];
  /** Panel used to resolve a challenge: [upheld?, ids]. */
  resolution: { upheld: boolean; ids: string[] } | null;
}

const KEY = "kvali.session.v1";
let state: Session | null = null;
let loaded = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function persist() {
  try {
    if (state) globalThis.localStorage?.setItem(KEY, JSON.stringify(state));
    else globalThis.localStorage?.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function loadSession(): Session | null {
  if (!loaded) {
    loaded = true;
    try {
      const raw = globalThis.localStorage?.getItem(KEY);
      const s = raw ? (JSON.parse(raw) as Session) : null;
      if (s && typeof s.chainJobId === "number" && typeof s.farmer === "string" && Array.isArray(s.txs)) state = s;
    } catch {
      /* ignore */
    }
    emit();
  }
  return state;
}

export const getSession = () => state;
export function setSession(s: Session | null) {
  state = s;
  loaded = true;
  persist();
  emit();
}
export function patchSession(patch: Partial<Session>) {
  if (!state) return;
  setSession({ ...state, ...patch });
}
export function addSessionTx(tx: SessionTx) {
  if (!state) return;
  setSession({ ...state, txs: [...state.txs, tx] });
}
export function newSession(p: { farmer: string; chainJobId: number; fieldHash: string; areaCha: number; sprayDeadline: number; fieldName?: string; crop?: string; product?: string; farmerName?: string }) {
  setSession({ ...p, txs: [], recordKey: null, signers: [], resolution: null });
}

export function useSession(): Session | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
    () => null,
  );
}

// ---- the record waiting for validators (works in both modes, so it has its own store) ----
const PKEY = "kvali.pending.v1";
let pending: PendingRecord | null = null;
let pendingLoaded = false;
const pListeners = new Set<() => void>();

export function loadPending(): PendingRecord | null {
  if (!pendingLoaded) {
    pendingLoaded = true;
    try {
      const raw = globalThis.localStorage?.getItem(PKEY);
      const p = raw ? (JSON.parse(raw) as PendingRecord) : null;
      if (p && typeof p.key === "string" && Array.isArray(p.approvals)) pending = p;
    } catch {
      /* ignore */
    }
    pListeners.forEach((l) => l());
  }
  return pending;
}
export const getPending = () => pending;
export function setPending(p: PendingRecord | null) {
  pending = p;
  pendingLoaded = true;
  try {
    if (p) globalThis.localStorage?.setItem(PKEY, JSON.stringify(p));
    else globalThis.localStorage?.removeItem(PKEY);
  } catch {
    /* ignore */
  }
  pListeners.forEach((l) => l());
}
export function usePending(): PendingRecord | null {
  return useSyncExternalStore(
    (cb) => {
      pListeners.add(cb);
      return () => pListeners.delete(cb);
    },
    () => pending,
    () => null,
  );
}

// ---- finished jobs the user moved on from ("Start a new job"): not restored from the chain again ----
const DKEY = "kvali.dismissed.v1";
export function isDismissed(id: number): boolean {
  try {
    return (JSON.parse(globalThis.localStorage?.getItem(DKEY) ?? "[]") as number[]).includes(id);
  } catch {
    return false;
  }
}
export function dismissJob(id: number) {
  try {
    const list = JSON.parse(globalThis.localStorage?.getItem(DKEY) ?? "[]") as number[];
    globalThis.localStorage?.setItem(DKEY, JSON.stringify([...list.slice(-50), id]));
  } catch {
    /* ignore */
  }
}

/** Forget the job, the staged record, and every local marker (Reset demo). */
export function resetSessionStorage() {
  state = null;
  pending = null;
  try {
    ["kvali.session.v1", "kvali.pending.v1", DKEY, "kvali.certsig.v1", "kvali.jobcache.v1"].forEach((k) => globalThis.localStorage?.removeItem(k));
  } catch {
    /* ignore */
  }
  emit();
  pListeners.forEach((l) => l());
}
