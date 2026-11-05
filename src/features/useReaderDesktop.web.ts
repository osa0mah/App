import { useEffect } from "react";
export function useReaderDesktop(onTurn: (delta: number) => void, enabled: boolean) {
  useEffect(() => {
    const surface = document.getElementById("mushaf-gesture-surface");
    const previousTouchAction = surface?.style.touchAction || "";
    if (surface) surface.style.touchAction = "pan-y";
    return () => { if (surface) surface.style.touchAction = previousTouchAction; };
  }, []);
  useEffect(() => {
    if (!enabled) return;
    const editing = (target: EventTarget | null) => target instanceof HTMLElement && !!target.closest("input,textarea,select,[contenteditable='true'],[role='textbox']");
    const keydown = (event: KeyboardEvent) => {
      if (editing(event.target) || event.altKey || event.ctrlKey || event.metaKey || event.defaultPrevented) return;
      const delta = event.key === "ArrowLeft" || event.key === "PageDown" ? 1 : event.key === "ArrowRight" || event.key === "PageUp" ? -1 : 0;
      if (delta) { event.preventDefault(); onTurn(delta); }
    };
    let last = 0, accumulated = 0, fired = false;
    const wheel = (event: WheelEvent) => {
      if (editing(event.target) || event.ctrlKey || event.metaKey || event.defaultPrevented) return;
      const dx = event.deltaX || (event.shiftKey ? event.deltaY : 0);
      const dy = event.shiftKey ? 0 : event.deltaY;
      if (Math.abs(dx) < 2 || Math.abs(dx) < Math.abs(dy)*1.5) return;
      event.preventDefault();
      const now = Date.now();
      if (now-last > 200) { accumulated = 0; fired = false; }
      last = now;
      accumulated += dx;
      if (!fired && Math.abs(accumulated) >= 70) { fired = true; onTurn(accumulated < 0 ? 1 : -1); }
    };
    window.addEventListener("keydown", keydown);
    window.addEventListener("wheel", wheel, { passive: false });
    return () => { window.removeEventListener("keydown", keydown); window.removeEventListener("wheel", wheel); };
  }, [onTurn, enabled]);
}
