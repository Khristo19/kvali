// Email check with Privy: a one-time code sent by email confirms the sign-up address. Web only, and only when the build has an app ID
// (EXPO_PUBLIC_PRIVY_APP_ID, from the PRIVY_APP_ID repo variable). Without one the app signs up exactly as before (no code step).
// Privy only verifies the email; wallets stay the browser wallets from src/devnet (no Privy embedded wallets).
import { useEffect, useState, useSyncExternalStore } from "react";
import { Platform } from "react-native";

import { colors } from "@/theme";

// Keep the static `process.env.EXPO_PUBLIC_X` form: Expo only inlines that.
const APP_ID = process.env.EXPO_PUBLIC_PRIVY_APP_ID ?? "";
export const privyOn = Platform.OS === "web" && APP_ID.length > 0;

type PrivyModule = typeof import("@privy-io/react-auth");

export interface PrivyAuth {
  ready: boolean;
  authenticated: boolean;
  /** Verified email of the Privy session in this browser, if any. */
  email: string | null;
  sendCode: (email: string) => Promise<void>;
  loginWithCode: (code: string) => Promise<void>;
  logout: () => Promise<void>;
}

const notReady = () => Promise.reject(new Error("Email check is not ready yet."));
const IDLE: PrivyAuth = { ready: false, authenticated: false, email: null, sendCode: notReady, loginWithCode: notReady, logout: async () => {} };
let auth: PrivyAuth = IDLE;
const listeners = new Set<() => void>();
const publish = (next: PrivyAuth) => {
  auth = next;
  listeners.forEach((l) => l());
};
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

export const usePrivyAuth = (): PrivyAuth => useSyncExternalStore(subscribe, () => auth, () => IDLE);

/** Resolves once Privy has loaded its session (gives up after `ms`). */
export function privyReady(ms = 15_000): Promise<PrivyAuth> {
  if (auth.ready) return Promise.resolve(auth);
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      off();
      reject(new Error("Email check did not load. Check your connection and try again."));
    }, ms);
    const off = subscribe(() => {
      if (!auth.ready) return;
      clearTimeout(t);
      off();
      resolve(auth);
    });
  });
}

/** Ends the Privy session too (Sign out). No-op when Privy is off or not loaded. */
export const privyLogout = () => (privyOn ? auth.logout().catch(() => {}) : Promise.resolve());

/** Reads Privy's hooks inside the provider and hands them to the rest of the app through the small store above. */
function Bridge({ mod }: { mod: PrivyModule }) {
  const { ready, authenticated, user, logout } = mod.usePrivy();
  const { sendCode, loginWithCode } = mod.useLoginWithEmail();
  const email = user?.email?.address ?? null;
  useEffect(() => {
    publish({
      ready,
      authenticated,
      email,
      sendCode: (e) => sendCode({ email: e }),
      loginWithCode: (code) => loginWithCode({ code }),
      logout,
    });
  }, [ready, authenticated, email, sendCode, loginWithCode, logout]);
  return null;
}

/**
 * Mounts Privy beside the app (not around it), on the client only after mount: the static page is unchanged and the app tree
 * is not remounted when Privy arrives. The SDK is a lazy chunk, so it never runs during the server render.
 */
export function PrivyRoot() {
  const [mod, setMod] = useState<PrivyModule | null>(null);
  useEffect(() => {
    if (!privyOn) return;
    let live = true;
    import("@privy-io/react-auth").then((m) => live && setMod(m)).catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  if (!mod) return null;
  const { PrivyProvider } = mod;
  return (
    <PrivyProvider
      appId={APP_ID}
      config={{
        loginMethods: ["email"],
        appearance: { theme: "light", accentColor: colors.green as `#${string}` },
        embeddedWallets: { ethereum: { createOnLogin: "off" }, solana: { createOnLogin: "off" } },
      }}
    >
      <Bridge mod={mod} />
    </PrivyProvider>
  );
}
