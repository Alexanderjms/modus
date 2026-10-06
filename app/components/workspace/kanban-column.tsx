"use client";

import { useEffect, useLayoutEffect, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import styles from "./board.module.css";
import shared from "../workspace.module.css";
import { Skeleton } from "../skeleton";
import { TaskCard } from "./task-card";
import type { BoardTask } from "./workspace-data";

export function KanbanColumn({
  name,
  index,
  projectId,
  tasks,
  onAddTask,
  onOpenTask,
  onMoveTask,
  onContextMenuTask,
  moveFeedback,
  enteringTaskIds,
  onTaskEntryAnimationEnd,
  disabled,
  loading,
}: {
  name: string;
  index: number;
  projectId?: number;
  tasks: BoardTask[];
  onAddTask: (column: number, title: string) => Promise<boolean>;
  onOpenTask: (taskId: number) => void;
  onMoveTask: (taskId: number, column: 0 | 1 | 2, projectId: number, beforeTaskId?: number | null) => Promise<string | null>;
  onContextMenuTask?: (taskId: number, point: { x: number; y: number }, anchor: { left: number; top: number; bottom: number }) => void;
  moveFeedback: Record<string, { pending: boolean; error: string }>;
  enteringTaskIds: Set<number>;
  onTaskEntryAnimationEnd: (taskId: number) => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  const [isComposing, setIsComposing] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const restoreAddFocus = useRef(false);
  const [isDropTarget, setIsDropTarget] = useState(false);
  const taskListRef = useRef<HTMLDivElement>(null);
  const previousTaskIds = useRef<number[] | null>(null);
  const previousPositions = useRef(new Map<number, { left: number; top: number }>());
  const positionAnimations = useRef(new Map<number, Animation>());

  useLayoutEffect(() => {
    const list = taskListRef.current;
    if (!list) return;
    const ids = tasks.map((task) => task.id);
    const oldIds = previousTaskIds.current;
    const sameCards = oldIds !== null && oldIds.length === ids.length && oldIds.every((id) => ids.includes(id));
    const reordered = oldIds !== null && sameCards && oldIds.some((id, position) => id !== ids[position]);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const easing = getComputedStyle(document.documentElement).getPropertyValue("--ease-drawer").trim()
      || "cubic-bezier(0.32, 0.72, 0, 1)";
    const nextPositions = new Map<number, { left: number; top: number }>();

    for (const card of list.querySelectorAll<HTMLElement>("[data-task-id]")) {
      const id = Number(card.dataset.taskId);
      const position = { left: card.offsetLeft, top: card.offsetTop };
      const previous = previousPositions.current.get(id);
      nextPositions.set(id, position);
      const active = positionAnimations.current.get(id);
      const animationIsRunning = active?.playState === "running";
      const layoutChanged = previous && (
        Math.abs(previous.left - position.left) > 0.5 || Math.abs(previous.top - position.top) > 0.5
      );

      if ((!reordered && !(animationIsRunning && layoutChanged)) || !previous || card.dataset.entering || reducedMotion) {
        if (reducedMotion && active) {
          active.cancel();
          positionAnimations.current.delete(id);
        }
        continue;
      }

      let x = previous.left - position.left;
      let y = previous.top - position.top;
      if (animationIsRunning && active) {
        const presentation = card.getBoundingClientRect();
        active.cancel();
        positionAnimations.current.delete(id);
        const layout = card.getBoundingClientRect();
        x = presentation.left - layout.left;
        y = presentation.top - layout.top;
      } else if (active) {
        active.cancel();
        positionAnimations.current.delete(id);
      }

      if (Math.abs(x) < 0.5 && Math.abs(y) < 0.5) continue;
      const animation = card.animate(
        [{ transform: `translate(${x}px, ${y}px)` }, { transform: "translate(0, 0)" }],
        { duration: 200, easing },
      );
      positionAnimations.current.set(id, animation);
      const clearAnimation = () => {
        if (positionAnimations.current.get(id) === animation) positionAnimations.current.delete(id);
      };
      animation.onfinish = clearAnimation;
      animation.oncancel = clearAnimation;
    }

    previousPositions.current = nextPositions;
    previousTaskIds.current = ids;
  }, [tasks]);

  useEffect(() => {
    const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const cancelWhenReduced = () => {
      if (!motionPreference.matches) return;
      for (const animation of positionAnimations.current.values()) animation.cancel();
      positionAnimations.current.clear();
    };
    motionPreference.addEventListener("change", cancelWhenReduced);
    return () => {
      motionPreference.removeEventListener("change", cancelWhenReduced);
      for (const animation of positionAnimations.current.values()) animation.cancel();
      positionAnimations.current.clear();
    };
  }, []);

  const isInternalDrag = (event: DragEvent<HTMLElement>) =>
    Array.from(event.dataTransfer.types).includes("application/x-modus-task");

  const handleDrop = (event: DragEvent<HTMLElement>) => {
    setIsDropTarget(false);
    if (!isInternalDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    try {
      const payload = JSON.parse(event.dataTransfer.getData("application/x-modus-task")) as {
        taskId?: unknown;
        projectId?: unknown;
      };
      if (
        Number.isSafeInteger(payload.taskId) && (payload.taskId as number) > 0 &&
        Number.isSafeInteger(payload.projectId) &&
        payload.projectId === projectId &&
        projectId !== undefined
      ) {
        void onMoveTask(payload.taskId as number, index as 0 | 1 | 2, projectId, null);
      }
    } catch {
      return;
    }
  };

  useEffect(() => {
    if (isComposing) {
      inputRef.current?.focus();
    } else if (restoreAddFocus.current) {
      restoreAddFocus.current = false;
      addButtonRef.current?.focus();
    }
  }, [isComposing]);

  const closeComposer = () => {
    restoreAddFocus.current = true;
    setDraftTitle("");
    setIsComposing(false);
  };

  const handleSubmit = async () => {
    const trimmed = draftTitle.trim();
    if (!trimmed || isSubmitting) return;

    setIsSubmitting(true);
    const success = await onAddTask(index, trimmed);
    setIsSubmitting(false);

    if (success) {
      closeComposer();
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return;
      e.preventDefault();
      void handleSubmit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeComposer();
    }
  };

  return (
    <section
      className={`${styles.column} ${styles[`column${index}`] ?? ""} ${
        isDropTarget ? styles.dropTarget : ""
      }`}
      aria-label={name}
      onDragOver={(event) => {
        if (!isInternalDrag(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setIsDropTarget(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setIsDropTarget(false);
        }
      }}
      onDrop={handleDrop}
    >
      <header>
        <b className={styles.dot} />
        <h2>{name}</h2>
        <span>{tasks.length}</span>
      </header>

      <div ref={taskListRef} className={styles.taskList} aria-busy={loading || undefined}>
        {loading ? (
          <>
            <Skeleton variant="rounded" height={72} />
            <Skeleton variant="rounded" height={56} />
            <Skeleton variant="rounded" height={72} />
          </>
        ) : (
          <>
            {tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onOpen={onOpenTask}
                onContextMenu={onContextMenuTask}
                projectId={projectId}
                animateEntry={enteringTaskIds.has(task.id)}
                onEntryAnimationEnd={onTaskEntryAnimationEnd}
                movePending={moveFeedback[`${projectId}:${task.id}`]?.pending}
                moveError={moveFeedback[`${projectId}:${task.id}`]?.error}
                onDropTask={(draggedTaskId, after) => {
                  if (!projectId) return;
                  const remaining = tasks.filter((item) => item.id !== draggedTaskId);
                  const targetIndex = remaining.findIndex((item) => item.id === task.id);
                  const beforeTaskId = remaining[targetIndex + (after ? 1 : 0)]?.id ?? null;
                  void onMoveTask(draggedTaskId, index as 0 | 1 | 2, projectId, beforeTaskId);
                }}
                onKeyboardMove={(taskId, key) => {
                  if (!projectId) return;
                  const taskIndex = tasks.findIndex((item) => item.id === taskId);
                  if (key === "ArrowUp" && taskIndex > 0) {
                    void onMoveTask(taskId, index as 0 | 1 | 2, projectId, tasks[taskIndex - 1].id);
                  } else if (key === "ArrowDown" && taskIndex >= 0) {
                    void onMoveTask(taskId, index as 0 | 1 | 2, projectId, tasks[taskIndex + 2]?.id ?? null);
                  } else if (key === "ArrowLeft" && index > 0) {
                    void onMoveTask(taskId, (index - 1) as 0 | 1 | 2, projectId, null).then((error) => {
                      if (!error) requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-task-id="${taskId}"]`)?.focus());
                    });
                  } else if (key === "ArrowRight" && index < 2) {
                    void onMoveTask(taskId, (index + 1) as 0 | 1 | 2, projectId, null).then((error) => {
                      if (!error) requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-task-id="${taskId}"]`)?.focus());
                    });
                  }
                }}
              />
            ))}

            {isComposing ? (
              <div className={styles.inlineComposer} aria-busy={isSubmitting || undefined}>
                <input
                  ref={inputRef}
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  onKeyDown={handleKeyDown}
                  required
                  placeholder="Título de la tarea…"
                  maxLength={255}
                  aria-label={`Título para ${name.toLocaleLowerCase("es")}`}
                  disabled={isSubmitting}
                />
                <button
                  type="button"
                  className={styles.addCardBtn}
                  onClick={() => void handleSubmit()}
                  disabled={isSubmitting || !draftTitle.trim()}
                  aria-label={isSubmitting ? "Guardando tarea" : "Añadir tarjeta"}
                  title="Añadir tarjeta"
                >
                  <i aria-hidden="true" className="bi bi-check-lg" />
                </button>
                <button
                  type="button"
                  className={styles.cancelCardBtn}
                  onClick={closeComposer}
                  aria-label="Cancelar"
                  title="Cancelar"
                  disabled={isSubmitting}
                >
                  <i aria-hidden="true" className="bi bi-x-lg" />
                </button>
              </div>
            ) : (
              <button
                ref={addButtonRef}
                type="button"
                className={shared.addTask}
                onClick={() => setIsComposing(true)}
                disabled={disabled}
                aria-label={`Agregar tarea a ${name.toLocaleLowerCase("es")}`}
              >
                <i aria-hidden="true" className="bi bi-plus" />
                <span>Agregar tarea</span>
              </button>
            )}
          </>
        )}
      </div>
    </section>
  );
}
