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
import type { TaskChange } from "./optimistic-suggestion";
import { useWorkspaceRequest } from "./workspace-query-provider";
import { useQueryClient } from "@tanstack/react-query";
import { invalidateWorkspaceQueries } from "./workspace-query.mjs";

function applyMove(list: BoardTask[], taskId: number, column: 0 | 1 | 2, beforeTaskId: number | null): BoardTask[] {
  const moving = list.find((task) => task.id === taskId);
  if (!moving) return list;
  const rest = list.filter((task) => task.id !== taskId);
  const inColumn = (value: number) => rest.filter((task) => task.column === value).sort((a, b) => a.order - b.order);
  const destination = inColumn(column);
  const target = beforeTaskId === null ? -1 : destination.findIndex((task) => task.id === beforeTaskId);
  destination.splice(target === -1 ? destination.length : target, 0, { ...moving, column });
  const orders = new Map<number, number>(destination.map((task, index) => [task.id, index]));
  if (moving.column !== column) inColumn(moving.column).forEach((task, index) => orders.set(task.id, index));
  return [...rest, { ...moving, column }].map((task) => (orders.has(task.id) ? { ...task, order: orders.get(task.id)! } : task));
}

export function Board({
  projectId,
  tasksVersion,
  appliedTask,
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
  tasksVersion: number;
  appliedTask: { projectId: number; key: number; changes: Omit<TaskChange, "refresh">[] } | null;
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
  const request = useWorkspaceRequest();
  const queryClient = useQueryClient();
  const [tasks, setTasks] = useState<BoardTask[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksError, setTasksError] = useState("");
  const [tasksProjectId, setTasksProjectId] = useState<number | null>(null);
  const [catalogs, setCatalogs] = useState<TaskCatalogsDto | null>(null);
  const [tasksReload, setTasksReload] = useState(0);
  const [selectedTask, setSelectedTask] = useState<{ id: number; projectId: number } | null>(null);
  const [moveFeedback, setMoveFeedback] = useState<Record<string, { pending: boolean; error: string }>>({});
  const [enteringTaskIds, setEnteringTaskIds] = useState<Set<number>>(() => new Set());
  const savePending = false;
  const [contextMenu, setContextMenu] = useState<{
    taskId: number;
    point: { x: number; y: number };
    anchor: { left: number; top: number; bottom: number };
  } | null>(null);
  const activeProjectId = useRef(projectId);
  const tasksProjectIdRef = useRef(tasksProjectId);
  tasksProjectIdRef.current = tasksProjectId;
  const previousProjectId = useRef(projectId);
  const projectVersion = useRef(0);
  const opQueue = useRef<Promise<unknown>>(Promise.resolve());
  const pendingOps = useRef(0);
  const tempIds = useRef(new Map<number, number>());
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
    if (!appliedTask || appliedTask.projectId !== projectId || tasksProjectIdRef.current !== projectId) return;
    const { changes } = appliedTask;
    setTasks((current) => {
      let next = current;
      for (const { task, replaceId, patch } of changes) {
        if (patch) next = next.map((item) => (item.id === patch.taskId ? patch.apply(item) : item));
        if (replaceId !== undefined) next = next.filter((item) => item.id !== replaceId);
        if (task) next = next.some((item) => item.id === task.id) ? next.map((item) => (item.id === task.id ? task : item)) : [...next, task];
      }
      return next;
    });
  }, [appliedTask]);

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
    if (tasksProjectIdRef.current !== requestedProjectId) {
      setTasks([]);
      setCatalogs(null);
    }
    const controller = new AbortController();
    const background = tasksProjectIdRef.current === requestedProjectId;
    async function loadTasks() {
      if (!background) setTasksLoading(true);
      setTasksError("");
      try {
        const res = await request(`/api/tasks?projectId=${requestedProjectId}&catalogs=1`, {
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
  }, [projectId, tasksReload, tasksVersion, request]);

  const enqueue = <T,>(job: () => Promise<T>): Promise<T> => {
    pendingOps.current += 1;
    const result = opQueue.current.then(job);
    opQueue.current = result.then(() => undefined, () => undefined).then(() => {
      pendingOps.current -= 1;
    });
    return result;
  };
  const resolveId = (taskId: number) => tempIds.current.get(taskId) ?? taskId;
  const isLastOp = () => pendingOps.current <= 1;
  const resync = (scope = activeProjectId.current) => {
    if (scope) void invalidateWorkspaceQueries(queryClient, "/api/tasks", scope);
    setTasksReload((value) => value + 1);
  };

  const handleAddTask = async (column: number, title: string): Promise<boolean> => {
    if (!projectId) return false;
    const requestedProjectId = projectId;
    const requestedVersion = projectVersion.current;
    const tempId = -Date.now();
    const sameScope = () => activeProjectId.current === requestedProjectId && projectVersion.current === requestedVersion;
    const lastOrder = tasks.filter((task) => task.column === column).reduce((max, task) => Math.max(max, task.order), -1);
    const draft: BoardTask = {
      id: tempId,
      listId: 0,
      column,
      order: lastOrder + 1,
      title,
      description: null,
      startDate: null,
      endDate: null,
      attachments: null,
      priority: "Sin prioridad",
      priorityColor: null,
      status: "Pendiente",
      tags: [],
      subtasks: [],
    };
    markTaskEntering(tempId);
    setTasks((prev) => [...prev, draft]);

    void enqueue(async () => {
      const discard = (message: string) => {
        if (sameScope()) setTasks((prev) => prev.filter((task) => task.id !== tempId));
        alert(message);
      };
      try {
        const res = await request("/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({ projectId: requestedProjectId, column, title }),
        });
        const data = (await res.json().catch(() => ({}))) as { task?: BoardTask; error?: string };
        if (!res.ok) return discard(data.error || "No se pudo crear la tarea.");
        const createdTask = data.task;
        if (!createdTask) return discard("El servidor no devolvió la tarea creada.");
        tempIds.current.set(tempId, createdTask.id);
        if (!sameScope()) return;
        setTasks((prev) => {
          if (prev.some((task) => task.id === tempId)) {
            return prev.map((task) => (task.id === tempId ? { ...task, id: createdTask.id, listId: createdTask.listId } : task));
          }
          return prev.some((task) => task.id === createdTask.id) ? prev : [...prev, createdTask];
        });
      } catch {
        discard("Error de red al intentar crear la tarea.");
      }
    });
    return true;
  };

  const handleMoveTask = async (
    taskId: number,
    column: 0 | 1 | 2,
    requestedProjectId: number,
    beforeTaskId: number | null = null
  ): Promise<string | null> => {
    if (activeProjectId.current !== requestedProjectId || tasksProjectId !== requestedProjectId) return null;
    const feedbackKey = `${requestedProjectId}:${taskId}`;
    const currentTask = tasks.find((task) => task.id === taskId);
    if (!currentTask) return "La tarea ya no está disponible en este proyecto.";
    if (beforeTaskId === taskId) return null;
    const requestedVersion = projectVersion.current;
    const sameScope = () => activeProjectId.current === requestedProjectId && projectVersion.current === requestedVersion;
    if (currentTask.column !== column) markTaskEntering(taskId);
    setTasks((current) => applyMove(current, taskId, column, beforeTaskId));
    const clearFeedback = () => setMoveFeedback((current) => {
      const next = { ...current };
      delete next[feedbackKey];
      return next;
    });
    const fail = (error: string) => {
      resync();
      setMoveFeedback((current) => ({ ...current, [feedbackKey]: { pending: false, error } }));
      return error;
    };

    return enqueue(async () => {
      const realId = resolveId(taskId);
      const realBefore = beforeTaskId === null ? null : resolveId(beforeTaskId);
      if (realId < 0 || (realBefore !== null && realBefore < 0)) return fail("La tarea no se pudo crear.");
      try {
        const res = await request("/api/tasks", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({ projectId: requestedProjectId, taskId: realId, column, beforeTaskId: realBefore }),
        });
        const data = (await res.json().catch(() => ({}))) as { task?: BoardTask; tasks?: BoardTask[]; error?: string };
        if (!sameScope()) {
          clearFeedback();
          return null;
        }
        if (!res.ok) return fail(data.error || "No se pudo mover la tarea.");
        if (!data.task || data.task.id !== realId || data.task.column !== column || !Array.isArray(data.tasks)) {
          return fail("El servidor devolvió una tarea no válida.");
        }
        if (isLastOp()) setTasks(data.tasks);
        clearFeedback();
        return null;
      } catch {
        if (!sameScope()) {
          clearFeedback();
          return null;
        }
        return fail("Error de red al mover la tarea. Inténtalo de nuevo.");
      }
    });
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
    const currentTask = tasks.find((task) => task.id === taskId);
    if (!currentTask || taskId < 0) return "La tarea ya no está disponible en este proyecto.";
    const requestedVersion = projectVersion.current;
    const sameScope = () => activeProjectId.current === requestedProjectId && projectVersion.current === requestedVersion;

    const priority = payload.priorityId === undefined
      ? { priority: currentTask.priority, priorityColor: currentTask.priorityColor }
      : payload.priorityId === null
        ? { priority: "Sin prioridad", priorityColor: null }
        : (() => {
            const found = catalogs?.priorities.find((item) => item.id === payload.priorityId);
            return found ? { priority: found.name, priorityColor: found.color } : { priority: currentTask.priority, priorityColor: currentTask.priorityColor };
          })();
    const optimistic: BoardTask = {
      ...currentTask,
      ...priority,
      title: payload.title,
      description: payload.description,
      startDate: payload.startDate,
      endDate: payload.endDate,
      attachments: payload.attachments,
      tags: payload.tags.flatMap((tag, index) => {
        if (typeof tag === "number") {
          const found = catalogs?.tags.find((item) => item.id === tag);
          return found ? [found] : [];
        }
        const name = typeof tag === "string" ? tag : tag.name;
        const color = typeof tag === "string" ? null : tag.color;
        const existing = catalogs?.tags.find((item) => item.name.toLocaleLowerCase("es") === name.toLocaleLowerCase("es"));
        return [existing ?? { id: -(index + 1), name, color, description: null }];
      }),
      subtasks: payload.subtasks.map((subtask, index) => ({
        id: subtask.id ?? -(index + 1),
        title: subtask.title,
        completed: subtask.completed,
      })),
    };
    setTasks((current) => current.map((task) => (task.id === taskId ? optimistic : task)));

    void enqueue(async () => {
      try {
        const res = await request("/api/tasks", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({ projectId: requestedProjectId, taskId: resolveId(taskId), ...payload }),
        });
        const data = (await res.json().catch(() => ({}))) as { task?: BoardTask; tasks?: BoardTask[]; error?: string };
        if (!res.ok) throw new Error(data.error || "No se pudo guardar la tarea.");
        if (!data.task || !Array.isArray(data.tasks)) throw new Error("El servidor devolvió una respuesta no válida.");
        if (sameScope() && isLastOp()) setTasks(data.tasks);
      } catch (error) {
        if (sameScope()) resync();
        alert(`No se pudieron guardar los cambios de la tarea. ${error instanceof Error ? error.message : "Error desconocido."}`);
      }
    });
    return null;
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
    if (!projectId || taskId < 0) return;
    const requestedProjectId = projectId;
    const requestedVersion = projectVersion.current;
    await enqueue(async () => {
      try {
        const res = await request("/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({ projectId: requestedProjectId, duplicateTaskId: resolveId(taskId) }),
        });
        const data = (await res.json().catch(() => ({}))) as { task?: BoardTask; tasks?: BoardTask[]; error?: string };
        if (activeProjectId.current !== requestedProjectId || projectVersion.current !== requestedVersion) return;
        if (!res.ok || !data.task || !Array.isArray(data.tasks)) {
          alert(data.error || "No se pudo duplicar la tarea.");
          return;
        }
        markTaskEntering(data.task.id);
        if (isLastOp()) setTasks(data.tasks);
        else resync();
      } catch {
        alert("Error de red al intentar duplicar la tarea.");
      }
    });
  };

  const handleDeleteTask = async (taskId: number) => {
    if (!projectId || taskId < 0) return;
    const task = tasks.find((item) => item.id === taskId);
    if (!task) return;
    const requestedProjectId = projectId;
    const requestedVersion = projectVersion.current;
    const sameScope = () => activeProjectId.current === requestedProjectId && projectVersion.current === requestedVersion;
    setSelectedTask((current) => (current?.id === taskId ? null : current));
    setTasks((current) => current.filter((item) => item.id !== taskId));
    await enqueue(async () => {
      try {
        const res = await request("/api/tasks", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({ projectId: requestedProjectId, taskId: resolveId(taskId) }),
        });
        const data = (await res.json().catch(() => ({}))) as { tasks?: BoardTask[]; error?: string };
        if (!sameScope()) return;
        if (!res.ok || !Array.isArray(data.tasks)) {
          resync();
          alert(data.error || "No se pudo eliminar la tarea.");
          return;
        }
        if (isLastOp()) setTasks(data.tasks);
      } catch {
        if (sameScope()) resync();
        alert("Error de red al intentar eliminar la tarea.");
      }
    });
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
              onOpenTask={(taskId) => { if (taskId > 0) setSelectedTask({ id: taskId, projectId: projectId! }); }}
              onMoveTask={handleMoveTask}
              onContextMenuTask={projectId ? (taskId, point, anchor) => { if (taskId > 0) setContextMenu({ taskId, point, anchor }); } : undefined}
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
        onTagDataChange={(nextCatalogs, nextTasks) => {
          if (!selectedTask || activeProjectId.current !== selectedTask.projectId) return;
          setCatalogs(nextCatalogs);
          setTasks(nextTasks);
        }}
        onTagEdited={(tagId, name, color) => {
          const rename = <T extends { id: number; name: string; color: string | null }>(tag: T): T => tag.id === tagId ? { ...tag, name, color } : tag;
          setCatalogs((current) => current && { ...current, tags: current.tags.map(rename) });
          setTasks((current) => current.map((task) => ({ ...task, tags: task.tags.map(rename) })));
        }}
        savePending={savePending}
        onClose={() => setSelectedTask(null)}
      />
    </section>
  );
}
