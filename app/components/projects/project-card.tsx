"use client";

import Link from "next/link";
import { useRef } from "react";
import type { Project } from "../projects-data";
import cardStyles from "./project-card.module.css";
import menuStyles from "./menu.module.css";
import { Icon } from "./icon-helper";

const unavailable = "Esta función aún no está integrada.";

export function ProjectCard({
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
      className={cardStyles.card}
      data-status={project.status}
      aria-label={project.name}
    >
      <div className={cardStyles.cardTop}>
        <span className={cardStyles.projectIcon}>
          <Icon name={project.icon} className={menuStyles.icon} />
        </span>
        <h2>
          <Link href={href}>{project.name}</Link>
        </h2>
        {project.status !== "active" && (
          <span className={cardStyles.chip}>
            {project.status === "completed" ? (
              <>
                <Icon name="check" className={menuStyles.icon} /> Completado
              </>
            ) : (
              "Archivado"
            )}
          </span>
        )}
        <details ref={menu} className={menuStyles.menu}>
          <summary aria-label={`Opciones de ${project.name}`}>
            <Icon name="three-dots" className={menuStyles.icon} />
          </summary>
          <div className={menuStyles.menuBody}>
            <Link href={href}>
              <Icon name="folder" className={menuStyles.icon} />
              Abrir
            </Link>
            <button disabled title={unavailable}>
              <Icon name="pencil" className={menuStyles.icon} />
              Editar
            </button>
            <button onClick={() => act("duplicate")}>
              <Icon name="copy" className={menuStyles.icon} />
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
                className={menuStyles.icon}
              />
              {project.status === "archived" ? "Restaurar" : "Archivar"}
            </button>
            <button
              className={menuStyles.danger}
              onClick={() => act("delete")}
            >
              <Icon name="trash" className={menuStyles.icon} />
              Eliminar
            </button>
          </div>
        </details>
      </div>
      <p className={cardStyles.description}>{project.description}</p>
      <div className={cardStyles.progressRow}>
        <progress
          max={100}
          value={project.progress}
          aria-label={`Progreso de ${project.name}`}
        />
        <strong>{project.progress}%</strong>
      </div>
      <div className={cardStyles.meta}>
        <span>{project.tasks}</span>
      </div>
      <div className={cardStyles.status}>
        {project.status === "active" ? (
          <>
            <span className={cardStyles.doing}>
              <b />
              {project.doing} en progreso
            </span>
            <span>Actualizado {project.activity}</span>
          </>
        ) : (
          <span>
            {project.status === "completed" ? (
              <>
                <Icon name="check" className={menuStyles.icon} /> Completado
              </>
            ) : (
              "Archivado"
            )}{" "}
            {project.activity}
          </span>
        )}
      </div>
      {project.status === "archived" && (
        <div className={cardStyles.archivedActions}>
          <button onClick={() => act("restore")}>
            <Icon name="arrow-counterclockwise" className={menuStyles.icon} />
            Restaurar
          </button>
        </div>
      )}
    </article>
  );
}
