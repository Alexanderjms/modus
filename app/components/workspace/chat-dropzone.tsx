"use client";

import { useRef, useState, type DragEvent, type ReactNode } from "react";
import { attachmentAccept } from "../../chat-attachments.mjs";
import styles from "./chat-attachments.module.css";

export function ChatDropzone({ disabled, onFiles, children }: { disabled: boolean; onFiles: (files: File[]) => void; children: (openPicker: () => void) => ReactNode }) {
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);
  const input = useRef<HTMLInputElement>(null);
  const handleFiles = (files: FileList | null) => { if (!disabled && files?.length) onFiles(Array.from(files)); };
  return <div className={`${styles.dropzone} ${dragging && !disabled ? styles.dropActive : ""}`}
    onDragEnter={(event: DragEvent) => { if (disabled || !Array.from(event.dataTransfer.types).includes("Files")) return; event.preventDefault(); depth.current++; setDragging(true); }}
    onDragOver={(event) => { if (Array.from(event.dataTransfer.types).includes("Files")) event.preventDefault(); }}
    onDragLeave={(event) => { event.preventDefault(); depth.current = Math.max(0, depth.current - 1); if (!depth.current) setDragging(false); }}
    onDrop={(event) => { if (!Array.from(event.dataTransfer.types).includes("Files")) return; event.preventDefault(); depth.current = 0; setDragging(false); if (!disabled) handleFiles(event.dataTransfer.files); }}>
    {children(() => { if (!disabled) input.current?.click(); })}
    <input ref={input} className={styles.fileInput} type="file" aria-label="Seleccionar archivos adjuntos" tabIndex={-1} accept={attachmentAccept} multiple disabled={disabled} onChange={(event) => { handleFiles(event.currentTarget.files); event.currentTarget.value = ""; }} />
  </div>;
}
