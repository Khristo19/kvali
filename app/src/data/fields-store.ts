// In-memory list of the farmer's saved fields (shared by the farmer screens). Starts with the demo fields.
import { useSyncExternalStore } from "react";

import { DEMO_FIELDS, fieldHash, type Field } from "./fields";

interface FieldsState {
  fields: Field[];
  /** Field used for the next job. */
  selectedId: string;
}

let state: FieldsState = { fields: DEMO_FIELDS, selectedId: DEMO_FIELDS[0].id };
const listeners = new Set<() => void>();
const set = (s: FieldsState) => {
  state = s;
  listeners.forEach((l) => l());
};

export function useFields(): FieldsState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
    () => state,
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
  set({ ...state, selectedId: id });
}

export function selectedField(s: FieldsState = state): Field {
  return s.fields.find((f) => f.id === s.selectedId) ?? s.fields[0];
}

/** Find the field a job was posted with, by its outline hash. */
export function fieldByHash(hash: string): Field | undefined {
  return state.fields.find((f) => fieldHash(f) === hash);
}
