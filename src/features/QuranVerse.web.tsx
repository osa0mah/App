import { useRef } from "react";
import type { QuranVerseProps } from "./QuranVerse.types";
// A span flows across lines; a native HTML button keeps an entire verse in one box.
export default function QuranVerse({ label, highlighted, onPress, children }: QuranVerseProps) {
  const pointer = useRef<{x: number; y: number} | null>(null);
  const cancelled = useRef(false);
  return <span role="button" tabIndex={0} aria-label={label}
    style={{ display: "inline", cursor: "pointer", font: "inherit", color: "inherit", lineHeight: "inherit", userSelect: "none", backgroundColor: highlighted ? "#E6EEDD" : undefined }}
    onPointerDown={event => { pointer.current = {x: event.clientX, y: event.clientY}; cancelled.current = false; }}
    onPointerCancel={() => { pointer.current = null; cancelled.current = true; }}
    onClick={event => {
      if (event.detail !== 0 && (cancelled.current || (pointer.current && Math.hypot(event.clientX-pointer.current.x, event.clientY-pointer.current.y) > 12))) return;
      onPress();
    }}
    onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); onPress(); } }}>
    {children}
  </span>;
}
