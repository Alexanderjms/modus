export const maxAttachmentBytes = 10 * 1024 * 1024;
export const maxAttachments = 5;
export const attachmentTypes = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp",
  pdf: "application/pdf", txt: "text/plain", md: "text/markdown", csv: "text/csv", json: "application/json",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};
export const attachmentAccept = Object.keys(attachmentTypes).map((extension) => `.${extension}`).join(",");

export function attachmentError(file) {
  if (!file || typeof file.name !== "string" || !file.name.trim() || file.name.length > 200 || /[\\/\x00-\x1f\x7f]/.test(file.name)) return "El nombre del archivo no es válido.";
  const extension = file.name.split(".").pop().toLowerCase();
  const type = Object.hasOwn(attachmentTypes, extension) ? attachmentTypes[extension] : null;
  const alternateType = (extension === "md" && file.type === "text/plain") || (extension === "csv" && file.type === "application/vnd.ms-excel");
  if (!type || (file.type && file.type !== "application/octet-stream" && file.type !== type && !alternateType)) return "Tipo no permitido. Usa PNG, JPG, WebP, PDF, TXT, MD, CSV, JSON, XLSX o DOCX.";
  if (!Number.isSafeInteger(file.size) || file.size < 1) return "El archivo está vacío.";
  if (file.size > maxAttachmentBytes) return "El archivo supera el límite de 10 MiB.";
  return "";
}

export function validAttachment(value) {
  return !!value && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).length === 4 && typeof value.id === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.id) &&
    typeof value.name === "string" && typeof value.type === "string" &&
    value.type === attachmentTypes[value.name.split(".").pop().toLowerCase()] && !attachmentError(value);
}

export function attachmentUrl(id, projectId) {
  return `/api/chat/attachments/${encodeURIComponent(id)}?projectId=${projectId}`;
}
