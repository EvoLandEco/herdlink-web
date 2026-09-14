import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { readScenarioSlots, saveScenarioSlot, scenarioSignature, scenarioStorageKey } from "./scenarioStorage";

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
  const [recomputing, setRecomputing] = useState(false);
  const [loadedPresets, setLoadedPresets] = useState([]);
  const [selectedScenario, setSelectedScenario] = useState(null);
  const openRef = useRef(false);
  const operationRef = useRef(null);
  const restoreFocusRef = useRef(null);
  const pendingScenarioRef = useRef(null);
  const currentSignature = useMemo(() => data?.status === "ready" && data.scenarioContext
    ? scenarioSignature({ ...data.scenarioContext, dates: data.dates }) : null, [data]);
  const slotSignatures = useMemo(() => scenarioSlots.map((slot) => scenarioSignature(slot?.scenario)), [scenarioSlots]);
  const canMarkActive = !recomputing && currentSignature !== null;
  const matchingPreset = loadedPresets.find((preset) => preset.signature === currentSignature);
  const activePresetId = !canMarkActive ? null : matchingPreset
    ? matchingPreset.id : !data.scenarioContext.nodeInterventions.length && !data.scenarioContext.linkInterventions.length
      ? "open-trade" : null;
  const activeScenarioSlot = canMarkActive && selectedScenario?.signature === currentSignature &&
    slotSignatures[selectedScenario.index] === currentSignature ? selectedScenario.index : null;

  useLayoutEffect(() => {
    if (recomputing) return;
    const target = restoreFocusRef.current;
    restoreFocusRef.current = null;
    if (open && document.activeElement === document.body && target?.isConnected &&
      target.closest("#comparisonOverlay") && !target.matches(":disabled") && !target.closest("[inert]") &&
      target.getClientRects().length && getComputedStyle(target).visibility === "visible") {
      target.focus({ preventScroll: true });
    }
  }, [open, recomputing]);

  const close = useCallback(() => {
    if (operationRef.current?.frame != null) cancelAnimationFrame(operationRef.current.frame);
    operationRef.current = null;
    restoreFocusRef.current = null;
    setRecomputing(false);
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
    if (operationRef.current) return;
    window.herdlinkComparison?.setMode(mode);
  }, []);

  const runScenarioLoad = useCallback((load, message) => {
    if (!openRef.current || operationRef.current) return;
    const operation = { frame: null, started: false };
    operationRef.current = operation;
    pendingScenarioRef.current = null;
    restoreFocusRef.current = document.activeElement;
    setRecomputing(true);
    setScenarioError("");
    setScenarioNotice("");
    operation.frame = requestAnimationFrame(() => {
      operation.frame = requestAnimationFrame(() => {
        operation.frame = null;
        if (operationRef.current !== operation) return;
        operation.started = true;
        try {
          load();
        } catch (error) {
          setScenarioError(error.message || message);
        }
        window.dispatchEvent(new Event("herdlink:comparison-change"));
      });
    });
  }, []);

  const loadPreset = useCallback((id) => {
    runScenarioLoad(() => {
      const result = window.herdlinkComparison.loadPreset(id);
      const signature = scenarioSignature(result.scenario);
      pendingScenarioRef.current = signature ? { id, signature } : null;
      setScenarioNotice(`${result.label} loaded. ${result.detail || ""}`.trim());
    }, "The preset could not be loaded.");
  }, [runScenarioLoad]);

  const saveScenario = useCallback((index, name) => {
    if (operationRef.current) return;
    setScenarioError("");
    setScenarioNotice("");
    try {
      const scenario = window.herdlinkComparison.captureScenario();
      const slots = saveScenarioSlot(window.localStorage, index, name, scenario);
      setScenarioSlots(slots);
      const signature = scenarioSignature(scenario);
      setSelectedScenario(signature ? { index, signature } : null);
      setScenarioNotice(`${slots[index].name} saved in this browser.`);
    } catch (error) {
      setScenarioError(`Could not save the scenario. ${error.message}`);
    }
  }, []);

  const loadScenario = useCallback((index) => {
    runScenarioLoad(() => {
      const slots = readScenarioSlots(window.localStorage);
      setScenarioSlots(slots);
      const slot = slots[index];
      if (!slot) throw new Error("This scenario slot is empty.");
      window.herdlinkComparison.loadScenario(slot.scenario);
      const signature = scenarioSignature(slot.scenario);
      pendingScenarioRef.current = signature ? { index, signature } : null;
      setScenarioNotice(`${slot.name} loaded with its saved model settings and seed region.`);
    }, "The saved scenario could not be loaded.");
  }, [runScenarioLoad]);

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
          const next = window.herdlinkComparison?.read() || null;
          setData(next);
          if (pendingScenarioRef.current && ["ready", "error", "empty"].includes(next?.status)) {
            if (next.status === "ready" && pendingScenarioRef.current.signature ===
              scenarioSignature({ ...next.scenarioContext, dates: next.dates })) {
              const scenario = pendingScenarioRef.current;
              if (scenario.id !== undefined) {
                setLoadedPresets((previous) => [scenario, ...previous.filter((entry) => entry.id !== scenario.id)]);
                setSelectedScenario(null);
              } else {
                setSelectedScenario(scenario);
              }
            }
            pendingScenarioRef.current = null;
          }
          if (operationRef.current?.started && ["ready", "error", "empty"].includes(next?.status)) {
            operationRef.current = null;
            setRecomputing(false);
          }
        } catch (error) {
          console.error("Unable to calculate comparison:", error);
          setData({ status: "error" });
          pendingScenarioRef.current = null;
          if (operationRef.current?.started) {
            operationRef.current = null;
            setRecomputing(false);
          }
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
      if (operationRef.current?.frame != null) cancelAnimationFrame(operationRef.current.frame);
      operationRef.current = null;
      restoreFocusRef.current = null;
      delete window.isComparisonOverlayOpen;
    };
  }, [hasSupportedScreen, toggle, changeMode]);

  return { open, data, recomputing, close, toggle, changeMode, scenarioSlots, scenarioError, scenarioNotice,
    activePresetId, activeScenarioSlot,
    loadPreset, saveScenario, loadScenario };
}
