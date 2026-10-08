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

/** Cards side by side when there is room (two columns of at least 340 px), stacked otherwise. Pure flex-wrap: no JS width check, no layout jump. */
export function TwoUp({ children }: { children: ReactNode }) {
  const items = Children.toArray(children);
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
  row: { flexDirection: "row", flexWrap: "wrap", gap: space.lg, alignItems: "stretch" },
  cell: { flexGrow: 1, flexShrink: 1, flexBasis: 340, minWidth: 0, gap: space.lg },
});
