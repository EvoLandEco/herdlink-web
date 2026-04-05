import { useEffect } from "react";
import { IntroOverlay } from "./components/IntroOverlay";
import { LeftPanel } from "./components/LeftPanel";
import { NetworkPanel } from "./components/NetworkPanel";
import { RightPanel } from "./components/RightPanel";

const basePath = import.meta.env.BASE_URL;

const runtimeScripts = [
  { src: "https://d3js.org/d3.v6.min.js" },
  { src: `${basePath}assets/js/jLouvain.js` },
  { src: "https://cdnjs.cloudflare.com/ajax/libs/vivus/0.3.1/vivus.min.js" },
  { src: `${basePath}assets/js/savesvg.js` },
  { src: `${basePath}assets/js/d3anno.js` },
  { src: "https://unpkg.com/simple-keyboard@latest/build/index.js" },
  {
    src: "https://cdnjs.cloudflare.com/ajax/libs/leader-line/1.0.6/leader-line.min.js",
  },
  { src: `${basePath}assets/js/herdlink-runtime.js` },
];

const scriptLoaders = new Map();

function loadRuntimeScript({ src, crossOrigin }) {
  const existing = document.querySelector(`script[data-herdlink-src="${src}"]`);

  if (existing?.dataset.loaded === "true") {
    return Promise.resolve(existing);
  }

  if (scriptLoaders.has(src)) {
    return scriptLoaders.get(src);
  }

  const loader = new Promise((resolve, reject) => {
    const script = existing || document.createElement("script");

    const handleLoad = () => {
      script.dataset.loaded = "true";
      scriptLoaders.delete(src);
      resolve(script);
    };

    const handleError = () => {
      scriptLoaders.delete(src);
      reject(new Error(`Failed to load ${src}`));
    };

    script.addEventListener("load", handleLoad, { once: true });
    script.addEventListener("error", handleError, { once: true });

    if (!existing) {
      script.src = src;
      script.async = false;
      script.dataset.herdlinkSrc = src;
      if (crossOrigin) {
        script.crossOrigin = crossOrigin;
      }
      document.head.appendChild(script);
    }
  });

  scriptLoaders.set(src, loader);
  return loader;
}

export default function App() {
  useEffect(() => {
    let frameId = null;
    let cancelled = false;

    runtimeScripts
      .reduce((chain, script) => {
        return chain.then(() => {
          if (cancelled) {
            return undefined;
          }

          return loadRuntimeScript(script);
        });
      }, Promise.resolve())
      .then(() => {
        if (cancelled) {
          return;
        }

        frameId = window.requestAnimationFrame(() => {
          window.dispatchEvent(new Event("herdlink:mount"));
        });
      })
      .catch((error) => {
        console.error("Failed to load HerdLink runtime scripts:", error);
      });

    return () => {
      cancelled = true;
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, []);

  return (
    <>
      <IntroOverlay />
      <div id="radial-labels-container"></div>
      <div id="mainContainer">
        <LeftPanel />
        <NetworkPanel />
        <RightPanel />
      </div>
    </>
  );
}
