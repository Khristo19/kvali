// Pressable that also reacts to a plain DOM "click" on the web (assistive tech, synthetic clicks, a press the responder
// system dropped). A real press fires onPress first; the click that follows is ignored (dedupe), so it never fires twice.
import { useCallback, useEffect, useRef } from "react";
import { Platform, Pressable as RNPressable, type GestureResponderEvent, type PressableProps, type View } from "react-native";

export function Pressable(props: PressableProps) {
  const { onPress, disabled } = props;
  const ref = useRef<View | null>(null);
  const last = useRef(0);
  const latest = useRef(onPress);
  const off = useRef(disabled);
  useEffect(() => {
    latest.current = onPress;
    off.current = disabled;
  });

  const wrapped = useCallback((e: GestureResponderEvent) => {
    last.current = Date.now();
    latest.current?.(e);
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const el = ref.current as unknown as HTMLElement | null;
    if (!el || typeof el.addEventListener !== "function") return;
    // This native listener runs BEFORE React's delegated handler for the same click, so wait a tick and only fire
    // if the press responder did not handle the click itself (otherwise a toggle would flip twice).
    const onClick = (ev: Event) => {
      const at = Date.now();
      setTimeout(() => {
        if (off.current || !latest.current) return;
        if (last.current >= at - 600) return; // the press responder handled this click (or one just before it)
        last.current = Date.now();
        latest.current(ev as unknown as GestureResponderEvent);
      }, 80);
    };
    el.addEventListener("click", onClick);
    return () => el.removeEventListener("click", onClick);
  }, []);

  return <RNPressable {...props} ref={ref} onPress={onPress ? wrapped : undefined} />;
}
