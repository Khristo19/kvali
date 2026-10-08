import type { ReactNode } from "react";
import { Children } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";

import { DESKTOP_MIN_WIDTH, space } from "@/theme";

/** True at desktop widths (side nav, centred column, cards two-up). */
export function useWide(): boolean {
  const { width } = useWindowDimensions();
  return width >= DESKTOP_MIN_WIDTH;
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
