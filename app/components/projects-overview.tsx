"use client";

import { useEffect, useRef, useState } from "react";
import { AppShell } from "./app-shell";
import styles from "./projects-overview.module.css";
import { EmptyState } from "./empty-state";
import { initialProjects, type Project } from "./projects-data";
import { ProjectsToolbar } from "./projects/projects-toolbar";
import { ProjectCard } from "./projects/project-card";
import { Icon } from "./projects/icon-helper";
import { CreateProjectModal } from "./projects/create-project-modal";
import { DeleteProjectModal } from "./projects/delete-project-modal";

const statuses = [null, "active", "completed", "archived"] as const;
type ProjectAction = "archive" | "restore" | "duplicate" | "delete";
type MutationAction = Exclude<ProjectAction, "delete">;

export function ProjectsOverview() {
  const [projects, setProjects] = useState(initialProjects);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reload, setReload] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [deletingProject, setDeletingProject] = useState<Project | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [pendingIds, setPendingIds] = useState<Set<number>>(() => new Set());
  const [actionError, setActionError] = useState<{
    project: Project;
    action: MutationAction;
    message: string;
  } | null>(null);
  const [globalQuery, setGlobalQuery] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState(0);
  const [sort, setSort] = useState("reference");
  const main = useRef<HTMLElement>(null);
  const mutationVersion = useRef(0);
  const pendingIdsRef = useRef(new Set<number>());

  useEffect(() => {
    const controller = new AbortController();
    const version = mutationVersion.current;
    async function loadProjects() {
      setLoading(true);
      setLoadError("");
      try {
        const response = await fetch("/api/projects", { signal: controller.signal });
        const result = (await response.json().catch(() => ({}))) as {
          projects?: Project[];
          error?: string;
        };
        if (!response.ok) throw new Error(result.error || "No se pudieron cargar los proyectos.");
        if (!Array.isArray(result.projects)) throw new Error("La respuesta no incluye los proyectos.");
        if (mutationVersion.current === version) setProjects(result.projects);
        else setReload((value) => value + 1);
      } catch (reason) {
        if (!controller.signal.aborted && mutationVersion.current === version) {
          setLoadError(
            reason instanceof Error ? reason.message : "No se pudieron cargar los proyectos.",
          );
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void loadProjects();
    return () => controller.abort();
  }, [reload]);

  useEffect(() => {
    function dismiss(event: PointerEvent | KeyboardEvent) {
      main.current
        ?.querySelectorAll<HTMLDetailsElement>("details[open]")
        .forEach((menu) => {
          if (event instanceof KeyboardEvent) {
            if (event.key !== "Escape") return;
            menu.querySelector("summary")?.focus();
          } else if (menu.contains(event.target as Node)) return;
          menu.open = false;
        });
    }
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", dismiss);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", dismiss);
    };
  }, []);

  function action(project: Project, action: ProjectAction) {
    if (pendingIdsRef.current.has(project.id)) return;
    if (action === "delete") {
      setActionError(null);
      setDeleteError("");
      setDeletingProject(project);
      return;
    }
    void executeAction(project, action);
  }

  async function executeAction(project: Project, action: MutationAction) {
    if (pendingIdsRef.current.has(project.id)) return;
    pendingIdsRef.current.add(project.id);
    setPendingIds(new Set(pendingIdsRef.current));
    setActionError(null);
    try {
      const duplicate = action === "duplicate";
      const response = await fetch(
        duplicate
          ? `/api/projects/${project.id}/duplicate`
          : `/api/projects/${project.id}`,
        duplicate
          ? { method: "POST" }
          : {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                estado: action === "archive"
                  ? "archived"
                  : project.progress === 100
                    ? "completed"
                    : "active",
              }),
            },
      );
      const result = (await response.json().catch(() => ({}))) as {
        project?: Project;
        error?: string;
      };
      if (response.status !== (duplicate ? 201 : 200)) {
        throw new Error(result.error || "No se pudo actualizar el proyecto.");
      }
      if (!result.project) throw new Error("La respuesta no incluye el proyecto actualizado.");
      mutationVersion.current++;
      setProjects((current) =>
        duplicate
          ? [result.project!, ...current]
          : current.map((item) => item.id === project.id ? result.project! : item),
      );
      setLoadError("");
    } catch (reason) {
      setActionError({
        project,
        action,
        message: reason instanceof Error ? reason.message : "No se pudo actualizar el proyecto.",
      });
    } finally {
      pendingIdsRef.current.delete(project.id);
      setPendingIds(new Set(pendingIdsRef.current));
    }
  }

  async function executeDelete(project: Project) {
    if (pendingIdsRef.current.has(project.id)) return;
    pendingIdsRef.current.add(project.id);
    setPendingIds(new Set(pendingIdsRef.current));
    setDeleteError("");
    try {
      const response = await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
      if (response.status !== 204) {
        const result = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(result.error || "No se pudo eliminar el proyecto.");
      }
      mutationVersion.current++;
      setProjects((current) => current.filter((item) => item.id !== project.id));
      setLoadError("");
      setDeletingProject(null);
    } catch (reason) {
      setDeleteError(
        reason instanceof Error ? reason.message : "No se pudo eliminar el proyecto.",
      );
    } finally {
      pendingIdsRef.current.delete(project.id);
      setPendingIds(new Set(pendingIdsRef.current));
    }
  }

  function closeDeleteModal() {
    if (deletingProject && pendingIdsRef.current.has(deletingProject.id)) return;
    setDeletingProject(null);
    setDeleteError("");
  }

  const hasProjects = projects.length > 0;
  const visible = projects.filter(
    (project) =>
      (filter === 0
        ? project.status !== "archived"
        : project.status === statuses[filter]) &&
      [query, globalQuery].every((value) =>
        `${project.name} ${project.description}`
          .toLocaleLowerCase("es")
          .includes(value.trim().toLocaleLowerCase("es")),
      ),
  );
  if (sort === "activity") visible.sort((a, b) => a.age - b.age);
  if (sort === "name")
    visible.sort((a, b) => a.name.localeCompare(b.name, "es"));
  if (sort === "progress") visible.sort((a, b) => b.progress - a.progress);

  return (
    <AppShell
      active="proyectos"
      query={globalQuery}
      onSearch={setGlobalQuery}
    >
      <main ref={main} className={styles.main}>
        <header className={styles.heading}>
          <div>
            <h1>Proyectos</h1>
            <p>Organiza todo lo que estás construyendo.</p>
          </div>
          <button
            className={styles.primary}
            onClick={() => setCreateOpen(true)}
          >
            <Icon name="plus" className={styles.primaryIcon} />
            Nuevo proyecto
          </button>
        </header>
        {loadError && (
          <p className={styles.empty} role="alert">
            {loadError}{" "}
            <button onClick={() => setReload((value) => value + 1)}>Reintentar</button>
          </p>
        )}
        {actionError && (
          <p className={styles.empty} role="alert">
            {actionError.message}{" "}
            <button onClick={() => executeAction(actionError.project, actionError.action)}>
              Reintentar
            </button>
          </p>
        )}
        {hasProjects ? (
          <>
            <ProjectsToolbar
              filter={filter}
              setFilter={setFilter}
              query={query}
              setQuery={setQuery}
              sort={sort}
              setSort={setSort}
            />
            <div className={styles.grid}>
              {visible.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  onAction={action}
                  onEdit={(item) => setEditingProject(item)}
                  pending={pendingIds.has(project.id)}
                />
              ))}
            </div>
            {!visible.length && (
              <p className={styles.empty} role="status">
                No hay proyectos que coincidan con estos filtros.
              </p>
            )}
          </>
        ) : loading ? (
          <p className={styles.empty} role="status">Cargando proyectos…</p>
        ) : loadError ? null : (
          <EmptyState
            icon="folder-plus"
            title="Aún no tienes proyectos"
            description="Crea tu primer proyecto para organizar tareas, conversaciones y contexto en un solo lugar."
            onCreate={() => setCreateOpen(true)}
          />
        )}
      </main>
      <CreateProjectModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(project) => {
          mutationVersion.current++;
          setActionError(null);
          setProjects((current) => [
            project,
            ...current.filter((item) => item.id !== project.id),
          ]);
          setFilter(
            project.status === "archived" ? 3 : project.status === "completed" ? 2 : 1,
          );
          setQuery("");
          setGlobalQuery("");
          setLoadError("");
        }}
      />
      <CreateProjectModal
        open={editingProject !== null}
        project={editingProject ?? undefined}
        onClose={() => setEditingProject(null)}
        onUpdated={(project) => {
          mutationVersion.current++;
          setActionError(null);
          setProjects((current) => current.map((item) => item.id === project.id ? project : item));
          setFilter(project.status === "archived" ? 3 : project.status === "completed" ? 2 : 1);
          setQuery("");
          setGlobalQuery("");
          setLoadError("");
        }}
      />
      <DeleteProjectModal
        project={deletingProject}
        error={deleteError}
        pending={deletingProject !== null && pendingIds.has(deletingProject.id)}
        onClose={closeDeleteModal}
        onConfirm={() => {
          if (deletingProject) void executeDelete(deletingProject);
        }}
      />
    </AppShell>
  );
}
