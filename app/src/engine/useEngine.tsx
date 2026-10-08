// The only engine file that imports React. Exposes the SIMULATED engine to
// screens through context + useSyncExternalStore (no new dependencies).
import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { bootDevnet } from "@/devnet/bridge";
import { setDevnetState, getDevnetState, useMode } from "@/devnet/mode";
import type { Engine } from "./engine.ts";
import type { EngineState } from "./types.ts";
import { createDemoEngine } from "./scenario.ts";

interface Engines {
  sim: Engine;
  /** Local mirror of the real devnet job (see src/devnet/bridge.ts). */
  dev: Engine;
}
const EngineContext = createContext<Engines | null>(null);

const realClock = () => Math.floor(Date.now() / 1000);

/** Wrap the app. Pass your own engine (tests, w09 devnet adapter) or get the demo seed. */
export function EngineProvider({ engine, children }: { engine?: Engine; children: ReactNode }) {
  // Two engines on the real clock, created once: the SIMULATED one and the mirror used in devnet mode.
  const [engines] = useState<Engines>(() => ({ sim: engine ?? createDemoEngine(realClock), dev: createDemoEngine(realClock) }));
  const mode = useMode();
  // Entering devnet mode (default on web): probe the RPC, read real balances; fall back to the simulation if unreachable.
  useEffect(() => {
    if (mode !== "devnet") return;
    const st = getDevnetState().status;
    if (st === "ready" || st === "connecting") return;
    void bootDevnet(engines.dev);
  }, [mode, engines]);
  useEffect(() => {
    if (mode !== "devnet") setDevnetState({ busy: null });
  }, [mode]);
  return <EngineContext.Provider value={engines}>{children}</EngineContext.Provider>;
}

/** The engine instance (call actions on it: engine.postJob(...)). State updates re-render subscribers. */
export function useEngineInstance(): Engine {
  const e = useContext(EngineContext);
  const mode = useMode();
  if (!e) throw new Error("useEngine must be used inside <EngineProvider>");
  return mode === "devnet" ? e.dev : e.sim;
}

/** Current immutable engine state; re-renders after every successful action. */
export function useEngineState(): EngineState {
  const e = useEngineInstance();
  return useSyncExternalStore(e.subscribe, e.getState, e.getState);
}

/** State plus the engine for calling actions. */
export function useEngine() {
  const engine = useEngineInstance();
  const state = useEngineState();
  return useMemo(() => ({ engine, state }), [engine, state]);
}
