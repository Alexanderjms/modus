"use client";

import { useState } from "react";
import Link from "next/link";
import { AppShell } from "./app-shell";
import styles from "./home-dashboard.module.css";
import { ProjectCard } from "./home/project-card";
import { TodayPlan } from "./home/today-plan";
import { Icon } from "./home/icon-helper";
import { projects, tasks, unavailable } from "./home/home-data";

export function HomeDashboard() {
  const [query, setQuery] = useState("");
  const [completed, setCompleted] = useState([true, false, false]);
  const search = query.trim().toLocaleLowerCase("es");
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
            <Link
              href="/proyectos"
              className={styles.textButton}
              aria-label="Ver todos los proyectos"
            >
              Ver todos
              <Icon name="chevron-right" className={styles.textButtonIcon} />
            </Link>
          </div>
          <div className={styles.projects}>
            {visibleProjects.length ? (
              visibleProjects.map((project, index) => (
                <ProjectCard
                  key={project.name}
                  project={project}
                  index={index}
                  search={search}
                />
              ))
            ) : (
              <p className={styles.empty}>
                No hay proyectos que coincidan con la búsqueda.
              </p>
            )}
          </div>
        </section>
        <TodayPlan
          tasks={tasks}
          visibleTasks={visibleTasks}
          completed={completed}
          setCompleted={setCompleted}
          search={search}
          query={query}
        />
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
