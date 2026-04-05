const quickStartNotes = [
  {
    key: "resolution",
    content: (
      <>
        Select a <strong>time resolution</strong> from the top-left switches.
        <br />
        <i className="fa-solid fa-calendar-day"></i>: daily /
        <i className="fa-solid fa-calendar-week"></i>: weekly /
        <i className="fa-solid fa-calendar-days"></i>: monthly /
        <i className="fa-regular fa-calendar-days"></i>: yearly
      </>
    ),
  },
  {
    key: "mode",
    content: (
      <>
        Toggle <strong>Graph</strong> / <strong>Map</strong> view using the
        first button at the bottom-right of the network panel.
        <br />
        <i className="fa-solid fa-hexagon-nodes"></i>: Graph view /
        <i className="fa-solid fa-map-location-dot"></i>: Map view / or press
        <kbd>M</kbd> to switch.
      </>
    ),
  },
  {
    key: "focus",
    content: (
      <>
        Click a node to enter <strong>focus mode</strong>; press <kbd>Q</kbd>{" "}
        to exit.
      </>
    ),
  },
  {
    key: "switch-node",
    content: (
      <>
        Use <kbd><i className="fa-solid fa-angle-up"></i></kbd> /{" "}
        <kbd><i className="fa-solid fa-angle-down"></i></kbd> to switch focal
        nodes quickly; see the side panels for detailed stats and trade info.
      </>
    ),
  },
  {
    key: "time",
    content: (
      <>
        If time controls are available, press <kbd>Space</kbd> to play / pause,{" "}
        <kbd><i className="fa-solid fa-angle-left"></i></kbd> /{" "}
        <kbd><i className="fa-solid fa-angle-right"></i></kbd> to step time,{" "}
        <kbd>F</kbd> to jump to start.
      </>
    ),
  },
  {
    key: "links",
    content: (
      <>
        In focus mode, links can be turned off in the right panel. Press{" "}
        <kbd>R</kbd> to restore links and <kbd>S</kbd> to export a screenshot.
      </>
    ),
  },
  {
    key: "help",
    content: (
      <>
        Press <kbd>Esc</kbd> to quickly exit the help overlay. Press{" "}
        <kbd>H</kbd> anytime to toggle it.
      </>
    ),
  },
];

const shortcutCallouts = [
  {
    key: "s",
    className: "kbd-callout--s",
    dotId: "introDotS",
    label: (
      <>
        <kbd>S</kbd> Screenshot
      </>
    ),
    description: "Export the current view as PNG.",
  },
  {
    key: "m",
    className: "kbd-callout--m",
    dotId: "introDotM",
    label: (
      <>
        <kbd>M</kbd> Map / Graph
      </>
    ),
    description: "Toggle between map and network views.",
  },
  {
    key: "q",
    className: "kbd-callout--q",
    dotId: "introDotQ",
    label: (
      <>
        <kbd>Q</kbd> Exit focus
      </>
    ),
    description: "Quit focus mode for the selected node.",
  },
  {
    key: "r",
    className: "kbd-callout--r",
    dotId: "introDotR",
    label: (
      <>
        <kbd>R</kbd> Restore links
      </>
    ),
    description: "Re-enable all links after filtering.",
  },
  {
    key: "h",
    className: "kbd-callout--h",
    dotId: "introDotH",
    label: (
      <>
        <kbd>H</kbd> Help
      </>
    ),
    description: "Toggle the help overlay.",
  },
  {
    key: "space",
    className: "kbd-callout--space",
    dotId: "introDotSpace",
    label: (
      <>
        <kbd>Space</kbd> Play / pause
      </>
    ),
    description: "Toggle time replay.",
  },
  {
    key: "f",
    className: "kbd-callout--f",
    dotId: "introDotF",
    label: (
      <>
        <kbd>F</kbd> From start
      </>
    ),
    description: "Jump back to the first time step.",
  },
  {
    key: "arrows",
    className: "kbd-callout--arrows",
    dotId: "introDotArrows",
    label: (
      <>
        <kbd>←</kbd>
        <kbd>→</kbd> / <kbd>↑</kbd>
        <kbd>↓</kbd>
      </>
    ),
    description: "Time step / Switch node.",
  },
];

export function IntroOverlay() {
  return (
    <div
      id="introOverlay"
      className="intro-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="introTitle"
    >
      <div className="intro-content">
        <h2 id="introTitle" className="visually-hidden">
          How to use HerdLink
        </h2>
        <div className="intro-grid">
          <div className="intro-left">
            <div className="intro-badge intro-badge-left">
              <i className="fa-solid fa-book"></i> Quick Start
            </div>

            {quickStartNotes.map((note) => (
              <div key={note.key} className="intro-note">
                <i className="fa-light fa-circle-small"></i>
                {note.content}
              </div>
            ))}
          </div>

          <div className="intro-right">
            <div className="intro-badge intro-badge-right">
              <i className="fa-solid fa-keyboard"></i> Shortcuts
            </div>

            <div className="kbd-annotated" id="introShortcutDiagram">
              {shortcutCallouts.slice(0, 3).map((callout) => (
                <div
                  key={callout.key}
                  className={`kbd-callout ${callout.className}`}
                >
                  <span className="kbd-dot" id={callout.dotId}></span>
                  <div className="kbd-callout__title">{callout.label}</div>
                  <div>{callout.description}</div>
                </div>
              ))}

              <div
                id="introKeyboard"
                className="introKeyboard"
                aria-label="Keyboard shortcuts diagram"
              ></div>

              {shortcutCallouts.slice(3).map((callout) => (
                <div
                  key={callout.key}
                  className={`kbd-callout ${callout.className}`}
                >
                  <span className="kbd-dot" id={callout.dotId}></span>
                  <div className="kbd-callout__title">{callout.label}</div>
                  <div>{callout.description}</div>
                </div>
              ))}
            </div>

            <div className="intro-meta">
              <i className="fa-solid fa-circle-info"></i> Highlighted keys are
              active shortcuts.
            </div>
          </div>
        </div>

        <div className="intro-actions">
          <div className="intro-dont-show-again">
            <label>
              <input type="checkbox" id="dontShowAgain" />
              Do not show again
            </label>
          </div>
          <button id="introOkButton" className="btn btn-success" type="button">
            <i className="fa-solid fa-compass"></i> Start exploring
          </button>
        </div>
      </div>
    </div>
  );
}
