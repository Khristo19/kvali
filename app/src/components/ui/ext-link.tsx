import type { ReactNode } from "react";
import { Linking, Platform, Text, type StyleProp, type TextStyle } from "react-native";

/** Link that opens in a new tab. On the web it is a real <a target="_blank">, so the browser opens it once, in one tab. */
export function ExtLink({ url, children, style, label, testID }: { url: string; children: ReactNode; style?: StyleProp<TextStyle>; label?: string; testID?: string }) {
  const web = Platform.OS === "web" ? ({ href: url, hrefAttrs: { target: "_blank", rel: "noopener noreferrer" } } as object) : {};
  return (
    <Text testID={testID} accessibilityRole="link" accessibilityLabel={label} style={style} onPress={Platform.OS === "web" ? undefined : () => void Linking.openURL(url)} {...web}>
      {children}
    </Text>
  );
}
