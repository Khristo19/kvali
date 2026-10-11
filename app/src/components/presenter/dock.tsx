// Presenter mode (?present=1): a small floating "Presenter" button and a drawer with every demo control.
// Without presenter mode nothing here renders, so the site is exactly what users see.
import { useEffect, type ReactNode } from "react";
import { Platform, ScrollView, StyleSheet, Text, View } from "react-native";

import { NetworkPanel } from "@/components/devnet/mode-banner";
import { PresenterAccounts, PresenterJobControls, PresenterLinks } from "@/components/presenter/controls";
import { ResetDemo } from "@/components/tab-views";
import { Button, useWide } from "@/components/ui";
import { Pressable } from "@/components/ui/pressable";
import { exitPresenter, setPresenterHidden, setPresenterOpen, usePresenter, usePresenterUi } from "@/presenter/store";
import { colors, fonts, radius, space, type } from "@/theme";

export function PresenterDock() {
  const on = usePresenter();
  const ui = usePresenterUi();
  const wide = useWide();

  useEffect(() => {
    if (!on || Platform.OS !== "web" || typeof document === "undefined") return;
    const onKey = (e: KeyboardEvent) => {
      if (!e.shiftKey || e.key.toLowerCase() !== "p") return;
      const el = document.activeElement as HTMLElement | null;
      const tag = el?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || el?.isContentEditable) return;
      e.preventDefault();
      setPresenterOpen(!ui.open);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [on, ui.open]);

  if (!on) return null;

  return (
    <>
      {!ui.hidden ? (
        <Pressable
          testID="presenter-open"
          accessibilityRole="button"
          accessibilityLabel="Presenter controls"
          aria-expanded={ui.open}
          onPress={() => setPresenterOpen(!ui.open)}
          style={[styles.pill, { position: "fixed", right: 16, bottom: wide ? 24 : 96, zIndex: 1500 } as never]}
        >
          <Text style={styles.pillText}>Presenter</Text>
        </Pressable>
      ) : null}
      {ui.open ? (
        <View style={[styles.overlay, { position: Platform.OS === "web" ? "fixed" : "absolute" } as never]}>
          <Pressable testID="presenter-backdrop" accessibilityLabel="Close presenter controls" onPress={() => setPresenterOpen(false)} style={StyleSheet.absoluteFill} />
          <View testID="presenter-drawer" accessibilityLabel="Presenter controls" style={[styles.panel, wide ? styles.side : styles.sheet]}>
            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
              <View style={styles.head}>
                <Text style={type.heading}>Presenter</Text>
                <Button testID="presenter-close" small kind="secondary" label="Close" onPress={() => setPresenterOpen(false)} />
              </View>
              <Text style={type.small}>Only you see this. Without ?present=1 the site is exactly what users see.</Text>
              <Button testID="presenter-exit" small kind="secondary" label="Exit presenter" onPress={exitPresenter} />

              <Section title="Network">
                <NetworkPanel />
              </Section>
              <Section title="Act as">
                <PresenterAccounts />
              </Section>
              <Section title="Job shortcuts">
                <PresenterJobControls />
              </Section>
              <Section title="Jump to">
                <PresenterLinks />
              </Section>
              <Section title="Recording">
                {ui.hidden ? (
                  <Button testID="presenter-show" small kind="secondary" label="Show the Presenter button" onPress={() => setPresenterHidden(false)} />
                ) : (
                  <Button
                    testID="presenter-hide"
                    small
                    kind="secondary"
                    label="Hide the Presenter button (Shift+P opens this panel)"
                    onPress={() => {
                      setPresenterHidden(true);
                      setPresenterOpen(false);
                    }}
                  />
                )}
              </Section>
              <Section title="Reset">
                <ResetDemo />
              </Section>
            </ScrollView>
          </View>
        </View>
      ) : null}
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={type.label}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    minHeight: 44,
    paddingHorizontal: 14,
    justifyContent: "center",
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.accent,
    backgroundColor: colors.card,
    boxShadow: "0 4px 14px rgba(0,0,0,0.16)",
  } as never,
  pillText: { fontFamily: fonts.sans, fontSize: 14, fontWeight: "700", color: colors.accent },
  overlay: { top: 0, left: 0, right: 0, bottom: 0, zIndex: 1500 },
  panel: {
    position: "absolute",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    boxShadow: "0 6px 24px rgba(0,0,0,0.18)",
  } as never,
  side: { top: 0, right: 0, bottom: 0, width: 380, maxWidth: "100%" },
  sheet: { left: 0, right: 0, bottom: 0, maxHeight: "85%", borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  content: { padding: space.md, gap: space.md, paddingBottom: 32 },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md },
  section: { gap: 8, paddingTop: space.md, borderTopWidth: 1, borderTopColor: colors.border },
});
