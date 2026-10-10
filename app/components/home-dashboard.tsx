"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "./app-shell";
import styles from "./home-dashboard.module.css";
import { Skeleton } from "./skeleton";
import { ProjectCard } from "./home/project-card";
import { Icon } from "./ui-icon";
import { EmptyState } from "./empty-state";
import { CreateProjectModal } from "./projects/create-project-modal";
import { DeleteProjectModal } from "./projects/delete-project-modal";
import { type ProjectAction } from "./projects/project-actions-menu";
import { deleteProject, mutateProject } from "./projects/project-actions";
import { WeeklyActivity } from "./home/weekly-activity";
import { initialProjects, sortByLastOpened, type Project } from "./projects-data";
import { useT } from "../i18n/provider";
import { useUserName } from "./user-context";

type MutationAction = Exclude<ProjectAction, "delete">;

export function HomeDashboard() {
  const t = useT();
  const userName = useUserName();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [deletingProject, setDeletingProject] = useState<Project | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [projects, setProjects] = useState(initialProjects);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reload, setReload] = useState(0);
  const [pendingIds, setPendingIds] = useState<Set<number>>(() => new Set());
  const [actionError, setActionError] = useState<{
    project: Project;
    action: MutationAction;
    message: string;
  } | null>(null);
  const [activityRefresh, setActivityRefresh] = useState(0);
  const mutationVersion = useRef(0);
  const pendingIdsRef = useRef(new Set<number>());

  useEffect(() => {
    const controller = new AbortController();
    const version = mutationVersion.current;

    async function loadProjects() {
      setLoading(true);
      setLoadError("");
      try {
        const response = await fetch("/api/projects", { signal: controller.signal });
        const result = (await response.json().catch(() => ({}))) as {
          projects?: Project[];
          error?: string;
        };
        if (!response.ok) throw new Error(result.error || t("No se pudieron cargar los proyectos."));
        if (!Array.isArray(result.projects)) throw new Error(t("La respuesta no incluye los proyectos."));
        if (mutationVersion.current === version) setProjects(result.projects);
        else setReload((current) => current + 1);
      } catch (reason) {
        if (!controller.signal.aborted && mutationVersion.current === version) {
          setLoadError(
            reason instanceof Error ? reason.message : t("No se pudieron cargar los proyectos."),
          );
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadProjects();
    return () => controller.abort();
  }, [reload]);

  function action(project: Project, action: ProjectAction) {
    if (pendingIdsRef.current.has(project.id)) return;
    if (action === "delete") {
      setActionError(null);
      setDeleteError("");
      setDeletingProject(project);
      return;
    }
    void executeAction(project, action);
  }

  async function executeAction(project: Project, action: MutationAction) {
    if (pendingIdsRef.current.has(project.id)) return;
    pendingIdsRef.current.add(project.id);
    setPendingIds(new Set(pendingIdsRef.current));
    setActionError(null);
    try {
      const updatedProject = await mutateProject(project, action);
      mutationVersion.current++;
      setProjects((current) => action === "duplicate"
        ? [updatedProject, ...current]
        : current.map((item) => item.id === project.id ? updatedProject : item));
      setLoadError("");
    } catch (reason) {
      setActionError({
        project,
        action,
        message: reason instanceof Error ? reason.message : t("No se pudo actualizar el proyecto."),
      });
    } finally {
      pendingIdsRef.current.delete(project.id);
      setPendingIds(new Set(pendingIdsRef.current));
    }
  }

  async function executeDelete(project: Project) {
    if (pendingIdsRef.current.has(project.id)) return;
    pendingIdsRef.current.add(project.id);
    setPendingIds(new Set(pendingIdsRef.current));
    setDeleteError("");
    try {
      await deleteProject(project);
      mutationVersion.current++;
      setProjects((current) => current.filter((item) => item.id !== project.id));
      setLoadError("");
      setDeletingProject(null);
      setActivityRefresh((current) => current + 1);
    } catch (reason) {
      setDeleteError(reason instanceof Error ? reason.message : t("No se pudo eliminar el proyecto."));
    } finally {
      pendingIdsRef.current.delete(project.id);
      setPendingIds(new Set(pendingIdsRef.current));
    }
  }

  function closeDeleteModal() {
    if (deletingProject && pendingIdsRef.current.has(deletingProject.id)) return;
    setDeletingProject(null);
    setDeleteError("");
  }

  const search = query.trim().toLocaleLowerCase("es");
  const visibleProjects = sortByLastOpened(projects).filter((project) =>
    `${project.name} ${project.description}`
      .toLocaleLowerCase("es")
      .includes(search),
  );

  return (
    <AppShell query={query} onSearch={setQuery}>
      <main className={styles.main}>
        <div className={styles.greeting}>
          <div>
            <h1>{userName ? t("Hola, {0}", userName) : t("Hola")}</h1>
            <p>{t("Esto es lo que tienes para hoy.")}</p>
          </div>
          {!loading && !loadError && projects.length === 0 && (
            <button className={styles.primary} onClick={() => setCreateOpen(true)}>
              <Icon name="plus" />
              {t("Nuevo proyecto")}
            </button>
          )}
        </div>
        {loading || projects.length > 0 ? (
          <>
            {loadError && projects.length > 0 && (
              <p className={styles.empty} role="alert">
                {t(loadError)}{" "}
                <button
                  className={styles.textButton}
                  type="button"
                  onClick={() => setReload((current) => current + 1)}
                >
                  {t("Reintentar")}
                </button>
              </p>
            )}
            {actionError && (
              <p className={styles.empty} role="alert">
                {t(actionError.message)}{" "}
                <button
                  className={styles.textButton}
                  type="button"
                  onClick={() => executeAction(actionError.project, actionError.action)}
                >
                  {t("Reintentar")}
                </button>
              </p>
            )}
            <section
              aria-labelledby="continue-heading"
              className={styles.continue}
            >
              <div className={styles.sectionHeader}>
                <h2 id="continue-heading">{t("Continuar trabajando")}</h2>
                <Link
                  href="/proyectos"
                  className={styles.textButton}
                  aria-label={t("Ver todos los proyectos")}
                >
                  {t("Ver todos")}
                  <Icon
                    name="chevron-right"
                    className={styles.textButtonIcon}
                  />
                </Link>
              </div>
              <div
                className={styles.projects}
                role={loading ? "status" : undefined}
                aria-label={loading ? t("Cargando proyectos") : undefined}
              >
                {loading ? (
                  [0, 1, 2].map((key) => (
                    <Skeleton key={key} variant="rounded" width="100%" height={130} />
                  ))
                ) : visibleProjects.length ? (
                  visibleProjects.map((project, index) => (
                    <ProjectCard
                      key={project.id}
                      project={project}
                      index={index}
                      search={search}
                      onAction={action}
                      onEdit={setEditingProject}
                      pending={pendingIds.has(project.id)}
                    />
                  ))
                ) : (
                  <p className={styles.empty}>
                    {t("No hay proyectos que coincidan con la búsqueda.")}
                  </p>
                )}
              </div>
            </section>
          </>
        ) : loadError ? (
          <p className={styles.empty} role="alert">
            {t(loadError)}{" "}
            <button
              className={styles.textButton}
              type="button"
              onClick={() => setReload((current) => current + 1)}
            >
              {t("Reintentar")}
            </button>
          </p>
        ) : (
          <EmptyState
            icon="folder-plus"
            title={t("Aún no tienes proyectos")}
            description={t("Crea tu primer proyecto para organizar tareas, conversaciones y contexto en un solo lugar.")}
            onCreate={() => setCreateOpen(true)}
          />
        )}
        <WeeklyActivity refreshKey={activityRefresh} />
        <span className="sr-only" role="status">
          {!loading && !loadError && search
            ? visibleProjects.length
              ? t("Resultados para {0}", query)
              : t("Sin resultados para {0}", query)
            : ""}
        </span>
      </main>
      <CreateProjectModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(project) => {
          mutationVersion.current++;
          setProjects((current) => [
            project,
            ...current.filter((item) => item.id !== project.id),
          ]);
          setLoadError("");
          router.push("/proyectos");
        }}
      />
      <CreateProjectModal
        open={editingProject !== null}
        project={editingProject ?? undefined}
        onClose={() => setEditingProject(null)}
        onUpdated={(project) => {
          mutationVersion.current++;
          setProjects((current) => current.map((item) => item.id === project.id ? project : item));
          setLoadError("");
        }}
      />
      <DeleteProjectModal
        project={deletingProject}
        error={deleteError}
        pending={deletingProject !== null && pendingIds.has(deletingProject.id)}
        onClose={closeDeleteModal}
        onConfirm={() => {
          if (deletingProject) void executeDelete(deletingProject);
        }}
      />
    </AppShell>
  );
}
