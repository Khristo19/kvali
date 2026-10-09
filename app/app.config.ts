// Dynamic config on top of app.json (kept as the source of truth for everything else).
// EXPO_BASE_URL overrides the static-export base path: the live site is "/kvali", the staging site "/kvali/staging".
import type { ConfigContext, ExpoConfig } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
  name: config.name ?? "Kvali",
  slug: config.slug ?? "kvali",
  experiments: {
    ...config.experiments,
    baseUrl: process.env.EXPO_BASE_URL || config.experiments?.baseUrl || "/kvali",
  },
});
