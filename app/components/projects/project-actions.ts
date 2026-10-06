import type { Project } from "../projects-data";
import type { ProjectAction } from "./project-actions-menu";

export type MutationAction = Exclude<ProjectAction, "delete">;

export async function mutateProject(project: Project, action: MutationAction): Promise<Project> {
  const duplicate = action === "duplicate";
  const response = await fetch(
    duplicate ? `/api/projects/${project.id}/duplicate` : `/api/projects/${project.id}`,
    duplicate
      ? { method: "POST" }
      : {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            estado: action === "archive"
              ? "archived"
              : project.progress === 100
                ? "completed"
                : "active",
          }),
        },
  );
  const result = (await response.json().catch(() => ({}))) as {
    project?: Project;
    error?: string;
  };
  if (response.status !== (duplicate ? 201 : 200)) {
    throw new Error(result.error || "No se pudo actualizar el proyecto.");
  }
  if (!result.project) throw new Error("La respuesta no incluye el proyecto actualizado.");
  return result.project;
}

export async function deleteProject(project: Project): Promise<void> {
  const response = await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
  if (response.status === 204) return;
  const result = (await response.json().catch(() => ({}))) as { error?: string };
  throw new Error(result.error || "No se pudo eliminar el proyecto.");
}
