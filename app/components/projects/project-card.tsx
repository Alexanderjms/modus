"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Project } from "../projects-data";
import cardStyles from "./project-card.module.css";
import menuStyles from "./menu.module.css";
import { Icon } from "../icon";
import { ProjectActionsMenu, type ProjectAction } from "./project-actions-menu";

export function ProjectCard({
  project,
  onAction,
  onEdit,
  pending,
}: {
  project: Project;
  onAction: (project: Project, action: ProjectAction) => void | Promise<void>;
  onEdit: (project: Project) => void;
  pending: boolean;
}) {
  const router = useRouter();
  const href = `/workspace?project=${encodeURIComponent(project.name)}`;
  function act(action: "archive" | "restore" | "duplicate" | "delete") {
    void onAction(project, action);
  }
  return (
    <article
      className={cardStyles.card}
      data-status={project.status}
      aria-label={project.name}
      aria-busy={pending || undefined}
      onClick={(event) => {
        if (!(event.target as Element).closest("a, button, details"))
          router.push(href);
      }}
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
        <ProjectActionsMenu
          project={project}
          onAction={onAction}
          onEdit={onEdit}
          pending={pending}
        />
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
      {pending && (
        <span className={cardStyles.meta} role="status">
          Procesando…
        </span>
      )}
      {project.status === "archived" && (
        <div className={cardStyles.archivedActions}>
          <button disabled={pending} onClick={() => act("restore")}>
            <Icon name="arrow-counterclockwise" className={menuStyles.icon} />
            Restaurar
          </button>
        </div>
      )}
    </article>
  );
}
