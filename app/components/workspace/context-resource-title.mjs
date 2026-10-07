export function getResourceTitle(parsedUrl, fallback) {
  const pathParts = parsedUrl.pathname.split("/").filter(Boolean);
  let title = pathParts[pathParts.length - 1] || parsedUrl.hostname.replace(/^www\./i, "");
  try {
    title = decodeURIComponent(title);
  } catch {
    title = pathParts[pathParts.length - 1] || parsedUrl.hostname.replace(/^www\./i, "");
  }
  title = title.replace(/[-_]+/g, " ").trim() || fallback;
  return title.slice(0, 200);
}
