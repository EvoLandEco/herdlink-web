let activeTransition = null;
let requestedTheme;

export function followSystemTheme(onChange) {
  const preference = window.matchMedia("(prefers-color-scheme: dark)");
  const apply = () => {
    requestedTheme = preference.matches ? "dark" : "light";
    activeTransition?.skipTransition();
    document.documentElement.dataset.theme = requestedTheme;
    onChange(requestedTheme);
  };
  preference.addEventListener("change", apply);
  apply();
  return () => preference.removeEventListener("change", apply);
}

export function isThemeShortcut(event, button) {
  return event.key.toLowerCase() === "t" && !event.defaultPrevented && !event.repeat && !event.isComposing &&
    !event.altKey && !event.ctrlKey && !event.metaKey && !button.closest("[inert]") &&
    !event.target?.closest("input, select, textarea, [contenteditable]:not([contenteditable='false'])") &&
    !Array.from(document.querySelectorAll('dialog:modal, [aria-modal="true"]')).some(
      (dialog) => !dialog.closest("[inert]") && dialog.getClientRects().length,
    );
}

export async function toggleTheme(button, onChange) {
  if (activeTransition) return;

  const root = document.documentElement;
  requestedTheme = root.dataset.theme === "light" ? "dark" : "light";
  const apply = () => {
    root.dataset.theme = requestedTheme;
    onChange(requestedTheme);
  };

  if (!document.startViewTransition || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    apply();
    return;
  }

  const { left, top, width, height } = button.getBoundingClientRect();
  const x = left + width / 2;
  const y = top + height / 2;
  const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
  try {
    const transition = document.startViewTransition(apply);
    activeTransition = transition;
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
    activeTransition = null;
  }
}
