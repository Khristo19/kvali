import { StyleSheet, Text, View } from "react-native";

import { IS_STAGING } from "@/env";
import { colors, fonts } from "@/theme";

/** Small "STAGING" marker (staging build only). Fixed over the page, never takes clicks and never moves the layout. */
export function StagingBadge() {
  if (!IS_STAGING) return null;
  return (
    <View pointerEvents="none" style={styles.wrap} testID="staging-badge" accessibilityLabel="Staging site">
      <Text style={styles.text}>STAGING</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", top: 0, left: 0, right: 0, alignItems: "center", zIndex: 1000 } as never,
  text: {
    fontFamily: fonts.sans,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.2,
    color: "#FFFFFF",
    backgroundColor: colors.accent,
    paddingHorizontal: 8,
    paddingVertical: 1,
    borderBottomLeftRadius: 6,
    borderBottomRightRadius: 6,
    overflow: "hidden",
  },
});
