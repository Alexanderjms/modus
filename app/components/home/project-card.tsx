import { type CSSProperties } from "react";
import styles from "./project-card.module.css";
import { Icon } from "./icon-helper";
import { unavailable, type Project } from "./home-data";

export function ProjectCard({
  project,
  index,
  search,
}: {
  project: Project;
  index: number;
  search: string;
}) {
  return (
    <article
      className={`${styles.card} ${index === 0 && !search ? styles.highlighted : ""}`}
    >
      <div className={styles.cardTop}>
        <span className={styles.projectIcon}>
          <Icon name={project.icon} />
        </span>
        <h3>{project.name}</h3>
        <button
          className={styles.more}
          aria-label={`Más opciones de ${project.name}`}
          title={unavailable}
          disabled
        >
          <Icon name="three-dots" />
        </button>
      </div>
      <p className={styles.description}>{project.description}</p>
      <div className={styles.progressRow}>
        <div
          className={styles.progress}
          role="progressbar"
          aria-label={`Progreso de ${project.name}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={project.progress}
        >
          <span
            style={
              {
                "--fill": `${project.fill}px`,
                "--progress": `${project.progress}%`,
              } as CSSProperties
            }
          />
        </div>
        <span>{project.progress}%</span>
      </div>
      <div className={styles.meta}>
        <span>{project.tasks}</span>
        <span>·</span>
        <span className={styles.doing}>
          <b />
          {project.doing}
        </span>
        <span className={styles.activity}>{project.activity}</span>
      </div>
    </article>
  );
}
