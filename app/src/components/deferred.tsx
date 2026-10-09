import { useEffect, useState, type ReactNode } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { colors, radius } from "@/theme";

/** Resolves after the browser has painted (next frame, then a macrotask), so a click is answered before heavy work starts. */
export function afterPaint(fn: () => void): () => void {
  let cancelled = false;
  let t: ReturnType<typeof setTimeout> | undefined;
  const run = () => {
    t = setTimeout(() => {
      if (!cancelled) fn();
    }, 0);
  };
  const raf = typeof requestAnimationFrame === "function" ? requestAnimationFrame(run) : (run(), 0);
  return () => {
    cancelled = true;
    if (t) clearTimeout(t);
    if (typeof cancelAnimationFrame === "function" && raf) cancelAnimationFrame(raf);
  };
}

/** True once the first paint is done. Use it to hold back heavy subtrees (maps, record checks) for one frame. */
export function useAfterPaint(): boolean {
  const [ok, setOk] = useState(false);
  useEffect(() => afterPaint(() => setOk(true)), []);
  return ok;
}

/** A fixed-height skeleton: reserves the space so nothing moves when the real content arrives. */
export function Skeleton({ height, testID = "skeleton" }: { height: number; testID?: string }) {
  return (
    <View testID={testID} accessibilityLiveRegion="polite" style={[styles.box, { height }]}>
      <ActivityIndicator color={colors.green} />
    </View>
  );
}

/** Renders `children` one frame after mount; until then a skeleton of the same height holds the place. */
export function Deferred({ height, children }: { height: number; children: ReactNode }) {
  const ok = useAfterPaint();
  return ok ? <>{children}</> : <Skeleton height={height} />;
}

const styles = StyleSheet.create({
  box: { alignItems: "center", justifyContent: "center", borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
});
