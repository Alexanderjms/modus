"use client";

import { useId } from "react";
import styles from "./profile-menu.module.css";
import { useLang } from "../../i18n/provider";
import { useUserName } from "../user-context";

export function ProfileMenu({
  id,
  onToggle,
  onOpenProfile,
  onOpenProviders,
  onOpenTavily,
  onLogout,
}: {
  id?: string;
  onToggle?: (open: boolean) => void;
  onOpenProfile?: () => void;
  onOpenProviders?: () => void;
  onOpenTavily?: () => void;
  onLogout?: () => void;
}) {
  const { lang, setLang, t } = useLang();
  const userName = useUserName();
  const displayName = userName ?? t("Perfil");
  const generatedId = useId();
  const menuId = id ?? generatedId;

  function closeMenu() {
    const popover = document.getElementById(menuId);
    if (popover && "hidePopover" in popover) {
      (popover as HTMLElement).hidePopover();
    }
  }

  return (
    <div
      id={menuId}
      popover="auto"
      className={styles.profileMenu}
      aria-label={t("Menú de {0}", displayName)}
      onToggle={(event) => onToggle?.(event.newState === "open")}
    >
      <p>{displayName}</p>
      <button
        type="button"
        onClick={() => {
          closeMenu();
          onOpenProfile?.();
        }}
      >
        <i aria-hidden="true" className="bi bi-person" />
        {t("Perfil")}
      </button>
      <button
        type="button"
        onClick={() => {
          closeMenu();
          onOpenProviders?.();
        }}
      >
        <i aria-hidden="true" className="bi bi-key" />
        {t("Proveedores")}
      </button>
      <button type="button" onClick={() => { closeMenu(); onOpenTavily?.(); }}>
        <i aria-hidden="true" className="bi bi-search" />
        {t("Tavily · Búsqueda web")}
      </button>
      <div className={styles.language} role="group" aria-label={t("Idioma")}>
        <i aria-hidden="true" className="bi bi-translate" />
        <span>{t("Idioma")}</span>
        <div className={styles.languageOptions}>
          {(["es", "en"] as const).map((option) => (
            <button
              key={option}
              type="button"
              lang={option}
              aria-pressed={lang === option}
              aria-label={option === "es" ? t("Español") : "English"}
              className={styles.languageOption}
              onClick={() => lang !== option && setLang(option)}
            >
              {option.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      {onLogout && (
        <button
          type="button"
          className={styles.logout}
          onClick={() => {
            closeMenu();
            onLogout();
          }}
        >
          <i aria-hidden="true" className="bi bi-box-arrow-right" />
          {t("Cerrar sesión")}
        </button>
      )}
    </div>
  );
}
