import { StyleSheet, Text, View } from "react-native";

import { fonts } from "@/theme";

export type IconName = "check" | "back" | "jobs" | "plus" | "wallet" | "help" | "pin" | "drone" | "list" | "person" | "lock";

/** Small icons built from plain Views (no icon package is installed). */
export function Icon({ name, color, size = 24 }: { name: IconName; color: string; size?: number }) {
  const s = size;
  const w = Math.max(2, Math.round(s / 10));
  const box = { width: s, height: s, alignItems: "center", justifyContent: "center" } as const;
  switch (name) {
    case "check":
      return (
        <View style={box}>
          <View
            style={{
              width: s * 0.3,
              height: s * 0.55,
              borderRightWidth: w,
              borderBottomWidth: w,
              borderColor: color,
              transform: [{ rotate: "45deg" }, { translateY: -s * 0.06 }],
            }}
          />
        </View>
      );
    case "back":
      return (
        <View style={box}>
          <View
            style={{
              width: s * 0.42,
              height: s * 0.42,
              borderLeftWidth: w,
              borderBottomWidth: w,
              borderColor: color,
              transform: [{ rotate: "45deg" }, { translateX: s * 0.08 }, { translateY: -s * 0.08 }],
            }}
          />
        </View>
      );
    case "jobs":
      return (
        <View style={box}>
          <View style={{ width: s * 0.38, height: s * 0.16, borderWidth: w, borderBottomWidth: 0, borderColor: color, borderTopLeftRadius: 3, borderTopRightRadius: 3 }} />
          <View style={{ width: s * 0.84, height: s * 0.54, borderWidth: w, borderColor: color, borderRadius: 4, justifyContent: "center" }}>
            <View style={{ height: w, backgroundColor: color }} />
          </View>
        </View>
      );
    case "plus":
      return (
        <View style={[box, { borderWidth: w, borderColor: color, borderRadius: s / 2 }]}>
          <View style={{ position: "absolute", width: s * 0.44, height: w, backgroundColor: color }} />
          <View style={{ position: "absolute", width: w, height: s * 0.44, backgroundColor: color }} />
        </View>
      );
    case "wallet":
      return (
        <View style={box}>
          <View style={{ width: s * 0.86, height: s * 0.6, borderWidth: w, borderColor: color, borderRadius: 5 }}>
            <View style={{ height: w, backgroundColor: color, marginTop: s * 0.14 }} />
          </View>
        </View>
      );
    case "help":
      return (
        <View style={[box, { borderWidth: w, borderColor: color, borderRadius: s / 2 }]}>
          <Text style={{ color, fontFamily: fonts.display, fontWeight: "700", fontSize: s * 0.58, lineHeight: s * 0.7 }}>?</Text>
        </View>
      );
    case "pin":
      return (
        <View style={box}>
          <View
            style={{
              width: s * 0.62,
              height: s * 0.62,
              borderWidth: w,
              borderColor: color,
              borderRadius: s * 0.31,
              borderBottomRightRadius: 0,
              transform: [{ rotate: "45deg" }, { translateY: -s * 0.04 }],
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <View style={{ width: s * 0.2, height: s * 0.2, borderRadius: s * 0.1, borderWidth: w, borderColor: color }} />
          </View>
        </View>
      );
    case "drone": {
      const dot = { position: "absolute", width: s * 0.28, height: s * 0.28, borderRadius: s * 0.14, borderWidth: w, borderColor: color } as const;
      return (
        <View style={box}>
          <View style={[dot, { top: 0, left: 0 }]} />
          <View style={[dot, { top: 0, right: 0 }]} />
          <View style={[dot, { bottom: 0, left: 0 }]} />
          <View style={[dot, { bottom: 0, right: 0 }]} />
          <View style={{ width: s * 0.3, height: s * 0.3, borderWidth: w, borderColor: color, borderRadius: 3 }} />
        </View>
      );
    }
    case "list":
      return (
        <View style={[box, { gap: s * 0.16 }]}>
          <View style={{ width: s * 0.84, height: w, backgroundColor: color }} />
          <View style={{ width: s * 0.84, height: w, backgroundColor: color }} />
          <View style={{ width: s * 0.55, height: w, backgroundColor: color, alignSelf: "flex-start", marginLeft: s * 0.08 }} />
        </View>
      );
    case "person":
      return (
        <View style={[box, { gap: s * 0.06 }]}>
          <View style={{ width: s * 0.36, height: s * 0.36, borderRadius: s * 0.18, borderWidth: w, borderColor: color }} />
          <View style={{ width: s * 0.72, height: s * 0.34, borderWidth: w, borderColor: color, borderTopLeftRadius: s * 0.36, borderTopRightRadius: s * 0.36, borderBottomWidth: 0 }} />
        </View>
      );
    case "lock":
      return (
        <View style={box}>
          <View style={{ width: s * 0.36, height: s * 0.3, borderWidth: w, borderColor: color, borderTopLeftRadius: s * 0.18, borderTopRightRadius: s * 0.18, borderBottomWidth: 0 }} />
          <View style={{ width: s * 0.66, height: s * 0.42, borderRadius: 4, backgroundColor: color }} />
        </View>
      );
  }
}

export const iconStyles = StyleSheet.create({});
