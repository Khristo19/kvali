import { Pressable, StyleSheet, Text } from "react-native";

import { colors, fonts, radius } from "@/theme";

export type ButtonKind = "primary" | "secondary" | "danger" | "warn";

/**
 * primary = filled green, secondary = outlined, danger = red outline, warn = orange outline.
 * Primary buttons are 56 px tall, `small` ones 48 px.
 * Note: inside expo-router <Link asChild> pass no function styles; this component uses one for the
 * pressed state, so call router.push in onPress instead of wrapping it in a Link.
 */
export function Button({
  label,
  onPress,
  kind = "primary",
  small,
  disabled,
  hint,
}: {
  label: string;
  onPress: () => void;
  kind?: ButtonKind;
  small?: boolean;
  disabled?: boolean;
  hint?: string;
}) {
  const k = KINDS[kind];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.btn,
        small ? styles.small : styles.large,
        k.box,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Text style={[styles.text, small ? styles.textSmall : styles.textLarge, k.text, disabled && styles.textDisabled]}>{label}</Text>
    </Pressable>
  );
}

const KINDS = {
  primary: { box: { backgroundColor: colors.green, borderColor: colors.green }, text: { color: colors.onAccent } },
  secondary: { box: { backgroundColor: colors.card, borderColor: colors.border }, text: { color: colors.ink } },
  danger: { box: { backgroundColor: colors.card, borderColor: colors.error }, text: { color: colors.error } },
  warn: { box: { backgroundColor: colors.card, borderColor: colors.accent }, text: { color: colors.accent } },
} as const;

const styles = StyleSheet.create({
  btn: { borderWidth: 1.5, alignItems: "center", justifyContent: "center", paddingHorizontal: 20, paddingVertical: 12, alignSelf: "stretch" },
  large: { minHeight: 56, borderRadius: radius.lg },
  small: { minHeight: 48, borderRadius: radius.md },
  text: { fontFamily: fonts.sans, fontWeight: "600", textAlign: "center", flexShrink: 1 },
  textLarge: { fontSize: 18, lineHeight: 24 },
  textSmall: { fontSize: 16, lineHeight: 22 },
  disabled: { backgroundColor: colors.border, borderColor: colors.border },
  textDisabled: { color: colors.muted },
  pressed: { opacity: 0.8 },
});
