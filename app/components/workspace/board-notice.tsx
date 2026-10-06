"use client";

import shared from "../workspace.module.css";

export function BoardNotice({
  loading,
  projectsError,
  tasksError,
  hasProject,
  onRetry,
}: {
  loading: boolean;
  projectsError: string;
  tasksError: string;
  hasProject: boolean;
  onRetry: () => void;
}) {
  if (loading) return null;
  if (projectsError || tasksError) {
    return (
      <p role="alert" className={shared.notice}>
        {projectsError || tasksError}{" "}
        <button type="button" onClick={onRetry}>
          Reintentar
        </button>
      </p>
    );
  }
  if (hasProject) return null;
  return (
    <p role="status" className={shared.notice}>Crea un proyecto o selecciona uno para empezar.</p>
  );
}
