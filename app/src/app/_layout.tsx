import "@/devnet/polyfill";
import { Slot, Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Platform, View } from "react-native";

import { StagingBadge } from "@/components/ui/staging-badge";
import { SessionEffects } from "@/components/session-effects";
import { EngineProvider } from "@/engine/useEngine";
import { colors } from "@/theme";

export default function RootLayout() {
  return (
    <EngineProvider>
      <StatusBar style="dark" />
      <SessionEffects />
      <StagingBadge />
      {Platform.OS === "web" ? (
        // On the web only the active page exists in the document: no hidden previous screens that could take clicks
        // or show up in the accessibility tree. The browser history provides Back.
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          <Slot />
        </View>
      ) : (
        <Stack
          screenOptions={{
            // Every screen draws its own header (ScreenHeader) and nav.
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Screen name="index" options={{ title: "Kvali" }} />
          <Stack.Screen name="farmer" options={{ title: "Farmer" }} />
          <Stack.Screen name="mark-field" options={{ title: "Mark your field" }} />
          <Stack.Screen name="operator" options={{ title: "Operator" }} />
          <Stack.Screen name="validator" options={{ title: "Validator" }} />
          <Stack.Screen name="job" options={{ title: "Job story" }} />
          <Stack.Screen name="how-it-works" options={{ title: "How it works" }} />
        </Stack>
      )}
    </EngineProvider>
  );
}
