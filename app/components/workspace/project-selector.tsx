"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import styles from "./project-selector.module.css";
import headerStyles from "../shell/header.module.css";
import shared from "../workspace.module.css";
import { Skeleton } from "../skeleton";
import type { Project } from "../projects-data";
import { useT } from "../../i18n/provider";

export function ProjectSelector({
  project,
  projects,
  loading,
  error,
  onSelect,
}: {
  project: string;
  projects: readonly Project[];
  loading: boolean;
  error: string;
  onSelect: (project: string) => void;
}) {
  const t = useT();
  const details = useRef<HTMLDetailsElement>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    function close(event: PointerEvent | KeyboardEvent) {
      if (!details.current?.open) return;
      if (event instanceof KeyboardEvent) {
        if (event.key !== "Escape" || document.querySelector("dialog[open]")) return;
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
    <>
      <details
        ref={details}
        className={styles.projectSelector}
        onToggle={(event) => {
          if (event.currentTarget.open) setQuery("");
        }}
      >
        <summary aria-label={t("Seleccionar proyecto")}>
          <i aria-hidden="true" className="bi bi-folder" />
          <span>
            {project ||
              (loading ? (
                <Skeleton variant="text" width={96} />
              ) : error ? (
                t("Error al cargar proyectos")
              ) : (
                t("Sin proyecto seleccionado")
              ))}
          </span>
          <i aria-hidden="true" className="bi bi-chevron-down" />
        </summary>
        <div className={styles.projectMenu}>
          <label className={`${styles.projectSearch} ${headerStyles.search}`}>
            <i aria-hidden="true" className="bi bi-search" />
            <input
              type="search"
              aria-label={t("Buscar proyecto")}
              placeholder={t("Buscar proyecto…")}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <h2>{t("RECIENTES")}</h2>
          {projects
            .filter(({ name }) =>
              name
                .toLocaleLowerCase("es")
                .includes(query.trim().toLocaleLowerCase("es")),
            )
            .map(({ id, name }) => (
              <button
                key={id}
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
                <i aria-hidden="true" className="bi bi-folder" />
                <span>{name}</span>
                {project === name && (
                  <i aria-hidden="true" className="bi bi-check2" />
                )}
              </button>
            ))}
          {loading ? (
            <div role="status" aria-label={t("Cargando proyectos…")}>
              {[0, 1, 2].map((key) => (
                <div className={styles.projectSkeleton} key={key}>
                  <Skeleton variant="circular" width={14} height={14} />
                  <Skeleton variant="text" width="55%" />
                </div>
              ))}
            </div>
          ) : (
            !projects.some(({ name }) =>
              name
                .toLocaleLowerCase("es")
                .includes(query.trim().toLocaleLowerCase("es")),
            ) && (
              <p
                className={shared.notice}
                role={error ? "alert" : undefined}
              >
                {error ||
                  (query
                    ? t("Sin proyectos que coincidan.")
                    : t("Aún no hay proyectos."))}
              </p>
            )
          )}
          <div className={styles.projectMenuActions}>
            <Link className={styles.allProjects} href="/proyectos">
              <i aria-hidden="true" className="bi bi-grid" />
              <span>{t("Ver todos los proyectos")}</span>
              <i
                aria-hidden="true"
                className={`bi bi-arrow-right ${styles.actionArrow}`}
              />
            </Link>
          </div>
        </div>
      </details>
    </>
  );
}
