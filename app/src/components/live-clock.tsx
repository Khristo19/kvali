import type { ReactNode } from "react";

import { useTick } from "@/components/ui/use-tick";

/** The only place a 1-second tick should live: a leaf that re-renders itself alone, so surrounding cards and buttons stay still. */
export function LiveLeft({ endsAt, render }: { endsAt: number; render: (left: number) => ReactNode }) {
  const now = useTick();
  return <>{render(Math.max(0, endsAt - now))}</>;
}
