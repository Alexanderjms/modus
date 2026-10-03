"use client";

import styles from "./task-card.module.css";
import { columns, type BoardTask } from "./workspace-data";

export function TaskCard({
  task,
  dragged,
  move,
}: {
  task: BoardTask;
  dragged: { current: string | null };
  move: (title: string, column: number) => void;
}) {
  return (
    <article
      className={task.column === 3 ? styles.doneCard : styles.taskCard}
      draggable
      onDragStart={() => {
        dragged.current = task.title;
      }}
      onDragEnd={() => {
        dragged.current = null;
      }}
    >
      {task.column === 3 ? (
        <>
          <b className={styles.doneBadge}>
            <i aria-hidden="true" className="bi bi-check" />
          </b>
          <h3>{task.title}</h3>
          <span>{task.when}</span>
        </>
      ) : (
        <>
          <h3>{task.title}</h3>
          <div className={styles.tags}>
            {task.tags.map((tag) => (
              <span key={tag} data-tag={tag}>
                {tag}
              </span>
            ))}
          </div>
          <div className={styles.taskMeta}>
            <span className={styles.priority} data-priority={task.priority}>
              <b />
              Prioridad {task.priority}
            </span>
            {task.checklist && (
              <span>
                <i aria-hidden="true" className="bi bi-list-check" />{" "}
                {task.checklist}
              </span>
            )}
            <b className={styles.assignee} data-person={task.assignee}>
              {task.assignee}
            </b>
          </div>
          {task.progress !== undefined && (
            <progress
              max={100}
              value={task.progress}
              aria-label={`Subtareas de ${task.title}`}
            />
          )}
        </>
      )}
      <select
        className={styles.moveTask}
        aria-label={`Mover ${task.title}`}
        value={task.column}
        onChange={(event) => move(task.title, Number(event.target.value))}
      >
        {columns.map((column, position) => (
          <option key={column} value={position}>
            {column}
          </option>
        ))}
      </select>
    </article>
  );
}
