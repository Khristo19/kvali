// Farmer screen helpers. The visual pieces now live in components/ui; this file keeps the old exports.
import { EngineError } from "@/engine/types";

export { Button } from "@/components/ui/button";
export { ErrorText } from "@/components/ui/card";
export { useTick } from "@/components/ui/use-tick";

export function errorMessage(e: unknown): string {
  if (e instanceof EngineError) return e.message;
  return e instanceof Error ? e.message : "Something went wrong.";
}
