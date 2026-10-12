// Small square buttons that float over a map (zoom, recenter, my location), with icons drawn from plain Views.
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { Pressable } from "@/components/ui/pressable";
import { colors } from "@/theme";

export type MapIconName = "plus" | "minus" | "fit" | "locate" | "expand" | "close";

function Bar({ w, h, color }: { w: number; h: number; color: string }) {
  return <View style={{ position: "absolute", width: w, height: h, borderRadius: Math.min(w, h) / 2, backgroundColor: color }} />;
}

export function MapIcon({ name, color = colors.ink }: { name: MapIconName; color?: string }) {
  let body: ReactNode = null;
  if (name === "plus" || name === "minus") {
    body = (
      <>
        <Bar w={16} h={2.5} color={color} />
        {name === "plus" ? <Bar w={2.5} h={16} color={color} /> : null}
      </>
    );
  } else if (name === "fit") {
    // Four corner brackets: "show the whole field".
    const c = { position: "absolute", width: 6, height: 6, borderColor: color } as const;
    body = (
      <>
        <View style={[c, { left: 1, top: 1, borderLeftWidth: 2.5, borderTopWidth: 2.5 }]} />
        <View style={[c, { right: 1, top: 1, borderRightWidth: 2.5, borderTopWidth: 2.5 }]} />
        <View style={[c, { left: 1, bottom: 1, borderLeftWidth: 2.5, borderBottomWidth: 2.5 }]} />
        <View style={[c, { right: 1, bottom: 1, borderRightWidth: 2.5, borderBottomWidth: 2.5 }]} />
        <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: color }} />
      </>
    );
  } else if (name === "expand") {
    // Four bigger corner brackets pointing outward: "make the map bigger".
    const c = { position: "absolute", width: 7, height: 7, borderColor: color } as const;
    body = (
      <>
        <View style={[c, { left: 0, top: 0, borderLeftWidth: 2.5, borderTopWidth: 2.5 }]} />
        <View style={[c, { right: 0, top: 0, borderRightWidth: 2.5, borderTopWidth: 2.5 }]} />
        <View style={[c, { left: 0, bottom: 0, borderLeftWidth: 2.5, borderBottomWidth: 2.5 }]} />
        <View style={[c, { right: 0, bottom: 0, borderRightWidth: 2.5, borderBottomWidth: 2.5 }]} />
      </>
    );
  } else if (name === "close") {
    // An X: two bars crossed at 45 degrees.
    const x = { position: "absolute", width: 18, height: 2.5, borderRadius: 1.25, backgroundColor: color } as const;
    body = (
      <>
        <View style={[x, { transform: [{ rotate: "45deg" }] }]} />
        <View style={[x, { transform: [{ rotate: "-45deg" }] }]} />
      </>
    );
  } else {
    // Ring with a dot and four ticks: "my location".
    body = (
      <>
        <View style={{ position: "absolute", width: 14, height: 14, borderRadius: 7, borderWidth: 2.5, borderColor: color }} />
        <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: color }} />
        <View style={{ position: "absolute", top: 0, width: 2.5, height: 4, backgroundColor: color }} />
        <View style={{ position: "absolute", bottom: 0, width: 2.5, height: 4, backgroundColor: color }} />
        <View style={{ position: "absolute", left: 0, width: 4, height: 2.5, backgroundColor: color }} />
        <View style={{ position: "absolute", right: 0, width: 4, height: 2.5, backgroundColor: color }} />
      </>
    );
  }
  return (
    <View pointerEvents="none" style={styles.icon}>
      {body}
    </View>
  );
}

export function MapButton({
  icon,
  label,
  onPress,
  disabled,
  testID,
}: {
  icon: MapIconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.btn, disabled && styles.off, pressed && !disabled && styles.pressed]}
    >
      <MapIcon name={icon} color={disabled ? colors.muted : colors.ink} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  icon: { width: 20, height: 20, alignItems: "center", justifyContent: "center" },
  btn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 1px 4px rgba(0,0,0,0.35)",
  } as never,
  off: { opacity: 0.55 },
  pressed: { backgroundColor: "#ECE8DA" },
});
