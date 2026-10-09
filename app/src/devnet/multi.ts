// STAGING ONLY (build flag EXPO_PUBLIC_ACCOUNT_SWITCHER, see src/env.ts): several burner accounts per role in one browser.
//  - Farmer 1..N and Operator 1..N: each is its own burner keypair (funded by the demo bank like the normal burner flow).
//  - Validator: which of the 3 public demo seats this browser acts as.
// The ACTIVE farmer / operator burner is always the one in "kvali.burners.v1" (devnet/keys.ts), so the rest of the app is unchanged.
// Switching stashes the outgoing account's local job context (session, pending record, job cache, certificate signature),
// loads the incoming one's, swaps the active burner and reloads the page, so every store starts clean and re-reads the chain.
import { useSyncExternalStore } from "react";

import { SWITCHER, lsKey } from "@/env";
import { VALIDATORS } from "@/engine/scenario";
import { Keypair } from "@solana/web3.js";
import { BKEY } from "./keys";

export type MultiRole = "farmer" | "operator";
export interface Entry {
  id: string;
  n: number;
  secret: number[];
  /** Stashed local job context while this account is not the active one. */
  ctx?: Record<string, string | null>;
  /** Created in the switcher and not funded yet: the next page load funds it. */
  fresh?: boolean;
}
interface Multi {
  farmer: Entry[];
  operator: Entry[];
  active: Record<MultiRole, string | null>;
  seat: string;
}

export const MAX_ACCOUNTS = 5;
const MKEY = lsKey("kvali.multi.v1");
const CTX_KEYS = ["kvali.session.v1", "kvali.pending.v1", "kvali.jobcache.v1", "kvali.certsig.v1"].map(lsKey);
const EMPTY: Multi = { farmer: [], operator: [], active: { farmer: null, operator: null }, seat: VALIDATORS[0].id };

let state: Multi = EMPTY;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const ls = () => globalThis.localStorage;

function persist() {
  if (!SWITCHER) return; // live keeps the seat in memory only
  try {
    ls()?.setItem(MKEY, JSON.stringify(state));
  } catch {
    /* storage blocked: the list lives in memory */
  }
}
function readBurners(): Partial<Record<MultiRole, number[]>> {
  try {
    return JSON.parse(ls()?.getItem(BKEY) ?? "null") ?? {};
  } catch {
    return {};
  }
}
function writeBurner(role: MultiRole, secret: number[]) {
  try {
    ls()?.setItem(BKEY, JSON.stringify({ ...readBurners(), [role]: secret }));
  } catch {
    /* ignore */
  }
}

/** Read the saved list and make it agree with the burner wallets that really exist (a Reset demo removes them). */
export function loadMulti() {
  if (!SWITCHER) return;
  let saved: Partial<Multi> = {};
  try {
    saved = JSON.parse(ls()?.getItem(MKEY) ?? "null") ?? {};
  } catch {
    /* ignore */
  }
  const burners = readBurners();
  const next: Multi = { farmer: [], operator: [], active: { farmer: null, operator: null }, seat: VALIDATORS.some((v) => v.id === saved.seat) ? (saved.seat as string) : VALIDATORS[0].id };
  for (const role of ["farmer", "operator"] as const) {
    const secret = burners[role];
    if (!secret || secret.length !== 64) continue; // no wallet in this browser: nothing to list yet
    let list = (saved[role] ?? []).filter((e) => e && e.secret?.length === 64);
    let hit = list.find((e) => e.secret.join() === secret.join());
    if (!hit) {
      hit = { id: `${role[0]}${nextN(list)}`, n: nextN(list), secret };
      list = [...list, hit];
    }
    next[role] = list;
    next.active[role] = hit.id;
  }
  state = next;
  persist();
  emit();
}
const nextN = (list: Entry[]) => list.reduce((m, e) => Math.max(m, e.n), 0) + 1;

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};
export const useMulti = (): Multi => useSyncExternalStore(subscribe, () => state, () => EMPTY);

export const roleName = (role: MultiRole) => (role === "farmer" ? "Farmer" : "Operator");
export const entryAddr = (e: Entry) => Keypair.fromSecretKey(Uint8Array.from(e.secret)).publicKey.toBase58();
export const entryLabel = (role: MultiRole, e: Entry) => `${roleName(role)} ${e.n}`;
export const activeEntry = (m: Multi, role: MultiRole) => m[role].find((e) => e.id === m.active[role]) ?? null;

/** The chip text for the active account of a role (null when the switcher is off). */
export function activeLabel(m: Multi, role: "farmer" | "operator" | "validator"): string | null {
  if (!SWITCHER) return null;
  if (role === "validator") {
    const v = VALIDATORS.find((x) => x.id === m.seat) ?? VALIDATORS[0];
    return `Validator (${v.seat} seat)`;
  }
  const e = activeEntry(m, role);
  return e ? entryLabel(role, e) : null;
}

// ---- validator seat ----
export const getSeat = () => state.seat;
export function setSeat(id: string) {
  if (!VALIDATORS.some((v) => v.id === id)) return;
  state = { ...state, seat: id };
  persist();
  emit();
}
export const useSeat = (): string => useSyncExternalStore(subscribe, () => state.seat, () => EMPTY.seat);

// ---- switching ----
function snapshot(): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const k of CTX_KEYS) out[k] = ls()?.getItem(k) ?? null;
  return out;
}
function applyCtx(ctx: Record<string, string | null> | undefined) {
  for (const k of CTX_KEYS) {
    const v = ctx?.[k];
    if (v == null) ls()?.removeItem(k);
    else ls()?.setItem(k, v);
  }
}

/** Make another account of this role the active one, then reload so everything starts from its state. */
export function switchTo(role: MultiRole, id: string) {
  const from = activeEntry(state, role);
  const to = state[role].find((e) => e.id === id);
  if (!to || to === from) return;
  const stash = snapshot();
  const list = state[role].map((e) => (e === from ? { ...e, ctx: stash } : e));
  state = { ...state, [role]: list, active: { ...state.active, [role]: to.id } };
  persist();
  applyCtx(to.ctx);
  writeBurner(role, to.secret);
  globalThis.location?.reload();
}

/** New burner account for a role (funded by the demo bank after the reload), made active. */
export function addAccount(role: MultiRole) {
  if (state[role].length >= MAX_ACCOUNTS) return;
  const n = nextN(state[role]);
  const entry: Entry = { id: `${role[0]}${n}`, n, secret: Array.from(Keypair.generate().secretKey), fresh: true };
  state = { ...state, [role]: [...state[role], entry] };
  persist();
  switchTo(role, entry.id);
}

/** Roles whose active account was just created and still needs funding. Clears the flag. */
export function consumeFresh(): MultiRole[] {
  const out: MultiRole[] = [];
  let next = state;
  for (const role of ["farmer", "operator"] as const) {
    const e = activeEntry(state, role);
    if (e?.fresh) {
      out.push(role);
      next = { ...next, [role]: next[role].map((x) => (x.id === e.id ? { ...x, fresh: false } : x)) };
    }
  }
  if (out.length) {
    state = next;
    persist();
    emit();
  }
  return out;
}
