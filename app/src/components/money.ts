// Shared money formatting for all role screens. Amounts are USDC base units (6 decimals).
// The lari figure is an ESTIMATE for farmers; payments settle in USDC.

/** Approximate lari per US dollar, for display only. Update before the demo if it drifts. */
export const GEL_PER_USD = 2.7;

/** 300_000_000n -> "$300.00" */
export function usdc(amount: bigint): string {
  const neg = amount < 0n;
  const abs = neg ? -amount : amount;
  const cents = (abs + 5_000n) / 10_000n;
  const whole = (cents / 100n).toLocaleString("en-US");
  const frac = String(cents % 100n).padStart(2, "0");
  return `${neg ? "-" : ""}$${whole}.${frac}`;
}

/** 300_000_000n -> "≈ 810 ₾" (estimate) */
export function lari(amount: bigint): string {
  const gel = Math.round((Number(amount) / 1_000_000) * GEL_PER_USD);
  return `≈ ${gel.toLocaleString("en-US")} ₾`;
}

/** Hundredths of a hectare -> "17.00 ha" */
export function hectares(cha: number): string {
  return `${(cha / 100).toFixed(2)} ha`;
}

/** Milliliters per hectare -> "10.0 L/ha" */
export function litersPerHa(mlPerHa: number): string {
  return `${(mlPerHa / 1000).toFixed(1)} L/ha`;
}

/** 300_000_000n -> "810 ₾" (estimate, no "≈"; for big numbers) */
export function lariAmount(amount: bigint): string {
  const gel = Math.round((Number(amount) / 1_000_000) * GEL_PER_USD);
  return `${gel.toLocaleString("en-US")} ₾`;
}

/** Unix seconds -> "6 Oct, 09:12" */
export function whenText(secs: number): string {
  return new Date(secs * 1000).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** Seconds -> "23:41:10" (or "4:05" under one hour) */
export function clock(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-09-24" -> "24 Sep" */
export function isoShort(iso: string): string {
  return `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;
}
