import { useCallback, useEffect, useRef, useState } from "react";
import { readScenarioSlots, saveScenarioSlot, scenarioStorageKey } from "./scenarioStorage";

export function isComparisonShortcut(event) {
  return !event.defaultPrevented && !event.repeat && !event.isComposing &&
    !event.altKey && !event.ctrlKey && !event.metaKey &&
    !event.target?.closest("input, select, textarea, [contenteditable]:not([contenteditable='false'])") &&
    ["c", "e"].includes(event.key.toLowerCase());
}

export function useComparison(hasSupportedScreen) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [scenarioSlots, setScenarioSlots] = useState([null, null, null]);
  const [scenarioError, setScenarioError] = useState("");
  const [scenarioNotice, setScenarioNotice] = useState("");
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
    setScenarioNotice("");
    setData(null);
    setOpen(true);
    window.dispatchEvent(new Event("herdlink:comparison-change"));
  }, [close, hasSupportedScreen]);

  const changeMode = useCallback((mode) => {
    window.herdlinkComparison?.setMode(mode);
  }, []);

  const loadPreset = useCallback((id) => {
    setScenarioError("");
    setScenarioNotice("");
    try {
      const result = window.herdlinkComparison.loadPreset(id);
      setScenarioNotice(`${result.label} loaded. ${result.detail || ""}`.trim());
    } catch (error) {
      setScenarioError(error.message || "The preset could not be loaded.");
    }
  }, []);

  const saveScenario = useCallback((index, name) => {
    setScenarioError("");
    setScenarioNotice("");
    try {
      const scenario = window.herdlinkComparison.captureScenario();
      const slots = saveScenarioSlot(window.localStorage, index, name, scenario);
      setScenarioSlots(slots);
      setScenarioNotice(`${slots[index].name} saved in this browser.`);
    } catch (error) {
      setScenarioError(`Could not save the scenario. ${error.message}`);
    }
  }, []);

  const loadScenario = useCallback((index) => {
    setScenarioError("");
    setScenarioNotice("");
    try {
      const slots = readScenarioSlots(window.localStorage);
      setScenarioSlots(slots);
      const slot = slots[index];
      if (!slot) throw new Error("This scenario slot is empty.");
      window.herdlinkComparison.loadScenario(slot.scenario);
      setScenarioNotice(`${slot.name} loaded with its saved model settings and seed region.`);
    } catch (error) {
      setScenarioError(error.message || "The saved scenario could not be loaded.");
    }
  }, []);

  useEffect(() => {
    const readSlots = (event) => {
      if (event && event.key !== null && event.key !== scenarioStorageKey) return;
      try {
        setScenarioSlots(readScenarioSlots(window.localStorage));
      } catch (error) {
        setScenarioError(`Could not read saved scenarios. ${error.message}`);
      }
    };
    readSlots();
    window.addEventListener("storage", readSlots);
    return () => window.removeEventListener("storage", readSlots);
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

  return { open, data, close, toggle, changeMode, scenarioSlots, scenarioError, scenarioNotice,
    loadPreset, saveScenario, loadScenario };
}
