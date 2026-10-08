import { useEffect, useState, useSyncExternalStore } from "react";

/**
 * Re-renders the caller every `ms` (default 1 s) and returns the current time in whole seconds.
 * Use ONLY in small leaf components that show a live clock; pages, cards and buttons must not tick every second
 * (a re-render in the middle of a click can swallow it). For "has this time passed yet" use useReached().
 * React Compiler is on: countdowns must be derived from this `now` (windowLeft(job, now)),
 * never from engine.windowRemaining(), or the compiler will cache the result.
 */
export function useTick(ms = 1000): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

// One shared 1 s timer for every useReached() subscriber.
const subs = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
function subscribe(cb: () => void) {
  subs.add(cb);
  if (!timer) timer = setInterval(() => subs.forEach((s) => s()), 1000);
  return () => {
    subs.delete(cb);
    if (subs.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

/** True once the clock has reached `unixSecs`. The caller re-renders only when this flips, not every second. */
export function useReached(unixSecs: number | null | undefined): boolean {
  const target = unixSecs ?? Number.POSITIVE_INFINITY;
  return useSyncExternalStore(
    subscribe,
    () => Date.now() / 1000 >= target,
    () => false,
  );
}
