/** Plain names of the demo flight records (the keys in engine/samples are internal). */
export const RECORD_TITLES: Record<string, string> = {
  honest: "Honest flight",
  pumpOff: "Pump off",
  halfField: "Half field",
  tankMismatch: "Tank mismatch",
};
export const recordTitle = (key: string) => RECORD_TITLES[key] ?? key;
