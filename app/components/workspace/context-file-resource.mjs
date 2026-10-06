const contextFileResourcePattern = /^\/api\/projects\/([1-9]\d*)\/context\/files\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

export function isProjectContextFileUrl(url, projectId) {
  if (typeof url !== "string") return false;
  const match = contextFileResourcePattern.exec(url);
  return Boolean(match) && (projectId === undefined || match[1] === String(projectId));
}
