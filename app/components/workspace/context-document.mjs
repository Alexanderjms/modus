import { isProjectContextFileUrl } from "./context-file-resource.mjs";

export function isContextFile(resource) {
  return isProjectContextFileUrl(resource.url);
}

export function isValidContextDocument(document) {
  if (
    document.context.length > 5000 ||
    document.rules.length > 50 ||
    !document.rules.every(
      (rule) => rule.trim().length > 0 && rule.length <= 500,
    ) ||
    document.resources.length > 50 ||
    !document.resources.every((resource) => {
      if (
        !resource.title.trim() ||
        resource.title.length > 200 ||
        resource.url.length > 2048
      )
        return false;
      if (isContextFile(resource)) return true;
      try {
        const url = new URL(resource.url.trim());
        return url.protocol === "http:" || url.protocol === "https:";
      } catch {
        return false;
      }
    })
  )
    return false;

  return new TextEncoder().encode(JSON.stringify(document)).byteLength <= 32768;
}

export function isContextDocument(value) {
  if (!value || typeof value !== "object") return false;
  const document = value;
  return (
    typeof document.context === "string" &&
    Array.isArray(document.rules) &&
    document.rules.every((rule) => typeof rule === "string") &&
    Array.isArray(document.resources) &&
    document.resources.every(
      (resource) =>
        resource !== null &&
        typeof resource === "object" &&
        typeof resource.title === "string" &&
        typeof resource.url === "string",
    )
  );
}
