"use client";

import type { RefObject } from "react";
import styles from "./board.module.css";
import shared from "../workspace.module.css";

export function BoardHeader({
  chatOpen,
  onShowChat,
  contextOpen,
  onShowContext,
  chatTrigger,
  contextTrigger,
}: {
  chatOpen: boolean;
  onShowChat: () => void;
  contextOpen: boolean;
  onShowContext: () => void;
  chatTrigger: RefObject<HTMLButtonElement | null>;
  contextTrigger: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <header className={styles.boardHeader}>
      {!chatOpen && (
        <button
          ref={chatTrigger}
          className={shared.iconButton}
          aria-label="Mostrar chat"
          aria-expanded={false}
          aria-controls="workspace-chat"
          onClick={onShowChat}
        >
          <i aria-hidden="true" className="bi bi-layout-sidebar" />
        </button>
      )}
      <div>
        <h1 id="board-title">Tablero Kanban</h1>
        <p>Gestiona y visualiza el progreso de tus tareas.</p>
      </div>
      <button
        className={shared.iconButton}
        aria-label="Más opciones del tablero"
        disabled
      >
        <i aria-hidden="true" className="bi bi-three-dots" />
      </button>
      {!contextOpen && (
        <button
          ref={contextTrigger}
          className={shared.iconButton}
          aria-label="Mostrar contexto"
          aria-expanded={false}
          aria-controls="workspace-context"
          onClick={onShowContext}
        >
          <i aria-hidden="true" className="bi bi-layout-sidebar-reverse" />
        </button>
      )}
    </header>
  );
}
