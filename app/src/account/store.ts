// Demo account: name + email + role, kept only in this browser (localStorage). No password, no network.
// The role is bound to that role's PUBLIC devnet demo key (src/devnet/keys.ts), shown as the account address.
import { useSyncExternalStore } from "react";

import { keys } from "@/devnet/keys";

export type Role = "farmer" | "operator" | "validator";
export interface Account {
  name: string;
  email: string;
  role: Role;
}

const KEY = "kvali.account.v1";
// null until loadAccount() runs on the client, so the static page and the first client render match.
let state: Account | null = null;
let loaded = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function loadAccount() {
  if (loaded) return;
  loaded = true;
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    const a = raw ? (JSON.parse(raw) as Account) : null;
    if (a && typeof a.name === "string" && ["farmer", "operator", "validator"].includes(a.role)) state = a;
  } catch {
    /* storage blocked: the account just lives in memory */
  }
  emit();
}

export function saveAccount(a: Account) {
  state = a;
  loaded = true;
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(a));
  } catch {
    /* ignore */
  }
  emit();
}

export function signOut() {
  state = null;
  try {
    globalThis.localStorage?.removeItem(KEY);
  } catch {
    /* ignore */
  }
  emit();
}

export const getAccount = () => state;
export function useAccount(): Account | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
    () => null,
  );
}

/** Public devnet demo address bound to a role (validators: the neutral seat). */
export function addressFor(role: Role): string {
  const k = role === "farmer" ? keys.farmer : role === "operator" ? keys.operator : keys.vNeutral;
  return k.publicKey.toBase58();
}
export const shortAddr = (a: string) => `${a.slice(0, 4)}...${a.slice(-4)}`;
export const roleHome = (r: Role) => (r === "farmer" ? "/farmer" : r === "operator" ? "/operator" : "/validator");
export const roleLabel = (r: Role) => (r === "farmer" ? "Farmer" : r === "operator" ? "Drone operator" : "Validator");
