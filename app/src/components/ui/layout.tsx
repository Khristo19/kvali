import { Children, useSyncExternalStore, type ReactNode } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";

import { DESKTOP_MIN_WIDTH, space } from "@/theme";

const noop = () => () => undefined;
/** False while the static page is rendered / hydrated, true afterwards (avoids React #418 hydration mismatches). */
export function useMounted(): boolean {
  return useSyncExternalStore(noop, () => true, () => false);
}

/** True at desktop widths (side nav, centred column, cards two-up). Always false until mounted so server and client markup match. */
export function useWide(): boolean {
  const { width } = useWindowDimensions();
  const mounted = useMounted();
  return mounted && width >= DESKTOP_MIN_WIDTH;
}

/** Stacks children on a phone; puts them side by side on desktop. */
export function TwoUp({ children }: { children: ReactNode }) {
  const wide = useWide();
  const items = Children.toArray(children);
  if (!wide) return <>{items}</>;
  return (
    <View style={styles.row}>
      {items.map((c, i) => (
        <View key={i} style={styles.cell}>
          {c}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: space.lg, alignItems: "stretch" },
  cell: { flex: 1, minWidth: 0, gap: space.lg },
});
