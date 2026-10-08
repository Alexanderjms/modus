"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Project } from "../projects-data";
import { Icon } from "../ui-icon";
import styles from "./menu.module.css";
import { useT } from "../../i18n/provider";

export type ProjectAction = "archive" | "restore" | "duplicate" | "delete";

export function ProjectActionsMenu({
  project,
  onAction,
  onEdit,
  pending,
}: {
  project: Project;
  onAction: (project: Project, action: ProjectAction) => void | Promise<void>;
  onEdit: (project: Project) => void;
  pending: boolean;
}) {
  const t = useT();
  const menu = useRef<HTMLDetailsElement>(null);
  const [open, setOpen] = useState(false);
  const href = `/workspace?project=${encodeURIComponent(project.name)}`;

  function closeMenu(restoreFocus = true) {
    if (menu.current) {
      menu.current.open = false;
      if (restoreFocus) menu.current.querySelector("summary")?.focus();
    }
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const details = menu.current!;
    function dismiss(event: PointerEvent | KeyboardEvent) {
      if (event instanceof KeyboardEvent) {
        if (event.key !== "Escape") return;
        event.preventDefault();
        const restoreFocus = details.contains(document.activeElement);
        details.open = false;
        if (restoreFocus) details.querySelector("summary")?.focus();
        setOpen(false);
      } else if (!details.contains(event.target as Node)) {
        details.open = false;
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", dismiss);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", dismiss);
    };
  }, [open]);

  function act(action: ProjectAction) {
    closeMenu();
    void onAction(project, action);
  }

  return (
    <details
      ref={menu}
      className={styles.menu}
      onToggle={() => setOpen(menu.current?.open ?? false)}
    >
      <summary aria-label={t("Opciones de {0}", project.name)}>
        <Icon name="three-dots" className={styles.icon} />
      </summary>
      <div className={styles.menuBody}>
        <Link href={href}>
          <Icon name="folder" className={styles.icon} />
          {t("Abrir")}
        </Link>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            closeMenu();
            onEdit(project);
          }}
        >
          <Icon name="pencil" className={styles.icon} />
          {t("Editar")}
        </button>
        <button type="button" disabled={pending} onClick={() => act("duplicate")}>
          <Icon name="copy" className={styles.icon} />
          {t("Duplicar")}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => act(project.status === "archived" ? "restore" : "archive")}
        >
          <Icon
            name={project.status === "archived" ? "arrow-counterclockwise" : "archive"}
            className={styles.icon}
          />
          {project.status === "archived" ? t("Restaurar") : t("Archivar")}
        </button>
        <button
          type="button"
          className={styles.danger}
          disabled={pending}
          onClick={() => act("delete")}
        >
          <Icon name="trash" className={styles.icon} />
          {t("Eliminar")}
        </button>
      </div>
    </details>
  );
}
