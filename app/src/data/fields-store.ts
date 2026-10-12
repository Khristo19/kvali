// The farmer's saved fields (shared by the farmer screens): the demo fields, always there, plus the fields drawn in this browser.
// Drawn fields and the selected field are kept in localStorage per farmer wallet address (each switcher account has its own),
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
  selectedId?: string;
}

const INITIAL: FieldsState = { fields: DEMO_FIELDS, selectedId: DEMO_FIELDS[0].id };
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
    return { drawn: Array.isArray(p.drawn) ? p.drawn.filter(validField) : [], selectedId: typeof p.selectedId === "string" ? p.selectedId : undefined };
  } catch {
    return null;
  }
}

function persist() {
  if (!loadedKey) return;
  try {
    const drawn = state.fields.filter((f) => !DEMO_FIELDS.some((d) => d.id === f.id));
    globalThis.localStorage?.setItem(loadedKey, JSON.stringify({ drawn, selectedId: state.selectedId } satisfies Saved));
  } catch {
    /* storage blocked: fields live in memory for this tab */
  }
}

/** Load this farmer's fields (client only). A wallet created after loading takes over the fields drawn as a guest. */
export function loadFields() {
  const key = storageKey();
  if (key === loadedKey) return;
  const first = loadedKey === null;
  const saved = read(key);
  loadedKey = key;
  if (!saved) {
    if (!first) persist(); // the guest's fields now belong to the new wallet
    return;
  }
  const fields = [...DEMO_FIELDS, ...saved.drawn.filter((f) => !DEMO_FIELDS.some((d) => d.id === f.id))];
  const selectedId = fields.some((f) => f.id === saved.selectedId) ? (saved.selectedId as string) : fields[0].id;
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

export function selectField(id: string) {
  if (id === state.selectedId) return;
  set({ ...state, selectedId: id });
}

export function selectedField(s: FieldsState = state): Field {
  return s.fields.find((f) => f.id === s.selectedId) ?? s.fields[0];
}

/** Find the field a job was posted with, by its outline hash. */
export function fieldByHash(hash: string): Field | undefined {
  return state.fields.find((f) => fieldHash(f) === hash);
}
