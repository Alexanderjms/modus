"use client";

import { useState, type CSSProperties } from "react";
import { AppShell } from "./app-shell";
import styles from "./home-dashboard.module.css";

const projects = [
  {
    name: "Observatorio Regional",
    description:
      "Plataforma regional para gestión de investigación científica.",
    icon: "globe",
    color: "#007AFF",
    progress: 35,
    fill: 176,
    tasks: "14 / 40 tareas",
    doing: "3 en progreso",
    activity: "hace 12 min",
  },
  {
    name: "Portfolio personal",
    description: "Sitio personal y presentación de proyectos.",
    icon: "person",
    color: "#AF52DE",
    progress: 68,
    fill: 341,
    tasks: "17 / 25 tareas",
    doing: "2 en progreso",
    activity: "ayer",
  },
  {
    name: "Lista de Compras",
    description: "Aplicación móvil para crear listas de compras.",
    icon: "cart",
    color: "#FF9500",
    progress: 22,
    fill: 110,
    tasks: "5 / 23 tareas",
    doing: "1 en progreso",
    activity: "hace 3 días",
  },
];

const tasks = [
  {
    text: "Validar actualización de organizaciones",
    project: projects[0],
  },
  {
    text: "Revisar responsive móvil",
    project: projects[1],
  },
  {
    text: "Implementar búsqueda de productos",
    project: projects[2],
  },
];

function Icon({ name, className = "" }: { name: string; className?: string }) {
  return <i aria-hidden="true" className={`bi bi-${name} ${className}`} />;
}

const unavailable = "Esta función aún no está integrada.";

export function HomeDashboard() {
  const [query, setQuery] = useState("");
  const [completed, setCompleted] = useState([true, false, false]);
  const search = query.trim().toLocaleLowerCase("es");
  const completedCount = completed.filter(Boolean).length;
  const visibleProjects = projects.filter((project) =>
    `${project.name} ${project.description}`
      .toLocaleLowerCase("es")
      .includes(search),
  );
  const visibleTasks = tasks
    .map((task, index) => ({ task, index }))
    .filter(({ task }) =>
      `${task.text} ${task.project.name}`
        .toLocaleLowerCase("es")
        .includes(search),
    );

  return (
    <AppShell query={query} onSearch={setQuery}>
      <main className={styles.main}>
        <div className={styles.greeting}>
          <div>
            <h1>Buenos días, Alex</h1>
            <p>Esto es lo que tienes para hoy.</p>
          </div>
          <button className={styles.primary} title={unavailable} disabled>
            <Icon name="plus" />
            Nuevo proyecto
          </button>
        </div>
        <section aria-labelledby="continue-heading" className={styles.continue}>
          <div className={styles.sectionHeader}>
            <h2 id="continue-heading">Continuar trabajando</h2>
            <button
              className={styles.textButton}
              aria-label="Ver todos los proyectos"
              title={unavailable}
              disabled
            >
              Ver todos
              <Icon name="chevron-right" className={styles.textButtonIcon} />
            </button>
          </div>
          <div className={styles.projects}>
            {visibleProjects.length ? (
              visibleProjects.map((project, index) => (
                <article
                  key={project.name}
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
              ))
            ) : (
              <p className={styles.empty}>
                No hay proyectos que coincidan con la búsqueda.
              </p>
            )}
          </div>
        </section>
        <section
          id="plan"
          aria-labelledby="plan-heading"
          className={styles.plan}
        >
          <header className={styles.planHeader}>
            <Icon name="stars" className={styles.planIcon} />
            <h2 id="plan-heading">Plan para hoy</h2>
            <span className={styles.suggested}>Sugerido por Sona</span>
            <span className={styles.planMeta}>
              {tasks.length - completedCount}{" "}
              {tasks.length - completedCount === 1 ? "pendiente" : "pendientes"}
            </span>
          </header>
          <div className={styles.planBody}>
            {visibleTasks.length ? (
              visibleTasks.map(({ task, index }) => (
                <div key={task.text} className={styles.task}>
                  <label className={styles.taskLabel}>
                    <input
                      type="checkbox"
                      checked={completed[index]}
                      onChange={(event) =>
                        setCompleted((current) =>
                          current.map((value, position) =>
                            position === index ? event.target.checked : value,
                          ),
                        )
                      }
                    />
                    <span
                      className={completed[index] ? styles.completedText : ""}
                    >
                      {task.text}
                    </span>
                  </label>
                  <span className={styles.projectChip}>
                    <b style={{ background: task.project.color }} />
                    {task.project.name}
                  </span>
                  {completed[index] && (
                    <span className={styles.done}>
                      <Icon name="check" />
                      Completada
                    </span>
                  )}
                </div>
              ))
            ) : (
              <p className={styles.empty}>
                No hay tareas que coincidan con la búsqueda.
              </p>
            )}
          </div>
        </section>
        <span className="sr-only" role="status">
          {search
            ? visibleProjects.length || visibleTasks.length
              ? `Resultados para ${query}`
              : `Sin resultados para ${query}`
            : ""}
        </span>
      </main>
    </AppShell>
  );
}
