"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { projectTasksLabel, type Project } from "../projects-data";
import cardStyles from "./project-card.module.css";
import menuStyles from "./menu.module.css";
import { Icon } from "../ui-icon";
import { ProjectActionsMenu, type ProjectAction } from "./project-actions-menu";
import { useT } from "../../i18n/provider";

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
  const t = useT();
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
                <Icon name="check" className={menuStyles.icon} /> {t("Completado")}
              </>
            ) : (
              t("Archivado")
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
          aria-label={t("Progreso de {0}", project.name)}
        />
        <strong>{project.progress}%</strong>
      </div>
      <div className={cardStyles.meta}>
        <span>{projectTasksLabel(project.tasks, t)}</span>
      </div>
      <div className={cardStyles.status}>
        {project.status === "active" ? (
          <>
            <span className={cardStyles.doing}>
              <b />
              {project.doing} {t("en progreso")}
            </span>
            <span>{t("Actualizado")} {t(project.activity)}</span>
          </>
        ) : (
          <span>
            {project.status === "completed" ? (
              <>
                <Icon name="check" className={menuStyles.icon} /> {t("Completado")}
              </>
            ) : (
              t("Archivado")
            )}{" "}
            {t(project.activity)}
          </span>
        )}
      </div>
      {pending && (
        <span className={cardStyles.meta} role="status">
          {t("Procesando…")}
        </span>
      )}
      {project.status === "archived" && (
        <div className={cardStyles.archivedActions}>
          <button disabled={pending} onClick={() => act("restore")}>
            <Icon name="arrow-counterclockwise" className={menuStyles.icon} />
            {t("Restaurar")}
          </button>
        </div>
      )}
    </article>
  );
}
