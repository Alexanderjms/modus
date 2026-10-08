"use client";

import shared from "../workspace.module.css";
import { useT } from "../../i18n/provider";

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
  const t = useT();
  if (loading) return null;
  if (projectsError || tasksError) {
    return (
      <p role="alert" className={shared.notice}>
        {projectsError || tasksError}{" "}
        <button type="button" onClick={onRetry}>
          {t("Reintentar")}
        </button>
      </p>
    );
  }
  if (hasProject) return null;
  return (
    <p role="status" className={shared.notice}>{t("Crea un proyecto o selecciona uno para empezar.")}</p>
  );
}
