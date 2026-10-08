import { useEffect, useState } from "react";

/**
 * Re-renders the caller every `ms` (default 1 s) and returns the current time in whole seconds.
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
