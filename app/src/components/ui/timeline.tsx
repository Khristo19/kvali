import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { colors, fonts } from "@/theme";
import { Icon } from "./icons";

export type StepState = "done" | "current" | "todo";

/**
 * One step of a vertical timeline: check circle (done), ringed dot (current) or empty ring (todo),
 * joined to the next step by a line. Pass `last` on the final step.
 */
export function TimelineStep({
  state,
  title,
  detail,
  last,
  children,
}: {
  state: StepState;
  title: string;
  detail?: string;
  last?: boolean;
  children?: ReactNode;
}) {
  return (
    <View
      accessible
      accessibilityLabel={`${title}${state === "done" ? ", done" : state === "current" ? ", current step" : ""}${detail ? `. ${detail}` : ""}`}
      style={styles.step}
    >
      <View style={styles.rail}>
        {state === "done" ? (
          <View style={[styles.dot, { backgroundColor: colors.green }]}>
            <Icon name="check" color={colors.card} size={16} />
          </View>
        ) : state === "current" ? (
          <View style={[styles.dot, { backgroundColor: colors.card, borderWidth: 4, borderColor: colors.green }]}>
            <View style={styles.inner} />
          </View>
        ) : (
          <View style={[styles.dot, { backgroundColor: colors.card, borderWidth: 2, borderColor: colors.border }]} />
        )}
        {!last && (
          <View
            style={[
              styles.line,
              state === "done" ? { backgroundColor: colors.green } : { borderLeftWidth: 3, borderLeftColor: colors.border, borderStyle: "dashed" },
            ]}
          />
        )}
      </View>
      <View style={[styles.body, last && { paddingBottom: 12 }]}>
        <Text
          style={[
            styles.title,
            state === "current" && { color: colors.green, fontWeight: "700" },
            state === "todo" && { color: colors.muted },
          ]}
        >
          {title}
        </Text>
        {detail ? <Text style={[styles.detail, state === "current" && { color: colors.body }]}>{detail}</Text> : null}
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  step: { flexDirection: "row", gap: 14, minHeight: 60 },
  rail: { alignItems: "center", width: 28, flexShrink: 0 },
  dot: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  inner: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.green },
  line: { width: 3, flex: 1, marginVertical: 4 },
  body: { flex: 1, flexShrink: 1, minWidth: 0, paddingBottom: 14, gap: 2 },
  title: { fontFamily: fonts.sans, fontSize: 17, lineHeight: 24, fontWeight: "600", color: colors.ink },
  detail: { fontFamily: fonts.sans, fontSize: 16, lineHeight: 22, color: colors.muted },
});
