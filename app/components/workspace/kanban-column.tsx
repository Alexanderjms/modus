"use client";

import styles from "./board.module.css";
import shared from "../workspace.module.css";
import { TaskCard } from "./task-card";
import type { BoardTask } from "./workspace-data";

export function KanbanColumn({
  name,
  index,
  tasks,
  available,
  dragged,
  move,
  onAddTask,
}: {
  name: string;
  index: number;
  tasks: BoardTask[];
  available: boolean;
  dragged: { current: string | null };
  move: (title: string, column: number) => void;
  onAddTask: (column: number) => void;
}) {
  return (
    <section
      className={`${styles.column} ${styles[`column${index}`] ?? ""}`}
      aria-label={name}
      tabIndex={0}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        if (dragged.current) move(dragged.current, index);
        dragged.current = null;
      }}
    >
      <header>
        <b className={styles.dot} />
        <h2>{name}</h2>
        <span>{tasks.length}</span>
      </header>
      {tasks.map((task) => (
        <TaskCard key={task.title} task={task} dragged={dragged} move={move} />
      ))}
      <button
        className={shared.addTask}
        disabled={!available}
        onClick={() => onAddTask(index)}
      >
        <i aria-hidden="true" className="bi bi-plus" />
        Agregar tarea
      </button>
    </section>
  );
}
