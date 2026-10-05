import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { faMoon, faSun } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { isThemeShortcut, toggleTheme } from "../theme";

export function ThemeToggle() {
  const buttonRef = useRef(null);
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme);

  const changeTheme = () => toggleTheme(buttonRef.current, (value) => {
    flushSync(() => setTheme(value));
  }).catch((error) => console.error("Unable to switch theme:", error));

  useEffect(() => {
    const handleKey = (event) => {
      if (!isThemeShortcut(event, buttonRef.current)) return;
      event.preventDefault();
      buttonRef.current.click();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, []);

  return (
    <button
      ref={buttonRef}
      id="themeToggleButton"
      className="theme-toggle-button has-tip"
      type="button"
      onClick={changeTheme}
      data-tip="Toggle light / dark theme (T)"
      data-tip-placement="top"
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
      aria-keyshortcuts="T"
    >
      <FontAwesomeIcon icon={theme === "dark" ? faSun : faMoon} aria-hidden="true" />
    </button>
  );
}
