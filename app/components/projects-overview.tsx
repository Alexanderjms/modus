"use client";

import { useEffect, useRef, useState } from "react";
import { AppShell } from "./app-shell";
import styles from "./projects-overview.module.css";
import { EmptyState } from "./empty-state";
import { initialProjects, type Project } from "./projects-data";
import { ProjectsToolbar } from "./projects/projects-toolbar";
import { ProjectCard } from "./projects/project-card";
import { Icon } from "./projects/icon-helper";

const statuses = [null, "active", "completed", "archived"] as const;
const unavailable = "Esta función aún no está integrada.";

export function ProjectsOverview() {
  const [projects, setProjects] = useState(initialProjects);
  const [globalQuery, setGlobalQuery] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState(0);
  const [sort, setSort] = useState("reference");
  const main = useRef<HTMLElement>(null);

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
          {hasProjects && (
            <button className={styles.primary} disabled title={unavailable}>
              <Icon name="plus" className={styles.primaryIcon} />
              Nuevo proyecto
            </button>
          )}
        </header>
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
        ) : (
          <EmptyState
            icon="folder-plus"
            title="Aún no tienes proyectos"
            description="Crea tu primer proyecto para organizar tareas, conversaciones y contexto en un solo lugar."
          />
        )}
      </main>
    </AppShell>
  );
}
