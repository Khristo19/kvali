// The farmer's saved fields (shared by the farmer screens). A new farmer starts with none: they draw their own, or add one of the
// sample vineyards (DEMO_FIELDS, real outlines) to try the demo quickly.
// Drawn fields, the samples added and the selected field are kept in localStorage per farmer wallet address (each switcher account has its own),
// loaded on the client after mount: never at module init or in the server render (static output).
import { useEffect, useSyncExternalStore } from "react";

import { lsKey } from "@/env";
import { hasBurner, keys } from "@/devnet/keys";
import { DEMO_FIELDS, fieldHash, type Field } from "./fields";

interface FieldsState {
  fields: Field[];
  /** Field used for the next job. */
  selectedId: string;
}
interface Saved {
  drawn: Field[];
  /** Ids of the sample fields this farmer added. Missing in data saved before fields started empty: then all samples are kept. */
  samples?: string[];
  selectedId?: string;
}

const isSample = (f: Field) => DEMO_FIELDS.some((d) => d.id === f.id);
const EMPTY: FieldsState = { fields: [], selectedId: "" };
const INITIAL: FieldsState = EMPTY;
let state: FieldsState = INITIAL;
/** Storage key the current state belongs to (null until loaded on the client). */
let loadedKey: string | null = null;
const listeners = new Set<() => void>();
const set = (s: FieldsState) => {
  state = s;
  persist();
  listeners.forEach((l) => l());
};

/** Per farmer wallet; "guest" before the farmer has a wallet in this browser. */
function storageKey(): string {
  let who = "guest";
  try {
    if (hasBurner("farmer")) who = keys.farmer.publicKey.toBase58();
  } catch {
    /* storage blocked */
  }
  return lsKey(`kvali.fields.v1.${who}`);
}

const validField = (f: unknown): f is Field => {
  const x = f as Field;
  return !!x && typeof x.id === "string" && typeof x.name === "string" && Array.isArray(x.outline) && x.outline.length >= 3 && x.outline.every((p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite));
};

function read(key: string): Saved | null {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    if (!raw) return null;
    const p = JSON.parse(raw) as Saved;
    return {
      drawn: Array.isArray(p.drawn) ? p.drawn.filter(validField) : [],
      samples: Array.isArray(p.samples) ? p.samples.filter((x): x is string => typeof x === "string") : undefined,
      selectedId: typeof p.selectedId === "string" ? p.selectedId : undefined,
    };
  } catch {
    return null;
  }
}

function persist() {
  if (!loadedKey) return;
  try {
    const drawn = state.fields.filter((f) => !isSample(f));
    const samples = state.fields.filter(isSample).map((f) => f.id);
    globalThis.localStorage?.setItem(loadedKey, JSON.stringify({ drawn, samples, selectedId: state.selectedId } satisfies Saved));
  } catch {
    /* storage blocked: fields live in memory for this tab */
  }
}

/** Load this farmer's fields (client only). A wallet created after loading takes over the fields added as a guest; another farmer's fields are not carried over. */
export function loadFields() {
  const key = storageKey();
  if (key === loadedKey) return;
  const fromGuest = loadedKey === lsKey("kvali.fields.v1.guest");
  const first = loadedKey === null;
  const saved = read(key);
  loadedKey = key;
  if (!saved) {
    if (fromGuest) persist(); // the guest's fields now belong to the new wallet
    else if (!first) {
      state = EMPTY; // a new farmer account starts with no fields
      listeners.forEach((l) => l());
    }
    return;
  }
  const samples = DEMO_FIELDS.filter((d) => (saved.samples ? saved.samples.includes(d.id) : true));
  const fields = [...samples, ...saved.drawn.filter((f) => !isSample(f))];
  const selectedId = fields.some((f) => f.id === saved.selectedId) ? (saved.selectedId as string) : (fields[0]?.id ?? "");
  state = { fields, selectedId };
  listeners.forEach((l) => l());
}

export function useFields(): FieldsState {
  useEffect(() => {
    loadFields();
  });
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
    () => INITIAL,
  );
}

export function getFields(): FieldsState {
  return state;
}

/** Add a field and select it for the next job. */
export function addField(f: Field) {
  set({ fields: [...state.fields, f], selectedId: f.id });
}

/** The next sample vineyard this farmer doesn't have yet (undefined once all are added). */
export function nextSample(s: FieldsState = state): Field | undefined {
  return DEMO_FIELDS.find((d) => !s.fields.some((f) => f.id === d.id));
}

/** Add the next sample vineyard and select it. */
export function addSampleField() {
  const f = nextSample();
  if (f) addField(f);
}

export function selectField(id: string) {
  if (id === state.selectedId) return;
  set({ ...state, selectedId: id });
}

/** The field for the next job (undefined while the farmer has no fields). */
export function selectedField(s: FieldsState = state): Field | undefined {
  return s.fields.find((f) => f.id === s.selectedId) ?? s.fields[0];
}

/** Find the field a job was posted with, by its outline hash (the samples too, so other roles in this browser can show them). */
export function fieldByHash(hash: string): Field | undefined {
  return state.fields.find((f) => fieldHash(f) === hash) ?? DEMO_FIELDS.find((f) => fieldHash(f) === hash);
}
