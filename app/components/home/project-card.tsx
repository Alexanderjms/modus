"use client";

import { type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "./project-card.module.css";
import { Icon } from "../ui-icon";
import { projectTasksLabel, type Project } from "../projects-data";
import { ProjectActionsMenu, type ProjectAction } from "../projects/project-actions-menu";
import { useT } from "../../i18n/provider";

export function ProjectCard({
  project,
  index,
  search,
  onAction,
  onEdit,
  pending,
}: {
  project: Project;
  index: number;
  search: string;
  onAction: (project: Project, action: ProjectAction) => void | Promise<void>;
  onEdit: (project: Project) => void;
  pending: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const href = `/workspace?project=${encodeURIComponent(project.name)}`;
  return (
    <article
      className={`${styles.card} ${index === 0 && !search ? styles.highlighted : ""}`}
      aria-busy={pending || undefined}
      onClick={(event) => {
        if (!(event.target as Element).closest("a, button, details")) router.push(href);
      }}
    >
      <div className={styles.cardTop}>
        <span className={styles.projectIcon}>
          <Icon name={project.icon} />
        </span>
        <h3>
          <Link href={href}>
            {project.name}
          </Link>
        </h3>
        <ProjectActionsMenu
          project={project}
          onAction={onAction}
          onEdit={onEdit}
          pending={pending}
        />
      </div>
      <p className={styles.description}>{project.description}</p>
      <div className={styles.progressRow}>
        <div
          className={styles.progress}
          role="progressbar"
          aria-label={t("Progreso de {0}", project.name)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={project.progress}
        >
          <span
            style={
              {
                "--fill": `${project.progress}%`,
                "--progress": `${project.progress}%`,
              } as CSSProperties
            }
          />
        </div>
        <span>{project.progress}%</span>
      </div>
      <div className={styles.meta}>
        <span>{projectTasksLabel(project.tasks, t)}</span>
        <span>·</span>
        <span className={styles.doing}>
          <b />
          {project.doing} {t("en progreso")}
        </span>
        <span className={styles.activity}>{t(project.activity)}</span>
      </div>
      {pending && <span className="sr-only" role="status">{t("Procesando")} {project.name}…</span>}
    </article>
  );
}
