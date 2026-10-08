// Public runtime config. Expo inlines EXPO_PUBLIC_* variables at build time
// from app/.env (a symlink to the repo-root .env). Only public values belong
// there; never put the Privy App Secret in it.
//
// Privy is not wired up yet (task w08); this module only exposes the values.
// Keep the `process.env.EXPO_PUBLIC_X` form: Expo only inlines static access.

export const config = {
  privy: {
    appId: process.env.EXPO_PUBLIC_PRIVY_APP_ID ?? "",
    clientId: process.env.EXPO_PUBLIC_PRIVY_CLIENT_ID ?? "",
  },
} as const;

export const privyConfigured = config.privy.appId !== "" && config.privy.clientId !== "";
