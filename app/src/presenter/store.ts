// Presenter mode: the same build, plus a drawer with the demo controls (account switcher, job shortcuts, reset).
// Turned on by opening any page with ?present=1 (kept for the browser tab in sessionStorage), off with ?present=0 or "Exit presenter".
// Without it the site is exactly what a user sees.
// Pages are pre-rendered in Node (static web output): nothing here touches window / sessionStorage at module load or on the server,
// and the hooks use a server snapshot of false so hydration matches.
import { useSyncExternalStore } from "react";

import { lsKey } from "@/env";

const KEY = lsKey("kvali.presenter.v1");
const OPEN_KEY = lsKey("kvali.presenter.open.v1");
const HIDE_KEY = lsKey("kvali.presenter.hide.v1");

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};
const ss = (): Storage | undefined => globalThis.sessionStorage;
const onClient = () => typeof window !== "undefined" && !!window.location;

let cached: boolean | null = null;

/** True when this tab is in presenter mode. Always false on the server. */
export function isPresenter(): boolean {
  if (!onClient()) return false;
  if (cached !== null) return cached;
  const param = new URLSearchParams(window.location.search).get("present");
  try {
    const s = ss();
    if (param === "1") s?.setItem(KEY, "1");
    else if (param === "0") {
      s?.removeItem(KEY);
      s?.removeItem(OPEN_KEY);
      s?.removeItem(HIDE_KEY);
    }
    cached = s?.getItem(KEY) === "1";
  } catch {
    cached = param === "1"; // storage blocked: the flag lives in the URL only
  }
  return cached;
}

/** The multi-account switcher (several farmers / operators, validator seat) runs only in presenter mode. */
export function switcherOn(): boolean {
  return isPresenter() && process.env.EXPO_PUBLIC_ACCOUNT_SWITCHER !== "0";
}

export const usePresenter = (): boolean => useSyncExternalStore(subscribe, isPresenter, () => false);

export interface PresenterUi {
  open: boolean;
  hidden: boolean;
}
const SERVER_UI: PresenterUi = { open: false, hidden: false };
let ui: PresenterUi | null = null;

function readUi(): PresenterUi {
  if (!onClient()) return SERVER_UI;
  if (ui) return ui;
  try {
    ui = { open: ss()?.getItem(OPEN_KEY) === "1", hidden: ss()?.getItem(HIDE_KEY) === "1" };
  } catch {
    ui = { open: false, hidden: false };
  }
  return ui;
}

/** Drawer open / floating button hidden. Kept per tab, so the drawer is still open after an account switch reloads the page. */
export const usePresenterUi = (): PresenterUi => useSyncExternalStore(subscribe, readUi, () => SERVER_UI);

function setUi(key: string, patch: Partial<PresenterUi>, on: boolean) {
  try {
    if (on) ss()?.setItem(key, "1");
    else ss()?.removeItem(key);
  } catch {
    /* storage blocked: kept in memory */
  }
  ui = { ...readUi(), ...patch };
  emit();
}
export const setPresenterOpen = (open: boolean) => setUi(OPEN_KEY, { open }, open);
export const setPresenterHidden = (hidden: boolean) => setUi(HIDE_KEY, { hidden }, hidden);

/** Leave presenter mode: forget the flag and reload without ?present. */
export function exitPresenter() {
  try {
    ss()?.removeItem(KEY);
    ss()?.removeItem(OPEN_KEY);
    ss()?.removeItem(HIDE_KEY);
  } catch {
    /* ignore */
  }
  const u = new URL(location.href);
  u.searchParams.delete("present");
  location.replace(u.toString());
}
