// Demo account: name + email + role, kept only in this browser (localStorage). No password, no network.
// The role is bound to that role's PUBLIC devnet demo key (src/devnet/keys.ts), shown as the account address.
import { SWITCHER, lsKey } from "@/env";
import { useSyncExternalStore } from "react";

import { keyFor, keys } from "@/devnet/keys";
import { getSeat } from "@/devnet/multi";

export type Role = "farmer" | "operator" | "validator";
export interface Account {
  name: string;
  email: string;
  role: Role;
}

const KEY = lsKey("kvali.accounts.v2");
// One account per role, so each role page shows its own person. `last` = the role signed in most recently.
interface Accounts {
  farmer?: Account;
  operator?: Account;
  validator?: Account;
  last?: Role;
}
// Empty until loadAccount() runs on the client, so the static page and the first client render match.
let state: Accounts = {};
let loaded = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const ROLES: Role[] = ["farmer", "operator", "validator"];
const valid = (a: unknown): a is Account => !!a && typeof (a as Account).name === "string" && ROLES.includes((a as Account).role);

function persist() {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage blocked: accounts live in memory */
  }
}

export function loadAccount() {
  if (loaded) return;
  loaded = true;
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Accounts;
      const next: Accounts = {};
      for (const r of ROLES) if (valid(p[r])) next[r] = p[r];
      if (p.last && next[p.last]) next.last = p.last;
      state = next;
    } else {
      // v1 held a single account
      const old = globalThis.localStorage?.getItem(lsKey("kvali.account.v1"));
      const a = old ? JSON.parse(old) : null;
      if (valid(a)) state = { [a.role]: a, last: a.role };
    }
  } catch {
    /* ignore */
  }
  emit();
}

export function saveAccount(a: Account) {
  state = { ...state, [a.role]: a, last: a.role };
  loaded = true;
  persist();
  emit();
}

/** Sign out one role (or every role when none is given). */
export function signOut(role?: Role) {
  if (!role) state = {};
  else {
    const next = { ...state };
    delete next[role];
    if (next.last === role) next.last = ROLES.find((r) => next[r]);
    state = next;
  }
  persist();
  emit();
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};
const EMPTY: Accounts = {};
export const getAccounts = () => state;
export const getAccountFor = (role: Role): Account | null => state[role] ?? null;
/** The account of one role (null if that role has nobody signed in). Without a role: the most recent one. */
export function useAccount(role?: Role): Account | null {
  const s = useSyncExternalStore(subscribe, () => state, () => EMPTY);
  const r = role ?? s.last;
  return r ? (s[r] ?? null) : null;
}
export function useAccounts(): Accounts {
  return useSyncExternalStore(subscribe, () => state, () => EMPTY);
}

/** Public devnet demo address bound to a role (validators: the neutral seat). */
export function addressFor(role: Role): string {
  const k = role === "farmer" ? keys.farmer : role === "operator" ? keys.operator : SWITCHER ? keyFor(getSeat()) : keys.vNeutral;
  return k.publicKey.toBase58();
}
export const shortAddr = (a: string) => `${a.slice(0, 4)}...${a.slice(-4)}`;
export const roleHome = (r: Role) => (r === "farmer" ? "/farmer" : r === "operator" ? "/operator" : "/validator");
export const roleLabel = (r: Role) => (r === "farmer" ? "Farmer" : r === "operator" ? "Drone operator" : "Validator");
