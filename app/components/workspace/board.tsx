"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import styles from "./board.module.css";
import { KanbanColumn } from "./kanban-column";
import { columns, type BoardTask } from "./workspace-data";
import { TaskDetailModal, type TaskEditPayload } from "./task-detail-modal";
import { TaskContextMenu } from "./task-context-menu";
import { BoardHeader } from "./board-header";
import { BoardNotice } from "./board-notice";
import type { TaskCatalogsDto } from "../../api/tasks/route";

export function Board({
  projectId,
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
  projectId?: number | null;
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
  const [tasks, setTasks] = useState<BoardTask[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksError, setTasksError] = useState("");
  const [tasksProjectId, setTasksProjectId] = useState<number | null>(null);
  const [catalogs, setCatalogs] = useState<TaskCatalogsDto | null>(null);
  const [tasksReload, setTasksReload] = useState(0);
  const [selectedTask, setSelectedTask] = useState<{ id: number; projectId: number } | null>(null);
  const [moveFeedback, setMoveFeedback] = useState<Record<string, { pending: boolean; error: string }>>({});
  const [enteringTaskIds, setEnteringTaskIds] = useState<Set<number>>(() => new Set());
  const [savePending, setSavePending] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    taskId: number;
    point: { x: number; y: number };
    anchor: { left: number; top: number; bottom: number };
  } | null>(null);
  const activeProjectId = useRef(projectId);
  const previousProjectId = useRef(projectId);
  const projectVersion = useRef(0);
  const movingTaskIds = useRef(new Set<number>());
  if (previousProjectId.current !== projectId) {
    previousProjectId.current = projectId;
    projectVersion.current += 1;
  }
  activeProjectId.current = projectId;

  const markTaskEntering = (taskId: number) => setEnteringTaskIds((current) => {
    if (current.has(taskId)) return current;
    const next = new Set(current);
    next.add(taskId);
    return next;
  });

  const clearTaskEntry = (taskId: number) => setEnteringTaskIds((current) => {
    if (!current.has(taskId)) return current;
    const next = new Set(current);
    next.delete(taskId);
    return next;
  });

  useEffect(() => {
    if (!projectId) {
      setTasks([]);
      setTasksError("");
      setTasksProjectId(null);
      setCatalogs(null);
      setTasksLoading(false);
      return;
    }

    const requestedProjectId = projectId;
    const controller = new AbortController();
    async function loadTasks() {
      setTasksLoading(true);
      setTasksError("");
      setTasks([]);
      setCatalogs(null);
      try {
        const res = await fetch(`/api/tasks?projectId=${requestedProjectId}&catalogs=1`, {
          signal: controller.signal,
          cache: "no-store",
        });
        const data = (await res.json().catch(() => ({}))) as {
          tasks?: BoardTask[];
          catalogs?: TaskCatalogsDto;
          error?: string;
        };
        if (controller.signal.aborted) return;
        if (!res.ok) {
          throw new Error(data.error || "No se pudieron cargar las tareas.");
        }
        if (!Array.isArray(data.tasks)) throw new Error("La respuesta no incluye las tareas.");
        if (!data.catalogs) throw new Error("La respuesta no incluye los catálogos de tareas.");
        setTasks(data.tasks);
        setCatalogs(data.catalogs);
      } catch (err) {
        if (!controller.signal.aborted) {
          setTasksError(err instanceof Error ? err.message : "Error al cargar tareas");
        }
      } finally {
        if (!controller.signal.aborted) {
          setTasksProjectId(requestedProjectId);
          setTasksLoading(false);
        }
      }
    }

    void loadTasks();
    return () => controller.abort();
  }, [projectId, tasksReload]);

  const handleAddTask = async (column: number, title: string): Promise<boolean> => {
    if (!projectId) return false;

    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          projectId,
          column,
          title,
        }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        task?: BoardTask;
        error?: string;
      };
      if (!res.ok) {
        alert(data.error || "No se pudo crear la tarea.");
        return false;
      }

      const createdTask = data.task;
      if (createdTask) {
        markTaskEntering(createdTask.id);
        setTasks((prev) => [...prev, createdTask]);
        return true;
      }
      alert("El servidor no devolvió la tarea creada.");
      return false;
    } catch {
      alert("Error de red al intentar crear la tarea.");
      return false;
    }
  };

  const handleMoveTask = async (
    taskId: number,
    column: 0 | 1 | 2,
    requestedProjectId: number,
    beforeTaskId: number | null = null
  ): Promise<string | null> => {
    if (activeProjectId.current !== requestedProjectId || tasksProjectId !== requestedProjectId) return null;
    const feedbackKey = `${requestedProjectId}:${taskId}`;
    if (movingTaskIds.current.size > 0) {
      const error = "Hay otro cambio de tarea en curso. Espera a que termine antes de mover otra.";
      if (!movingTaskIds.current.has(taskId)) {
        setMoveFeedback((current) => ({ ...current, [feedbackKey]: { pending: false, error } }));
      }
      return error;
    }
    const currentTask = tasks.find((task) => task.id === taskId);
    if (!currentTask) return "La tarea ya no está disponible en este proyecto.";
    if (beforeTaskId === taskId) return null;
    const requestedVersion = projectVersion.current;
    movingTaskIds.current.add(taskId);
    setMoveFeedback((current) => ({ ...current, [feedbackKey]: { pending: true, error: "" } }));
    const clearFeedback = () => setMoveFeedback((current) => {
      const next = { ...current };
      delete next[feedbackKey];
      return next;
    });

    try {
      const res = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ projectId: requestedProjectId, taskId, column, beforeTaskId }),
      });
      const data = (await res.json().catch(() => ({}))) as { task?: BoardTask; tasks?: BoardTask[]; error?: string };
      if (activeProjectId.current !== requestedProjectId || projectVersion.current !== requestedVersion) {
        clearFeedback();
        return null;
      }
      if (!res.ok) {
        const error = data.error || "No se pudo mover la tarea.";
        setMoveFeedback((current) => ({ ...current, [feedbackKey]: { pending: false, error } }));
        return error;
      }
      if (!data.task || data.task.id !== taskId || data.task.column !== column || !Array.isArray(data.tasks)) {
        const error = "El servidor devolvió una tarea no válida.";
        setMoveFeedback((current) => ({ ...current, [feedbackKey]: { pending: false, error } }));
        return error;
      }
      if (currentTask.column !== column) markTaskEntering(taskId);
      setTasks((current) => activeProjectId.current === requestedProjectId && projectVersion.current === requestedVersion ? data.tasks! : current);
      clearFeedback();
      return null;
    } catch {
      if (activeProjectId.current !== requestedProjectId || projectVersion.current !== requestedVersion) {
        clearFeedback();
        return null;
      }
      const error = "Error de red al mover la tarea. Inténtalo de nuevo.";
      setMoveFeedback((current) => ({ ...current, [feedbackKey]: { pending: false, error } }));
      return error;
    } finally {
      movingTaskIds.current.delete(taskId);
    }
  };

  const handleSaveTask = async (
    taskId: number,
    requestedProjectId: number,
    column: 0 | 1 | 2,
    payload: TaskEditPayload,
  ): Promise<string | null> => {
    if (activeProjectId.current !== requestedProjectId || tasksProjectId !== requestedProjectId) {
      return "La tarea ya no está disponible en este proyecto.";
    }
    if (movingTaskIds.current.size > 0) {
      return "Hay otro cambio de tarea en curso. Espera a que termine antes de guardar.";
    }
    const currentTask = tasks.find((task) => task.id === taskId);
    if (!currentTask) return "La tarea ya no está disponible en este proyecto.";
    const requestedVersion = projectVersion.current;
    movingTaskIds.current.add(taskId);
    setSavePending(true);
    const request = async (body: Record<string, unknown>, entersColumn = false) => {
      const res = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ projectId: requestedProjectId, taskId, ...body }),
      });
      const data = (await res.json().catch(() => ({}))) as { task?: BoardTask; tasks?: BoardTask[]; error?: string };
      if (!res.ok) throw new Error(data.error || "No se pudo guardar la tarea.");
      if (!data.task || data.task.id !== taskId || !Array.isArray(data.tasks)) throw new Error("El servidor devolvió una respuesta no válida.");
      if (activeProjectId.current !== requestedProjectId || projectVersion.current !== requestedVersion) return false;
      if (entersColumn) markTaskEntering(taskId);
      setTasks(data.tasks);
      return true;
    };

    try {
      const changingColumn = column !== currentTask.column;
      if (changingColumn) {
        try {
          const moved = await request({ column, beforeTaskId: null }, true);
          if (!moved) return null;
        } catch (error) {
          return `No se pudo mover la tarea; los cambios del formulario no se guardaron. ${error instanceof Error ? error.message : "Error desconocido."}`;
        }
      }
      try {
        const edited = await request(payload);
        if (!edited) return null;
      } catch (error) {
        if (changingColumn) {
          return `La tarea se movió, pero los cambios del formulario no se guardaron. ${error instanceof Error ? error.message : "Error desconocido."}`;
        }
        throw error;
      }
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : "Error al guardar la tarea.";
    } finally {
      movingTaskIds.current.delete(taskId);
      setSavePending(false);
    }
  };

  const handleTaskMove = async (taskId: number, column: 0 | 1 | 2) => {
    if (!projectId) return;
    const currentTask = tasks.find((task) => task.id === taskId);
    if (currentTask?.column === column) return;
    const error = await handleMoveTask(taskId, column, projectId, null);
    if (error) alert(error);
  };

  const handleTaskPriority = async (taskId: number, priorityId: number | null) => {
    if (!projectId) return;
    const task = tasks.find((item) => item.id === taskId);
    if (!task) return;
    const error = await handleSaveTask(taskId, projectId, task.column as 0 | 1 | 2, {
      title: task.title,
      description: task.description,
      startDate: task.startDate,
      endDate: task.endDate,
      attachments: task.attachments,
      priorityId,
      tags: task.tags.map((tag) => tag.id),
      subtasks: task.subtasks.map((subtask) => ({ id: subtask.id, title: subtask.title, completed: subtask.completed })),
    });
    if (error) alert(error);
  };

  const handleDuplicateTask = async (taskId: number) => {
    if (!projectId) return;
    const requestedProjectId = projectId;
    const requestedVersion = projectVersion.current;
    if (movingTaskIds.current.size > 0) return;
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ projectId: requestedProjectId, duplicateTaskId: taskId }),
      });
      const data = (await res.json().catch(() => ({}))) as { task?: BoardTask; tasks?: BoardTask[]; error?: string };
      if (activeProjectId.current !== requestedProjectId || projectVersion.current !== requestedVersion) return;
      if (!res.ok || !data.task || !Array.isArray(data.tasks)) {
        alert(data.error || "No se pudo duplicar la tarea.");
        return;
      }
      markTaskEntering(data.task.id);
      setTasks(data.tasks);
    } catch {
      alert("Error de red al intentar duplicar la tarea.");
    }
  };

  const handleDeleteTask = async (taskId: number) => {
    if (!projectId) return;
    const task = tasks.find((item) => item.id === taskId);
    if (!task) return;
    const requestedProjectId = projectId;
    const requestedVersion = projectVersion.current;
    if (movingTaskIds.current.size > 0) return;
    movingTaskIds.current.add(taskId);
    try {
      const res = await fetch("/api/tasks", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ projectId: requestedProjectId, taskId }),
      });
      const data = (await res.json().catch(() => ({}))) as { tasks?: BoardTask[]; error?: string };
      if (activeProjectId.current !== requestedProjectId || projectVersion.current !== requestedVersion) return;
      if (!res.ok || !Array.isArray(data.tasks)) {
        alert(data.error || "No se pudo eliminar la tarea.");
        return;
      }
      setSelectedTask((current) => (current?.id === taskId ? null : current));
      setTasks(data.tasks);
    } catch {
      alert("Error de red al intentar eliminar la tarea.");
    } finally {
      movingTaskIds.current.delete(taskId);
    }
  };

  const currentTasks = projectId && tasksProjectId === projectId ? tasks : [];
  const boardLoading = projectsLoading || tasksLoading || Boolean(projectId && tasksProjectId !== projectId);

  return (
    <section className={styles.board} aria-labelledby="board-title">
      <BoardHeader
        chatOpen={chatOpen}
        onShowChat={onShowChat}
        contextOpen={contextOpen}
        onShowContext={onShowContext}
        chatTrigger={chatTrigger}
        contextTrigger={contextTrigger}
      />
      <BoardNotice
        loading={boardLoading}
        projectsError={projectsError}
        tasksError={tasksError}
        hasProject={Boolean(projectName)}
        onRetry={() => projectsError ? onRetryProjects() : setTasksReload((value) => value + 1)}
      />
      <div className={styles.columns}>
        {columns.map((name, index) => {
          const colTasks = currentTasks.filter((t) => t.column === index);
          colTasks.sort((a, b) => a.order - b.order);
          return (
            <KanbanColumn
              key={name}
              name={name}
              index={index}
              projectId={projectId ?? undefined}
              tasks={colTasks}
              onAddTask={handleAddTask}
              onOpenTask={(taskId) => setSelectedTask({ id: taskId, projectId: projectId! })}
              onMoveTask={handleMoveTask}
              onContextMenuTask={projectId ? (taskId, point, anchor) => setContextMenu({ taskId, point, anchor }) : undefined}
              moveFeedback={moveFeedback}
              enteringTaskIds={enteringTaskIds}
              onTaskEntryAnimationEnd={clearTaskEntry}
              disabled={!projectId}
              loading={boardLoading}
            />
          );
        })}
      </div>
      {contextMenu && projectId &&
        (() => {
          const task = currentTasks.find((item) => item.id === contextMenu.taskId);
          if (!task) return null;
          return (
            <TaskContextMenu
              task={task}
              priorities={catalogs?.priorities ?? []}
              anchor={contextMenu.anchor}
              point={contextMenu.point}
              onClose={() => setContextMenu(null)}
              onOpenDetail={() => setSelectedTask({ id: task.id, projectId })}
              onMove={(column) => void handleTaskMove(task.id, column)}
              onSetPriority={(priorityId) => void handleTaskPriority(task.id, priorityId)}
              onDuplicate={() => void handleDuplicateTask(task.id)}
              onDelete={() => void handleDeleteTask(task.id)}
            />
          );
        })()}
      <TaskDetailModal
        task={
          selectedTask && selectedTask.projectId === projectId
            ? tasks.find((task) => task.id === selectedTask.id) ?? null
            : null
        }
        projectId={selectedTask?.projectId}
        catalogs={catalogs}
        onSave={handleSaveTask}
        savePending={savePending}
        onClose={() => setSelectedTask(null)}
      />
    </section>
  );
}
