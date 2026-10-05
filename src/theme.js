let transitionInProgress = false;

export function isThemeShortcut(event, button) {
  return event.key.toLowerCase() === "t" && !event.defaultPrevented && !event.repeat && !event.isComposing &&
    !event.altKey && !event.ctrlKey && !event.metaKey && !button.closest("[inert]") &&
    !event.target?.closest("input, select, textarea, [contenteditable]:not([contenteditable='false'])") &&
    !Array.from(document.querySelectorAll('dialog:modal, [aria-modal="true"]')).some(
      (dialog) => !dialog.closest("[inert]") && dialog.getClientRects().length,
    );
}

export async function toggleTheme(button, onChange) {
  if (transitionInProgress) return;

  const root = document.documentElement;
  const theme = root.dataset.theme === "light" ? "dark" : "light";
  const apply = () => {
    root.dataset.theme = theme;
    try {
      localStorage.setItem("herdlink-theme", theme);
    } catch {}
    onChange(theme);
  };

  if (!document.startViewTransition || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    apply();
    return;
  }

  const { left, top, width, height } = button.getBoundingClientRect();
  const x = left + width / 2;
  const y = top + height / 2;
  const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
  transitionInProgress = true;
  try {
    const transition = document.startViewTransition(apply);
    try {
      await transition.ready;
      root.animate({
        clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`],
      }, { duration: 400, easing: "ease-in-out", pseudoElement: "::view-transition-new(root)" });
    } catch {
      await transition.updateCallbackDone;
    }
    await transition.finished;
  } finally {
    transitionInProgress = false;
  }
}
