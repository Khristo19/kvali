// Build flavour. EXPO_PUBLIC_KVALI_ENV=staging is set only by the staging build (see .github/workflows/pages.yml).
// Keep the static `process.env.EXPO_PUBLIC_X` form: Expo only inlines that.
export const IS_STAGING = process.env.EXPO_PUBLIC_KVALI_ENV === "staging";

/** Multi-account switcher (staging only). */
export const SWITCHER = IS_STAGING && process.env.EXPO_PUBLIC_ACCOUNT_SWITCHER !== "0";

/** localStorage key: live keeps its original names, staging is prefixed (same origin, so the two sites must not share state). */
export const lsKey = (k: string) => (IS_STAGING ? `stg.${k}` : k);
