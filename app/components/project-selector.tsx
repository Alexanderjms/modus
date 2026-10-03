"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import styles from "./workspace.module.css";

const projects = [
  "Observatorio Regional",
  "Portfolio personal",
  "Lista de Compras",
];

export function ProjectSelector({
  project,
  onSelect,
}: {
  project: string;
  onSelect: (project: string) => void;
}) {
  const details = useRef<HTMLDetailsElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    function close(event: PointerEvent | KeyboardEvent) {
      if (!details.current?.open) return;
      if (event instanceof KeyboardEvent) {
        if (event.key !== "Escape") return;
        details.current.querySelector("summary")?.focus();
      } else if (details.current.contains(event.target as Node)) return;
      details.current.open = false;
    }
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, []);

  return (
    <details
      ref={details}
      className={styles.projectSelector}
      onToggle={(event) => {
        if (event.currentTarget.open) {
          setQuery("");
          search.current?.focus();
        }
      }}
    >
      <summary aria-label="Seleccionar proyecto">
        <i aria-hidden="true" className="bi bi-folder" />
        <span>{project}</span>
        <i aria-hidden="true" className="bi bi-chevron-down" />
      </summary>
      <div className={styles.projectMenu}>
        <label className={styles.projectSearch}>
          <i aria-hidden="true" className="bi bi-search" />
          <input
            ref={search}
            type="search"
            aria-label="Buscar proyecto"
            placeholder="Buscar proyecto…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <h2>RECIENTES</h2>
        {projects
          .filter((name) =>
            name
              .toLocaleLowerCase("es")
              .includes(query.trim().toLocaleLowerCase("es")),
          )
          .map((name) => (
            <button
              key={name}
              className={styles.projectOption}
              aria-pressed={project === name}
              onClick={() => {
                onSelect(name);
                if (details.current) {
                  details.current.open = false;
                  details.current.querySelector("summary")?.focus();
                }
              }}
            >
              <i
                aria-hidden="true"
                className="bi bi-folder"
                data-project={projects.indexOf(name)}
              />
              <span>{name}</span>
              {project === name && (
                <i aria-hidden="true" className="bi bi-check2" />
              )}
            </button>
          ))}
        {!projects.some((name) =>
          name
            .toLocaleLowerCase("es")
            .includes(query.trim().toLocaleLowerCase("es")),
        ) && <p className={styles.notice}>Sin proyectos que coincidan.</p>}
        <div className={styles.projectMenuActions}>
          <Link href="/proyectos">
            <i aria-hidden="true" className="bi bi-grid" />
            Ver todos los proyectos
          </Link>
          <button disabled title="Esta función aún no está integrada.">
            <i aria-hidden="true" className="bi bi-plus" />
            Nuevo proyecto
          </button>
        </div>
      </div>
    </details>
  );
}
