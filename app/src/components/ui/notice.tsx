// One visible result line for every action (success or error), shown under the page header.
import { useSyncExternalStore } from "react";

import { Banner } from "./card";

interface Notice {
  tone: "ok" | "error" | "info";
  text: string;
  id: number;
}
let current: Notice | null = null;
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function notify(tone: Notice["tone"], text: string) {
  current = { tone, text, id: ++seq };
  emit();
}
export function clearNotice() {
  current = null;
  emit();
}

export function NoticeBar() {
  const n = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
    () => null,
  );
  if (!n) return null;
  return <Banner tone={n.tone} text={n.text} />;
}
