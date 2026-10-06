export function getContextPanelLoadState(projectsLoading, projectsError, projectId, contextLoadState) {
  if (projectsLoading) return "loading";
  if (projectsError) return "error";
  if (!projectId) return "no-project";
  return contextLoadState;
}
