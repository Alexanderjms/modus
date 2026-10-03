"use client";

import type { FormEvent, RefObject } from "react";
import styles from "./board.module.css";
import shared from "../workspace.module.css";
import { BoardFilter } from "./board-filter";
import { KanbanColumn } from "./kanban-column";
import { NewTaskForm } from "./new-task-form";
import { columns, type BoardTask } from "./workspace-data";

export function Board({
  available,
  query,
  visible,
  priority,
  onPriority,
  newColumn,
  onNewColumn,
  title,
  onTitle,
  notice,
  move,
  addTask,
  chatOpen,
  onShowChat,
  contextOpen,
  onShowContext,
  chatTrigger,
  contextTrigger,
  dragged,
}: {
  available: boolean;
  query: string;
  visible: BoardTask[];
  priority: string;
  onPriority: (value: string) => void;
  newColumn: number | null;
  onNewColumn: (column: number | null) => void;
  title: string;
  onTitle: (value: string) => void;
  notice: string;
  move: (title: string, column: number) => void;
  addTask: (event: FormEvent<HTMLFormElement>) => void;
  chatOpen: boolean;
  onShowChat: () => void;
  contextOpen: boolean;
  onShowContext: () => void;
  chatTrigger: RefObject<HTMLButtonElement | null>;
  contextTrigger: RefObject<HTMLButtonElement | null>;
  dragged: { current: string | null };
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
          onClick={() => onNewColumn(0)}
          disabled={!available}
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
      {newColumn !== null && (
        <NewTaskForm
          title={title}
          onTitle={onTitle}
          onSubmit={addTask}
          onCancel={() => onNewColumn(null)}
        />
      )}
      <div className={styles.columns}>
        {columns.map((name, index) => (
          <KanbanColumn
            key={name}
            name={name}
            index={index}
            tasks={visible.filter((task) => task.column === index)}
            available={available}
            dragged={dragged}
            move={move}
            onAddTask={onNewColumn}
          />
        ))}
      </div>
      <p role="status" className={notice ? shared.notice : "sr-only"}>
        {notice ||
          (query && !visible.length
            ? "Sin tareas que coincidan con la búsqueda."
            : "")}
      </p>
    </section>
  );
}
