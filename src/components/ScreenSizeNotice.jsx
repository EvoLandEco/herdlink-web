export function ScreenSizeNotice() {
  return (
    <main
      className="screen-size-notice"
      aria-labelledby="screenSizeNoticeTitle"
    >
      <section className="screen-size-notice-card">
        <div className="screen-size-notice-icon" aria-hidden="true">
          <svg viewBox="0 0 96 96" focusable="false">
            <rect x="13" y="20" width="70" height="49" rx="7" />
            <path d="M36 79h24M48 69v10" />
            <circle cx="32" cy="45" r="4" />
            <circle cx="48" cy="36" r="4" />
            <circle cx="64" cy="50" r="4" />
            <path d="m35.5 43 9-5M51.5 38.5l9 8.5" />
          </svg>
        </div>

        <p className="screen-size-notice-brand">HerdLink</p>
        <h1 id="screenSizeNoticeTitle">Use a larger screen</h1>
        <p className="screen-size-notice-copy">
          HerdLink is designed for tablets, laptops, and desktop computers.
          Open this page on a larger screen to explore the livestock trade
          network.
        </p>

        <div className="screen-size-notice-device" aria-hidden="true">
          <i className="fa-solid fa-tablet-screen-button"></i>
          <span>Tablet or larger</span>
          <i className="fa-solid fa-laptop"></i>
        </div>
      </section>
    </main>
  );
}
