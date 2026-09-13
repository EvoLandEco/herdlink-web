import {
  faDesktop,
  faLaptop,
  faTabletScreenButton,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useState } from "react";

export function ScreenSizeNotice({ reason }) {
  const [hasCopied, setHasCopied] = useState(false);
  const needsLandscape = reason === "landscape";

  const copyPageUrl = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setHasCopied(true);
  };

  return (
    <main
      className="screen-size-notice"
      aria-labelledby="screenSizeNoticeTitle"
    >
      <section className="screen-size-notice-card">
        <div className="screen-size-notice-icon" aria-hidden="true">
          <svg viewBox="0 0 96 96" focusable="false">
            {needsLandscape ? (
              <>
                <rect className="screen-orientation-portrait" x="33" y="10" width="31" height="55" rx="5" />
                <rect className="screen-orientation-landscape" x="15" y="36" width="64" height="41" rx="5" />
                <path d="M74 13a33 33 0 0 1 12 22m-8-5 8 6 5-9" />
                <path d="M23 53v7" />
                <circle cx="40" cy="59" r="3" />
                <circle cx="53" cy="48" r="3" />
                <circle cx="66" cy="62" r="3" />
                <path d="m42.5 57 8-7m5 1 8 9" />
              </>
            ) : (
              <>
                <rect x="13" y="20" width="70" height="49" />
                <path d="M36 79h24M48 69v10" />
                <circle cx="32" cy="45" r="4" />
                <circle cx="48" cy="36" r="4" />
                <circle cx="64" cy="50" r="4" />
                <path d="m35.5 43 9-5M51.5 38.5l9 8.5" />
              </>
            )}
          </svg>
        </div>

        <p className="screen-size-notice-brand">HERDLINK.NL</p>
        <h1 id="screenSizeNoticeTitle">{needsLandscape ? "Use landscape mode" : "Use a larger screen"}</h1>
        <p className="screen-size-notice-copy">
          {needsLandscape
            ? "Rotate your tablet or widen this window to explore HerdLink. The network and its panels need a horizontal view."
            : "HerdLink is designed for tablets, laptops, and desktop computers. Open this page on a larger screen to explore the livestock trade network."}
        </p>

        {needsLandscape ? (
          <p className="screen-size-notice-status">
            <span aria-hidden="true" />
            HerdLink opens when the view is wide enough.
          </p>
        ) : (
          <>
            <div
              className="screen-size-notice-device"
              aria-label="Supported devices: tablet, laptop, and desktop"
            >
              <strong>Supported devices:</strong>
              <FontAwesomeIcon icon={faTabletScreenButton} aria-hidden="true" />
              <FontAwesomeIcon icon={faLaptop} aria-hidden="true" />
              <FontAwesomeIcon icon={faDesktop} aria-hidden="true" />
            </div>

            <button
              type="button"
              className="screen-size-copy-button"
              onClick={copyPageUrl}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <rect x="8" y="8" width="11" height="11" />
                <path d="M16 8V5H5v11h3" />
              </svg>
              <span aria-live="polite">
                {hasCopied ? "URL copied" : "Copy URL"}
              </span>
            </button>
          </>
        )}
      </section>
    </main>
  );
}
