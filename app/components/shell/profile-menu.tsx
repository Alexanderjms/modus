"use client";

import { useId } from "react";
import styles from "./profile-menu.module.css";

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
      aria-label="Opciones de Alexander"
      onToggle={(event) => onToggle?.(event.newState === "open")}
    >
      <p>Alexander</p>
      <button
        type="button"
        onClick={() => {
          closeMenu();
          onOpenProfile?.();
        }}
      >
        <i aria-hidden="true" className="bi bi-person" />
        Perfil
      </button>
      <button
        type="button"
        onClick={() => {
          closeMenu();
          onOpenProviders?.();
        }}
      >
        <i aria-hidden="true" className="bi bi-key" />
        Proveedores
      </button>
      <button type="button" onClick={() => { closeMenu(); onOpenTavily?.(); }}>
        <i aria-hidden="true" className="bi bi-search" />
        Tavily · Búsqueda web
      </button>
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
          Cerrar sesión
        </button>
      )}
    </div>
  );
}
