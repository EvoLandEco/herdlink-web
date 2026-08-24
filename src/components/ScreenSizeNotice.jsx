import {
  faDesktop,
  faLaptop,
  faTabletScreenButton,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useState } from "react";

export function ScreenSizeNotice() {
  const [hasCopied, setHasCopied] = useState(false);

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
            <rect x="13" y="20" width="70" height="49" />
            <path d="M36 79h24M48 69v10" />
            <circle cx="32" cy="45" r="4" />
            <circle cx="48" cy="36" r="4" />
            <circle cx="64" cy="50" r="4" />
            <path d="m35.5 43 9-5M51.5 38.5l9 8.5" />
          </svg>
        </div>

        <p className="screen-size-notice-brand">HERDLINK.NL</p>
        <h1 id="screenSizeNoticeTitle">Use a larger screen</h1>
        <p className="screen-size-notice-copy">
          HerdLink is designed for tablets, laptops, and desktop computers.
          Open this page on a larger screen to explore the livestock trade
          network.
        </p>

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
      </section>
    </main>
  );
}
