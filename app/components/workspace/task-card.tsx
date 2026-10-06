"use client";

import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
  type CSSProperties,
} from "react";
import styles from "./task-card.module.css";
import type { BoardTask } from "./workspace-data";

export function TaskCard({
  task,
  onOpen,
  projectId,
  movePending = false,
  moveError = "",
  animateEntry,
  onEntryAnimationEnd,
  onDropTask,
  onKeyboardMove,
  onContextMenu,
}: {
  task: BoardTask;
  onOpen: (taskId: number) => void;
  projectId?: number;
  movePending?: boolean;
  moveError?: string;
  animateEntry: boolean;
  onEntryAnimationEnd: (taskId: number) => void;
  onDropTask?: (taskId: number, after: boolean) => void;
  onKeyboardMove?: (taskId: number, key: "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight") => void;
  onContextMenu?: (taskId: number, point: { x: number; y: number }, anchor: { left: number; top: number; bottom: number }) => void;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [canDrag, setCanDrag] = useState(false);
  const [dropPosition, setDropPosition] = useState<"before" | "after" | "">("");
  const suppressClick = useRef(false);
  const isDone = task.column === 2;
  const completedSubtasks = task.subtasks.filter(isSubtaskCompleted).length;
  const priorityName = task.priority.trim().toLocaleLowerCase("es");
  const hasPriority = priorityName !== "" && priorityName !== "sin prioridad";
  const priorityLabel = hasPriority ? `Prioridad ${priorityName}` : "Sin prioridad";
  const priorityColor = hasPriority ? task.priorityColor || fallbackPriorityColor(priorityName) : undefined;
  const tagSummary = task.tags.map(({ name }) => name).join(", ");

  useEffect(() => {
    setCanDrag(window.matchMedia("(hover: hover) and (pointer: fine)").matches);
  }, []);

  const handleClick = (event: MouseEvent<HTMLElement>) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      event.preventDefault();
      return;
    }
    onOpen?.(task.id);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (onContextMenu && (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10"))) {
      event.preventDefault();
      const rect = event.currentTarget.getBoundingClientRect();
      onContextMenu(task.id, { x: 0, y: 0 }, { left: rect.left, top: rect.top, bottom: rect.bottom });
      return;
    }
    if (event.altKey && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
      event.preventDefault();
      onKeyboardMove?.(task.id, event.key as "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight");
      return;
    }
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onOpen?.(task.id);
  };

  const handleContextMenu = (event: MouseEvent<HTMLElement>) => {
    if (!onContextMenu) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    onContextMenu(
      task.id,
      { x: event.clientX, y: event.clientY },
      { left: rect.left, top: rect.top, bottom: rect.bottom },
    );
  };

  const handleDragStart = (event: DragEvent<HTMLElement>) => {
    if (projectId === undefined || movePending) {
      event.preventDefault();
      return;
    }
    event.currentTarget.blur();
    suppressClick.current = true;
    setIsDragging(true);
    event.dataTransfer.setData("application/x-modus-task", JSON.stringify({ taskId: task.id, projectId }));
    event.dataTransfer.effectAllowed = "move";
  };

  const isInternalDrag = (event: DragEvent<HTMLElement>) =>
    Array.from(event.dataTransfer.types).includes("application/x-modus-task");

  const handleDrop = (event: DragEvent<HTMLElement>) => {
    if (!isInternalDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    setDropPosition("");
    if (movePending) return;
    try {
      const payload = JSON.parse(event.dataTransfer.getData("application/x-modus-task")) as {
        taskId?: unknown;
        projectId?: unknown;
      };
      if (
        payload.taskId !== task.id &&
        Number.isSafeInteger(payload.taskId) &&
        (payload.taskId as number) > 0 &&
        Number.isSafeInteger(payload.projectId) &&
        payload.projectId === projectId &&
        projectId !== undefined
      ) {
        const rect = event.currentTarget.getBoundingClientRect();
        onDropTask?.(payload.taskId as number, event.clientY >= rect.top + rect.height / 2);
      }
    } catch {
      return;
    }
  };

  return (
    <article
      data-task-id={task.id}
      className={`${styles.taskCard} ${isDone ? styles.doneCard : ""} ${isDragging ? styles.dragging : ""} ${animateEntry ? styles.entering : ""} ${dropPosition ? styles[`drop${dropPosition}`] : ""}`}
      role="button"
      tabIndex={0}
      data-entering={animateEntry || undefined}
      aria-label={`Abrir detalle de ${task.title}.${tagSummary ? ` Etiquetas: ${tagSummary}.` : ""} ${priorityLabel}. ${completedSubtasks} de ${task.subtasks.length} subtareas completadas. Arrastra para reordenar. Alt más flechas: mover arriba, abajo o entre columnas.`}
      aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown Alt+ArrowLeft Alt+ArrowRight"
      aria-busy={movePending || undefined}
      draggable={canDrag && projectId !== undefined && !movePending}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onContextMenu={handleContextMenu}
      onPointerDown={() => {
        if (suppressClick.current && !isDragging) suppressClick.current = false;
      }}
      onDragStart={handleDragStart}
      onDragOver={(event) => {
        if (!isInternalDrag(event)) return;
        event.preventDefault();
        event.stopPropagation();
        if (movePending) {
          setDropPosition("");
          return;
        }
        if (projectId === undefined) return;
        const rect = event.currentTarget.getBoundingClientRect();
        setDropPosition(event.clientY < rect.top + rect.height / 2 ? "before" : "after");
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropPosition("");
      }}
      onDrop={handleDrop}
      onDragEnd={() => setIsDragging(false)}
      onAnimationEnd={(event) => {
        if (animateEntry && event.target === event.currentTarget) onEntryAnimationEnd(task.id);
      }}
    >
      <h3>{task.title}</h3>
      {movePending && <span className={styles.moveStatus} role="status">Guardando cambio…</span>}
      {moveError && <p className={styles.moveError} role="alert">{moveError}</p>}
      {task.tags.length > 0 && (
        <ul className={styles.tags} aria-label="Etiquetas">
          {task.tags.map((tag) => (
            <li key={tag.id} style={{ "--tag-hue": getTaskTagHue(tag.name), ...(tag.color ? { "--tag-color": tag.color } : {}) } as CSSProperties}>
              <span>{tag.name}</span>
            </li>
          ))}
        </ul>
      )}
      <div className={styles.taskCardFooter}>
        <span className={styles.priority}>
          <b style={{ backgroundColor: priorityColor }} />
          <span>{priorityLabel}</span>
        </span>
        <span className={styles.subtaskCount} aria-hidden="true">
          <i className="bi bi-check2-square" />
          <span>{completedSubtasks}/{task.subtasks.length}</span>
        </span>
      </div>
    </article>
  );
}

function isSubtaskCompleted(subtask: BoardTask["subtasks"][number]) {
  return "completed" in subtask && subtask.completed === true;
}

export function fallbackPriorityColor(priority: string) {
  if (priority === "alta") return "#ff3b30";
  if (priority === "media") return "#ff9500";
  if (priority === "baja") return "#34c759";
  return undefined;
}

export function getTaskTagHue(name: string) {
  let hash = 0;
  for (const char of name.toLocaleLowerCase("es")) hash = (hash * 31 + char.codePointAt(0)!) >>> 0;
  return hash % 360;
}
