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

const statuses = [null, "active", "completed", "archived"] as const;

export function ProjectsOverview() {
  const [projects, setProjects] = useState(initialProjects);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reload, setReload] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [globalQuery, setGlobalQuery] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState(0);
  const [sort, setSort] = useState("reference");
  const main = useRef<HTMLElement>(null);
  const createdProjects = useRef<Project[]>([]);

  useEffect(() => {
    const controller = new AbortController();
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
        setProjects([
          ...createdProjects.current,
          ...result.projects.filter(
            (project) => !createdProjects.current.some((created) => created.id === project.id),
          ),
        ]);
      } catch (reason) {
        if (!controller.signal.aborted && !createdProjects.current.length) {
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

  function action(project: Project, action: string) {
    if (
      action === "delete" &&
      !window.confirm(`¿Eliminar «${project.name}» de esta vista local?`)
    )
      return;
    setProjects((current) => {
      if (action === "delete")
        return current.filter((item) => item.id !== project.id);
      if (action === "duplicate")
        return [
          ...current,
          {
            ...project,
            id: Math.max(...current.map((item) => item.id), 0) + 1,
            name: `${project.name} (copia)`,
            activity: "ahora",
            age: 0,
          },
        ];
      return current.map((item) => {
        if (item.id !== project.id) return item;
        return {
          ...item,
          status:
            action === "archive"
              ? "archived"
              : item.progress === 100
                ? "completed"
                : "active",
          activity: "ahora",
          age: 0,
        };
      });
    });
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
      projects={projects}
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
          createdProjects.current = [
            project,
            ...createdProjects.current.filter((item) => item.id !== project.id),
          ];
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
    </AppShell>
  );
}
