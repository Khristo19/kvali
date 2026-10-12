// A calendar date input. Web: the browser's own date picker (<input type="date">, rendered by react-dom, keyboard and
// screen reader friendly); native: a plain text box that takes YYYY-MM-DD. Values are local calendar dates, "YYYY-MM-DD".
import { createElement } from "react";
import { Platform, StyleSheet, Text, TextInput, View } from "react-native";

import { colors, fonts, radius } from "@/theme";

/** Local calendar date of `d` as "YYYY-MM-DD" (not UTC: "tomorrow" is the farmer's tomorrow). */
export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Today plus `days`, as "YYYY-MM-DD". Call only on the client (it reads the clock). */
export function daysFromToday(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

export const isIsoDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

export function DateField({ id, label, hint, value, min, onChange, testID }: { id: string; label: string; hint?: string; value: string; min?: string; onChange: (v: string) => void; testID?: string }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.label} nativeID={`${id}-label`}>
        {label}
      </Text>
      {Platform.OS === "web" ? (
        createElement("input", {
          type: "date",
          id,
          value,
          min,
          required: true,
          "aria-labelledby": `${id}-label`,
          "aria-describedby": hint ? `${id}-hint` : undefined,
          "data-testid": testID,
          onChange: (e: { target: { value: string } }) => onChange(e.target.value),
          style: web,
        })
      ) : (
        <TextInput
          testID={testID}
          accessibilityLabel={label}
          value={value}
          onChangeText={onChange}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={colors.muted}
          maxLength={10}
          style={styles.input}
        />
      )}
      {hint ? (
        <Text style={styles.hint} nativeID={`${id}-hint`}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontFamily: fonts.sans, fontSize: 16, fontWeight: "600", color: colors.ink },
  hint: { fontFamily: fonts.sans, fontSize: 14, color: colors.muted },
  input: {
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.card,
    color: colors.ink,
    fontFamily: fonts.sans,
    fontSize: 17,
  },
});

/** The same look as the text inputs, as plain CSS for the DOM element. */
const web = {
  boxSizing: "border-box",
  width: "100%",
  maxWidth: 320,
  minHeight: 48,
  padding: "0 14px",
  borderRadius: radius.md,
  border: `1.5px solid ${colors.border}`,
  backgroundColor: colors.card,
  color: colors.ink,
  fontFamily: fonts.sans,
  fontSize: 17,
} as const;
