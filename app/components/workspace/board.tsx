"use client";

import type { RefObject } from "react";
import styles from "./board.module.css";
import shared from "../workspace.module.css";
import { BoardFilter } from "./board-filter";
import { KanbanColumn } from "./kanban-column";
import { columns } from "./workspace-data";

export function Board({
  priority,
  onPriority,
  projectName,
  projectsLoading,
  projectsError,
  onRetryProjects,
  chatOpen,
  onShowChat,
  contextOpen,
  onShowContext,
  chatTrigger,
  contextTrigger,
}: {
  priority: string;
  onPriority: (value: string) => void;
  projectName: string;
  projectsLoading: boolean;
  projectsError: string;
  onRetryProjects: () => void;
  chatOpen: boolean;
  onShowChat: () => void;
  contextOpen: boolean;
  onShowContext: () => void;
  chatTrigger: RefObject<HTMLButtonElement | null>;
  contextTrigger: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <section className={styles.board} aria-labelledby="board-title">
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
          className={`${shared.primary} ${styles.primary}`}
          disabled
        >
          <i aria-hidden="true" className="bi bi-plus" />
          Nueva tarea
        </button>
        <BoardFilter priority={priority} onPriority={onPriority} />
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
      {projectsLoading ? (
        <p role="status" className={shared.notice}>Cargando proyectos…</p>
      ) : projectsError ? (
        <p role="alert" className={shared.notice}>
          {projectsError}{" "}
          <button type="button" onClick={onRetryProjects}>Reintentar</button>
        </p>
      ) : projectName ? (
        <p role="status" className={shared.notice}>Este proyecto aún no tiene tareas.</p>
      ) : (
        <p role="status" className={shared.notice}>Crea un proyecto o selecciona uno para empezar.</p>
      )}
      <div className={styles.columns}>
        {columns.map((name, index) => (
          <KanbanColumn
            key={name}
            name={name}
            index={index}
          />
        ))}
      </div>
    </section>
  );
}
