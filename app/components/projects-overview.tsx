"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AppShell } from "./app-shell";
import { initialProjects, type Project } from "./projects-data";
import styles from "./projects-overview.module.css";

const filters = ["Todos", "Activos", "Completados", "Archivados"] as const;
const statuses = [null, "active", "completed", "archived"] as const;
const sortOptions = [
  { value: "activity", label: "Última actividad" },
  { value: "name", label: "Nombre" },
  { value: "progress", label: "Progreso" },
];
const unavailable = "Esta función aún no está integrada.";

function Icon({ name }: { name: string }) {
  return <i aria-hidden="true" className={`bi bi-${name} ${styles.icon}`} />;
}

function ProjectCard({
  project,
  onAction,
}: {
  project: Project;
  onAction: (project: Project, action: string) => void;
}) {
  const menu = useRef<HTMLDetailsElement>(null);
  const href = `/workspace?project=${encodeURIComponent(project.name)}`;
  function act(action: string) {
    if (menu.current) {
      menu.current.open = false;
      menu.current.querySelector("summary")?.focus();
    }
    onAction(project, action);
  }
  return (
    <article
      className={styles.card}
      data-status={project.status}
      aria-label={project.name}
    >
      <div className={styles.cardTop}>
        <span className={styles.projectIcon}>
          <Icon name={project.icon} />
        </span>
        <h2>
          <Link href={href}>{project.name}</Link>
        </h2>
        {project.status !== "active" && (
          <span className={styles.chip}>
            {project.status === "completed" ? (
              <>
                <Icon name="check" /> Completado
              </>
            ) : (
              "Archivado"
            )}
          </span>
        )}
        <details ref={menu} className={styles.menu}>
          <summary aria-label={`Opciones de ${project.name}`}>
            <Icon name="three-dots" />
          </summary>
          <div className={styles.menuBody}>
            <Link href={href}>
              <Icon name="folder" />
              Abrir
            </Link>
            <button disabled title={unavailable}>
              <Icon name="pencil" />
              Editar
            </button>
            <button onClick={() => act("duplicate")}>
              <Icon name="copy" />
              Duplicar
            </button>
            <button
              onClick={() =>
                act(project.status === "archived" ? "restore" : "archive")
              }
            >
              <Icon
                name={
                  project.status === "archived"
                    ? "arrow-counterclockwise"
                    : "archive"
                }
              />
              {project.status === "archived" ? "Restaurar" : "Archivar"}
            </button>
            <button className={styles.danger} onClick={() => act("delete")}>
              <Icon name="trash" />
              Eliminar
            </button>
          </div>
        </details>
      </div>
      <p className={styles.description}>{project.description}</p>
      <div className={styles.progressRow}>
        <progress
          max={100}
          value={project.progress}
          aria-label={`Progreso de ${project.name}`}
        />
        <strong>{project.progress}%</strong>
      </div>
      <div className={styles.meta}>
        <span>{project.tasks}</span>
      </div>
      <div className={styles.status}>
        {project.status === "active" ? (
          <>
            <span className={styles.doing}>
              <b />
              {project.doing} en progreso
            </span>
            <span>Actualizado {project.activity}</span>
          </>
        ) : (
          <span>
            {project.status === "completed" ? (
              <>
                <Icon name="check" /> Completado
              </>
            ) : (
              "Archivado"
            )}{" "}
            {project.activity}
          </span>
        )}
      </div>
      {project.status === "archived" && (
        <div className={styles.archivedActions}>
          <button onClick={() => act("restore")}>
            <Icon name="arrow-counterclockwise" />
            Restaurar
          </button>
        </div>
      )}
    </article>
  );
}

export function ProjectsOverview() {
  const [projects, setProjects] = useState(initialProjects);
  const [globalQuery, setGlobalQuery] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState(0);
  const [sort, setSort] = useState("reference");
  const main = useRef<HTMLElement>(null);
  const sortMenu = useRef<HTMLDetailsElement>(null);
  const selectedSort = sort === "reference" ? "activity" : sort;

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
          <button className={styles.primary} disabled title={unavailable}>
            <Icon name="plus" />
            Nuevo proyecto
          </button>
        </header>
        <div className={styles.toolbar}>
          <div
            className={styles.filters}
            role="group"
            aria-label="Filtrar proyectos"
          >
            {filters.map((name, index) => (
              <button
                key={name}
                aria-pressed={filter === index}
                onClick={() => setFilter(index)}
              >
                {name}
              </button>
            ))}
          </div>
          <label className={styles.search}>
            <Icon name="search" />
            <input
              type="search"
              aria-label="Buscar proyectos"
              placeholder="Buscar proyectos…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <details
            ref={sortMenu}
            className={`${styles.menu} ${styles.sortMenu}`}
          >
            <summary className={styles.sort} aria-label="Ordenar proyectos">
              <Icon name="arrow-down-up" />
              <span>Ordenar por:</span>
              <strong>
                {
                  sortOptions.find((option) => option.value === selectedSort)
                    ?.label
                }
              </strong>
              <Icon name="chevron-down" />
            </summary>
            <div
              className={styles.menuBody}
              role="group"
              aria-label="Opciones de orden"
            >
              {sortOptions.map((option) => (
                <button
                  key={option.value}
                  className={styles.sortOption}
                  aria-pressed={selectedSort === option.value}
                  onClick={() => {
                    setSort(option.value);
                    if (sortMenu.current) {
                      sortMenu.current.open = false;
                      sortMenu.current.querySelector("summary")?.focus();
                    }
                  }}
                >
                  <span>{option.label}</span>
                  {selectedSort === option.value && <Icon name="check" />}
                </button>
              ))}
            </div>
          </details>
        </div>
        <div className={styles.grid}>
          {visible.map((project) => (
            <ProjectCard key={project.id} project={project} onAction={action} />
          ))}
        </div>
        {!visible.length && (
          <p className={styles.empty} role="status">
            No hay proyectos que coincidan con estos filtros.
          </p>
        )}
      </main>
    </AppShell>
  );
}
