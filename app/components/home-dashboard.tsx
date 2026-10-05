"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "./app-shell";
import styles from "./home-dashboard.module.css";
import { ProjectCard } from "./home/project-card";
import { TodayPlan } from "./home/today-plan";
import { Icon } from "./home/icon-helper";
import { EmptyState } from "./empty-state";
import { CreateProjectModal } from "./projects/create-project-modal";
import { projects, tasks } from "./home/home-data";

export function HomeDashboard() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [completed, setCompleted] = useState(() => tasks.map(() => false));
  const hasProjects = projects.length > 0;
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
          <button className={styles.primary} onClick={() => setCreateOpen(true)}>
            <Icon name="plus" />
            Nuevo proyecto
          </button>
        </div>
        {hasProjects ? (
          <>
            <section
              aria-labelledby="continue-heading"
              className={styles.continue}
            >
              <div className={styles.sectionHeader}>
                <h2 id="continue-heading">Continuar trabajando</h2>
                <Link
                  href="/proyectos"
                  className={styles.textButton}
                  aria-label="Ver todos los proyectos"
                >
                  Ver todos
                  <Icon
                    name="chevron-right"
                    className={styles.textButtonIcon}
                  />
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
          </>
        ) : (
          <EmptyState
            icon="folder-plus"
            title="Aún no tienes proyectos"
            description="Crea tu primer proyecto para organizar tareas, conversaciones y contexto en un solo lugar."
            onCreate={() => setCreateOpen(true)}
          />
        )}
        <span className="sr-only" role="status">
          {search
            ? visibleProjects.length || visibleTasks.length
              ? `Resultados para ${query}`
              : `Sin resultados para ${query}`
            : ""}
        </span>
      </main>
      <CreateProjectModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => router.push("/proyectos")}
      />
    </AppShell>
  );
}
