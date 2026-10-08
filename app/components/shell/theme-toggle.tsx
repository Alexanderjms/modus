"use client";

import { useEffect, useState } from "react";
import { useT } from "../../i18n/provider";

export function ThemeToggle({
  className = "ml-auto flex size-7 items-center justify-center rounded-[7px] bg-[var(--surface)] text-[var(--muted)] outline outline-1 -outline-offset-[0.5px] outline-[var(--divider)] hover:bg-[var(--selected)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#007AFF]",
}: {
  className?: string;
}) {
  const t = useT();
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.dataset.theme === "dark");
  }, []);

  function toggleTheme() {
    const nextDark = document.documentElement.dataset.theme !== "dark";
    const root = document.documentElement;
    root.dataset.themeSwitching = "true";
    try {
      void root.offsetHeight;
      root.dataset.theme = nextDark ? "dark" : "light";
      void root.offsetHeight;
    } finally {
      delete root.dataset.themeSwitching;
    }
    setDark(nextDark);
    try {
      localStorage.setItem("modus-theme", nextDark ? "dark" : "light");
    } catch {}
  }

  return (
    <button
      type="button"
      aria-label={dark ? t("Cambiar a modo claro") : t("Cambiar a modo oscuro")}
      aria-pressed={dark}
      title={dark ? t("Cambiar a modo claro") : t("Cambiar a modo oscuro")}
      onClick={toggleTheme}
      className={className}
    >
      <i
        aria-hidden="true"
        className={`bi ${dark ? "bi-sun" : "bi-moon"} text-[14px] leading-none`}
      />
    </button>
  );
}
