import { useCallback, useEffect, useRef, useState } from "react";

export function isComparisonShortcut(event) {
  return !event.defaultPrevented && !event.repeat && !event.isComposing &&
    !event.altKey && !event.ctrlKey && !event.metaKey &&
    !event.target?.closest("input, select, textarea, [contenteditable]:not([contenteditable='false'])") &&
    ["c", "e"].includes(event.key.toLowerCase());
}

export function useComparison(hasSupportedScreen) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const openRef = useRef(false);

  const close = useCallback(() => {
    openRef.current = false;
    setOpen(false);
  }, []);

  const toggle = useCallback(() => {
    if (openRef.current) {
      close();
      return;
    }
    if (!window.herdlinkComparison || !hasSupportedScreen || document.getElementById("mainContainer")?.closest("[inert]") ||
      window.herdlinkComparison?.canOpen() === false) return;
    if (window.isIntroOverlayOpen?.()) window.closeIntroOverlay?.();
    window.herdlinkComparison?.prepare();
    openRef.current = true;
    setData(null);
    setOpen(true);
    window.dispatchEvent(new Event("herdlink:comparison-change"));
  }, [close, hasSupportedScreen]);

  const changeMode = useCallback((mode) => {
    window.herdlinkComparison?.setMode(mode);
  }, []);

  useEffect(() => {
    if (!hasSupportedScreen) close();
  }, [hasSupportedScreen, close]);

  useEffect(() => {
    let frame = null;
    window.isComparisonOverlayOpen = () => openRef.current;
    const refresh = () => {
      if (!openRef.current || frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        if (!openRef.current) return;
        try {
          setData(window.herdlinkComparison?.read() || null);
        } catch (error) {
          console.error("Unable to calculate comparison:", error);
          setData({ status: "error" });
        }
      });
    };
    const handleKey = (event) => {
      if (!hasSupportedScreen || !isComparisonShortcut(event)) return;
      const key = event.key.toLowerCase();
      if (key === "c") {
        event.preventDefault();
        toggle();
      } else if (openRef.current) {
        event.preventDefault();
        const mode = window.herdlinkComparison?.getMode();
        if (mode) changeMode(mode === "simulation" ? "trade" : "simulation");
      }
    };
    window.addEventListener("herdlink:comparison-change", refresh);
    document.addEventListener("keydown", handleKey, true);
    return () => {
      window.removeEventListener("herdlink:comparison-change", refresh);
      document.removeEventListener("keydown", handleKey, true);
      if (frame !== null) cancelAnimationFrame(frame);
      delete window.isComparisonOverlayOpen;
    };
  }, [hasSupportedScreen, toggle, changeMode]);

  return { open, data, close, toggle, changeMode };
}
