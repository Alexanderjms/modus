const kinds: Record<string, { icon: string; color: string }> = {
  xlsx: { icon: "bi-filetype-xlsx", color: "#1d8a4f" },
  csv: { icon: "bi-filetype-csv", color: "#1d8a4f" },
  docx: { icon: "bi-filetype-docx", color: "#2f6fd6" },
  pdf: { icon: "bi-filetype-pdf", color: "#e5484d" },
  json: { icon: "bi-filetype-json", color: "#c58a00" },
  md: { icon: "bi-filetype-md", color: "var(--muted)" },
  txt: { icon: "bi-filetype-txt", color: "var(--muted)" },
};

export function FileTypeIcon({ name, size = 20 }: { name: string; size?: number }) {
  const kind = kinds[name.split(".").pop()?.toLowerCase() ?? ""];
  return (
    <i
      aria-hidden="true"
      className={`bi ${kind?.icon ?? "bi-file-earmark"}`}
      style={{ fontSize: size, lineHeight: 1, ...(kind ? { color: kind.color } : {}) }}
    />
  );
}
