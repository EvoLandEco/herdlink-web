export async function downloadAppScreenshot(filename) {
  const { domToPng } = await import("modern-screenshot");
  await document.fonts.ready;

  const app = document.querySelector(".screen-access-content");
  const { width, height } = app.getBoundingClientRect();
  // Native range pseudo elements need their stylesheet rules.
  const sliderStyles = [...document.styleSheets]
    .filter((sheet) => !sheet.href || new URL(sheet.href).origin === location.origin)
    .flatMap((sheet) => [...sheet.cssRules])
    .filter((rule) => /::-(webkit-slider|moz-range)-/.test(rule.selectorText))
    .map((rule) => rule.cssText)
    .join("\n");
  const selectedOptions = new Map(
    [...app.querySelectorAll("select")].map((select) => [
      select.id,
      [...select.options].map((option) => option.selected),
    ]),
  );
  const mixedCheckboxes = new Set(
    [...app.querySelectorAll("input:indeterminate")]
      .filter((input) => getComputedStyle(input).appearance !== "none")
      .map((input) => input.getAttribute("aria-label")),
  );
  const wasInert = app.inert;
  const stickyNodes = [...app.querySelectorAll("*")]
    .filter((node) => getComputedStyle(node).position === "sticky")
    .map((node) => ({ node, style: node.getAttribute("style"), rect: node.getBoundingClientRect() }));
  app.inert = true;
  try {
    // Keep pinned headers in their painted positions when scroll offsets are serialized.
    for (const { node, rect } of stickyNodes) {
      Object.assign(node.style, { position: "relative", top: "0px", left: "0px", right: "auto", bottom: "auto" });
      const flowRect = node.getBoundingClientRect();
      node.style.top = `${rect.top - flowRect.top}px`;
      node.style.left = `${rect.left - flowRect.left}px`;
    }
    const image = await domToPng(app, {
      width,
      height,
      scale: window.devicePixelRatio,
      backgroundColor: getComputedStyle(document.body).backgroundColor,
      features: { restoreScrollPosition: true },
      fetch: { placeholderImage: "" },
      font: { preferredFormat: "woff2" },
      filter: (node) => node.id !== "introOverlay" && node.id !== "herdlinkTooltip",
      onCloneNode(node) {
        const theme = getComputedStyle(app);
        for (const property of theme) {
          if (property.startsWith("--")) node.style.setProperty(property, theme.getPropertyValue(property));
        }
        const stylesheet = document.createElement("style");
        stylesheet.textContent = sliderStyles;
        node.prepend(stylesheet);
      },
      onCloneEachNode(node) {
        if (node instanceof HTMLInputElement) {
          node.toggleAttribute("checked", node.checked);
          if (mixedCheckboxes.has(node.getAttribute("aria-label"))) {
            Object.assign(node.style, {
              appearance: "none",
              border: "1px solid var(--color-accent)",
              borderRadius: "2px",
              background: "linear-gradient(var(--color-on-accent), var(--color-on-accent)) center / 60% 2px no-repeat var(--color-accent)",
            });
          }
        }
        if (node instanceof HTMLSelectElement) {
          const selected = selectedOptions.get(node.id);
          [...node.options].forEach((option, index) => {
            option.toggleAttribute("selected", selected[index]);
          });
        }
      },
    });
    const link = document.createElement("a");
    link.download = filename;
    link.href = image;
    link.click();
  } finally {
    for (const { node, style } of stickyNodes) {
      if (style === null) node.removeAttribute("style");
      else node.setAttribute("style", style);
    }
    app.inert = wasInert;
  }
}
