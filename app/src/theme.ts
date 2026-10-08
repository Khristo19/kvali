// Kvali light theme, matching the approved design (design/canvas/*.dc.html).
import { Platform } from "react-native";

export const colors = {
  background: "#F4F1E8",
  card: "#FBFAF5",
  border: "#DCD7C6",
  ink: "#16241C",
  body: "#3E4A40",
  muted: "#5E685B",
  accent: "#A04F0C", // orange
  green: "#2F5D3E",
  softGreen: "#E3ECE3",
  error: "#9B1C1C",
  onAccent: "#FBFAF5",
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radius = { sm: 10, md: 12, lg: 14 } as const;

/** Layout breakpoint: at or above this width the app shows a side nav and a centred column. */
export const DESKTOP_MIN_WIDTH = 900;
export const DESKTOP_MAX_WIDTH = 1100;

// Space Grotesk (headings, big numbers) and IBM Plex Sans (body). On web they are loaded from
// Google Fonts in src/app/+html.tsx; on native we fall back to the system font.
const sans = Platform.select({ web: "'IBM Plex Sans', system-ui, sans-serif", default: undefined });
const display = Platform.select({ web: "'Space Grotesk', system-ui, sans-serif", default: undefined });

export const fonts = { sans, display } as const;

export const type = {
  title: { fontFamily: display, fontSize: 40, fontWeight: "700", color: colors.ink, letterSpacing: -0.5 },
  heading: { fontFamily: display, fontSize: 22, fontWeight: "700", color: colors.ink },
  subheading: { fontFamily: display, fontSize: 18, fontWeight: "700", color: colors.ink },
  body: { fontFamily: sans, fontSize: 16, lineHeight: 23, color: colors.body },
  label: { fontFamily: sans, fontSize: 15, lineHeight: 21, fontWeight: "600", color: colors.muted },
  small: { fontFamily: sans, fontSize: 15, lineHeight: 21, color: colors.muted },
} as const;

export const theme = { colors, space, radius, type, fonts };
