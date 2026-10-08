"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatAttachment } from "../../chat-contract";
import { useT } from "../../i18n/provider";
import { attachmentError, attachmentUrl, maxAttachments, validAttachment } from "../../chat-attachments.mjs";

export type PendingAttachment = {
  key: string;
  file: File;
  preview: string | null;
  progress: number;
  status: "uploading" | "ready" | "error" | "cancelled" | "removing";
  error: string;
  attachment?: ChatAttachment;
};

export function useChatAttachments(projectId: number | undefined) {
  const t = useT();
  const [items, setItems] = useState<PendingAttachment[]>([]);
  const [error, setError] = useState("");
  const current = useRef<PendingAttachment[]>([]);
  const requests = useRef(new Map<string, XMLHttpRequest>());
  const mounted = useRef(true);
  const deleting = useRef(new Set<string>());
  const scope = useRef(projectId);
  const update = (transform: (value: PendingAttachment[]) => PendingAttachment[]) => {
    current.current = transform(current.current);
    setItems(current.current);
  };
  const change = (key: string, values: Partial<PendingAttachment>) => {
    if (!mounted.current || !current.current.some((item) => item.key === key)) return;
    update((value) => value.map((item) => item.key === key ? { ...item, ...values } : item));
  };

  function upload(item: PendingAttachment) {
    if (!projectId) return;
    const xhr = new XMLHttpRequest();
    requests.current.set(item.key, xhr);
    change(item.key, { status: "uploading", progress: 0, error: "" });
    const query = new URLSearchParams({ projectId: String(projectId), name: item.file.name });
    xhr.open("POST", `/api/chat/attachments?${query}`);
    xhr.setRequestHeader("Content-Type", item.file.type || "application/octet-stream");
    xhr.timeout = 120000;
    const isCurrent = () => mounted.current && scope.current === projectId && requests.current.get(item.key) === xhr;
    xhr.upload.onprogress = (event) => {
      if (isCurrent() && event.lengthComputable) change(item.key, { progress: Math.min(99, Math.round(event.loaded / event.total * 100)) });
    };
    const fail = (message: string) => { if (isCurrent()) change(item.key, { status: "error", error: message }); };
    xhr.onload = () => {
      if (!isCurrent()) return;
      let result;
      try { result = JSON.parse(xhr.responseText); } catch { fail("El servidor devolvió una respuesta inválida."); return; }
      if (xhr.status !== 201 || !validAttachment(result?.attachment)) {
        fail(typeof result?.error === "string" ? result.error : "No se pudo subir el archivo. Inténtalo de nuevo.");
        return;
      }
      change(item.key, { status: "ready", progress: 100, attachment: result.attachment });
    };
    xhr.onerror = () => fail("No se pudo conectar. Reintenta la subida.");
    xhr.ontimeout = () => fail("La subida agotó el tiempo de espera. Reinténtala.");
    xhr.onabort = () => { if (isCurrent()) change(item.key, { status: "cancelled", error: "Subida cancelada." }); };
    xhr.onloadend = () => { if (requests.current.get(item.key) === xhr) requests.current.delete(item.key); };
    xhr.send(item.file);
  }

  function add(files: File[]) {
    setError("");
    if (!projectId) { setError("Selecciona un proyecto para adjuntar archivos."); return; }
    for (const file of files) {
      const validation = attachmentError(file);
      if (validation) { setError(`${file.name}: ${t(validation)}`); continue; }
      if (current.current.length >= maxAttachments) { setError(t("Puedes adjuntar hasta {0} archivos por mensaje.", maxAttachments)); break; }
      const item: PendingAttachment = {
        key: crypto.randomUUID(), file,
        preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
        progress: 0, status: "uploading", error: "",
      };
      update((value) => [...value, item]);
      upload(item);
    }
  }

  async function remove(key: string) {
    if (deleting.current.has(key)) return;
    const item = current.current.find((value) => value.key === key);
    if (!item) return;
    deleting.current.add(key);
    change(key, { status: "removing", error: "" });
    if (item.attachment && projectId) {
      try {
        const response = await fetch(attachmentUrl(item.attachment.id, projectId), { method: "DELETE" });
        if (!response.ok && response.status !== 404) throw new Error();
      } catch { change(key, { status: item.status, error: "No se pudo quitar el archivo. Inténtalo de nuevo." }); deleting.current.delete(key); return; }
    }
    requests.current.get(key)?.abort();
    if (item.preview) URL.revokeObjectURL(item.preview);
    if (mounted.current && scope.current === projectId) update((value) => value.filter((value) => value.key !== key));
    deleting.current.delete(key);
  }

  function detach(ids: string[]) {
    const removed = current.current.filter((item) => item.attachment && ids.includes(item.attachment.id));
    update((value) => value.filter((item) => !removed.includes(item)));
    return removed;
  }

  function release(items: PendingAttachment[]) {
    for (const item of items) if (item.preview) URL.revokeObjectURL(item.preview);
  }

  function restore(items: PendingAttachment[]) {
    if (!mounted.current || scope.current !== projectId) { release(items); return; }
    update((value) => [...items, ...value]);
  }

  function clearSent(ids: string[]) {
    update((value) => value.filter((item) => {
      if (!item.attachment || !ids.includes(item.attachment.id)) return true;
      if (item.preview) URL.revokeObjectURL(item.preview);
      return false;
    }));
  }

  useEffect(() => {
    mounted.current = true;
    if (scope.current !== projectId) {
      const discarded = current.current.length > 0;
      for (const request of requests.current.values()) request.abort();
      requests.current.clear();
      for (const item of current.current) if (item.preview) URL.revokeObjectURL(item.preview);
      current.current = [];
      setItems([]);
      setError(discarded ? "Se descartaron adjuntos al cambiar de proyecto." : "");
      scope.current = projectId;
    }
    return () => {
      mounted.current = false;
      for (const request of requests.current.values()) request.abort();
      for (const item of current.current) {
        if (item.preview) URL.revokeObjectURL(item.preview);
        if (item.attachment && projectId) {
          void fetch(attachmentUrl(item.attachment.id, projectId), { method: "DELETE", keepalive: true }).catch(() => {});
        }
      }
    };
  }, [projectId]);

  return { items, error, add, remove, clearSent, detach, release, restore,
    cancel: (key: string) => requests.current.get(key)?.abort(),
    retry: (key: string) => { const item = current.current.find((value) => value.key === key); if (item && (item.status === "error" || item.status === "cancelled")) upload(item); },
  };
}
