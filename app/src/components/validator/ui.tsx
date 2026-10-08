import { Button } from "@/components/ui";

/** Validator button: primary (filled) or ghost (outlined). 48 px tall. */
export function Btn({
  label,
  onPress,
  kind = "primary",
  disabled,
  hint,
}: {
  label: string;
  onPress: () => void;
  kind?: "primary" | "ghost" | "danger";
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <Button small label={label} onPress={onPress} disabled={disabled} hint={hint} kind={kind === "primary" ? "primary" : kind === "danger" ? "danger" : "secondary"} />
  );
}
