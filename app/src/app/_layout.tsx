import "@/devnet/polyfill";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

import { EngineProvider } from "@/engine/useEngine";
import { colors } from "@/theme";

export default function RootLayout() {
  return (
    <EngineProvider>
      <StatusBar style="dark" />
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
    </EngineProvider>
  );
}
