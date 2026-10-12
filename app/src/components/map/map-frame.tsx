// A map box with an "Expand" button: inline it is a framed map of a given height; expanded it fills the screen in a
// modal with a header (title + Close) and an optional footer. The map is rendered in exactly one place at a time, and
// `renderMap` gets the size to draw, so the camera (kept by the caller) carries over between the two.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Modal, Platform, StyleSheet, Text, View, useWindowDimensions, type LayoutChangeEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Pressable } from "@/components/ui/pressable";
import type { LonLat } from "@/geo/geo";
import { colors, fonts } from "@/theme";
import { onWidth } from "./map-canvas";
import { MapButton, MapIcon } from "./map-controls";

export type MapView = { center: LonLat; zoom: number };
export type MapSize = { width: number; height: number; expanded: boolean };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Inline map height for the current window. SSR-safe: returns `fallback` until mounted. */
export function useInlineMapHeight(fallback = 420): number {
  const { width: ww, height: wh } = useWindowDimensions();
  const [h, setH] = useState(fallback);
  useEffect(() => {
    if (!ww || !wh) return;
    // 900 matches the +html.tsx breakpoint (bottom tab bar below 900).
    const phone = ww < 900;
    setH(Math.round(phone ? clamp(0.55 * wh, 300, 520) : clamp(0.6 * wh, 360, 600)));
  }, [ww, wh]);
  return h;
}

export function MapFrame({
  title,
  inlineHeight,
  renderMap,
  footer,
  framed = true,
  testID = "map",
  expandLabel = "Expand map",
}: {
  /** Modal header text, e.g. "Mark your field". */
  title: string;
  /** Inline map height in px. */
  inlineHeight: number;
  /** Must draw a map exactly size.width x size.height. */
  renderMap: (size: MapSize) => ReactNode;
  /** Expanded mode only: bottom bar content. */
  footer?: (close: () => void) => ReactNode;
  /** Default true: the inline wrapper gets a radius and a 1px border. */
  framed?: boolean;
  /** Default "map"; the expand button is `${testID}-expand`, the close button `${testID}-close`. */
  testID?: string;
  /** Default "Expand map". */
  expandLabel?: string;
}) {
  const [width, setWidth] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [body, setBody] = useState({ width: 0, height: 0 });
  const btnBox = useRef<View>(null);
  const insets = useSafeAreaInsets();
  // The map fills the inside of the frame's 1px border.
  const b = framed ? 1 : 0;
  const mapW = Math.max(0, width - 2 * b);
  const mapH = Math.max(0, inlineHeight - 2 * b);

  const open = () => setExpanded(true);

  const close = useCallback(() => {
    setExpanded(false);
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    setTimeout(() => {
      try {
        const box = btnBox.current as unknown as HTMLElement | null;
        const btn = (box?.querySelector?.(`[data-testid="${testID}-expand"]`) as HTMLElement | null) ?? box;
        btn?.focus?.();
      } catch {
        // focus is a nicety
      }
    }, 0);
  }, [testID]);

  // Web: Escape closes (RNW's Modal only listens to keyup), and the page behind does not scroll while open.
  useEffect(() => {
    if (!expanded || Platform.OS !== "web" || typeof document === "undefined") return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    const saved = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = saved;
    };
  }, [expanded, close]);

  const onBody = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    const h = Math.round(e.nativeEvent.layout.height);
    setBody((b) => (b.width === w && b.height === h ? b : { width: w, height: h }));
  };

  return (
    <>
      <View testID={testID} style={[styles.inline, framed && styles.framed, { height: inlineHeight }]} onLayout={onWidth(setWidth)}>
        {mapW > 0 && !expanded ? (
          <>
            {renderMap({ width: mapW, height: mapH, expanded: false })}
            <View ref={btnBox} style={styles.expandBtn}>
              <MapButton icon="expand" label={expandLabel} onPress={open} testID={`${testID}-expand`} />
            </View>
          </>
        ) : null}
        {expanded ? (
          <View style={styles.away}>
            <Text style={styles.awayText}>Map is open in full screen</Text>
          </View>
        ) : null}
      </View>

      <Modal visible={expanded} animationType="fade" transparent={false} onRequestClose={close} statusBarTranslucent>
        <View
          style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom, paddingLeft: insets.left, paddingRight: insets.right }]}
          accessibilityViewIsModal
          aria-modal
          role="dialog"
          accessibilityLabel={`${title}, full screen`}
        >
          <View style={styles.header}>
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close map"
              testID={`${testID}-close`}
              onPress={close}
              style={({ pressed }) => [styles.close, pressed && styles.closePressed]}
            >
              <MapIcon name="close" />
              <Text style={styles.closeText}>Close</Text>
            </Pressable>
          </View>
          <View style={styles.body} onLayout={onBody}>
            {expanded && body.width > 0 && body.height > 0 ? renderMap({ width: body.width, height: body.height, expanded: true }) : null}
          </View>
          {footer ? <View style={styles.footer}>{footer(close)}</View> : null}
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  inline: { overflow: "hidden", backgroundColor: "#33402C", width: "100%" },
  framed: { borderRadius: 14, borderWidth: 1, borderColor: colors.border },
  expandBtn: { position: "absolute", top: 10, right: 10 },
  away: { flex: 1, alignItems: "center", justifyContent: "center", padding: 16, backgroundColor: colors.background },
  awayText: { fontFamily: fonts.sans, fontSize: 15, fontWeight: "600", color: colors.muted, textAlign: "center" },
  root: { flex: 1, backgroundColor: colors.background },
  header: {
    minHeight: 56,
    paddingHorizontal: 12,
    gap: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: { fontFamily: fonts.display, fontSize: 18, fontWeight: "700", color: colors.ink, flexShrink: 1 },
  close: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  closePressed: { backgroundColor: "#ECE8DA" },
  closeText: { fontFamily: fonts.sans, fontSize: 16, fontWeight: "600", color: colors.ink },
  body: { flex: 1, overflow: "hidden", backgroundColor: "#33402C" },
  footer: { paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.card },
});
