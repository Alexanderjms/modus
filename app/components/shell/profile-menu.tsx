"use client";

import { useId } from "react";
import styles from "./profile-menu.module.css";

export function ProfileMenu({
  id,
  onToggle,
}: {
  id?: string;
  onToggle?: (open: boolean) => void;
}) {
  const generatedId = useId();
  const menuId = id ?? generatedId;
  return (
    <div
      id={menuId}
      popover="auto"
      className={styles.profileMenu}
      aria-label="Opciones de Alexander"
      onToggle={(event) => onToggle?.(event.newState === "open")}
    >
      <p>Alexander</p>
      <button disabled title="Esta función aún no está integrada.">
        <i aria-hidden="true" className="bi bi-person" />
        Perfil
      </button>
      <button disabled title="Esta función aún no está integrada.">
        <i aria-hidden="true" className="bi bi-gear" />
        Configuración
      </button>
    </div>
  );
}
