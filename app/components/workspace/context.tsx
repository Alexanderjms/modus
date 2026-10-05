"use client";

import { useId } from "react";
import styles from "./context.module.css";
import shared from "../workspace.module.css";

export function WorkspaceContext({
  plan,
  project,
  hidden,
  onClose,
}: {
  plan: boolean;
  project: string;
  hidden: boolean;
  onClose: () => void;
}) {
  const id = useId();
  return (
    <aside
      id="workspace-context"
      className={`${styles.context} panel-slide-right`}
      aria-labelledby={`${id}-title`}
      data-closed={hidden}
      aria-hidden={hidden}
      inert={hidden}
    >
      <header className={shared.panelHeader}>
        <div>
          <h2 id={`${id}-title`}>{plan ? "Plan del proyecto" : "Contexto"}</h2>
          <p>{plan ? project : "Información que la IA tendrá en cuenta."}</p>
        </div>
        <button
          className={shared.iconButton}
          aria-label="Ocultar contexto"
          aria-expanded={!hidden}
          aria-controls="workspace-context"
          onClick={onClose}
        >
          <i aria-hidden="true" className="bi bi-layout-sidebar-reverse" />
        </button>
      </header>
      <div
        className={styles.contextBody}
        id={`${id}-content`}
      >
        <p className={shared.notice}>
          {project
            ? "Este proyecto aún no tiene contexto en esta vista."
            : "Selecciona un proyecto para ver su contexto."}
        </p>
      </div>
    </aside>
  );
}
