"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Modal } from "./modal";
import { Skeleton } from "../skeleton";
import type { TavilyStatus } from "../../../db/local/tavily.cjs";
import styles from "./profile-modals.module.css";

async function readStatus(response: Response) {
  const result: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = result && typeof result === "object" && "error" in result && typeof result.error === "string" ? result.error : "No se pudo gestionar la clave de Tavily.";
    throw new Error(message);
  }
  const status = result && typeof result === "object" && "status" in result ? result.status as Partial<TavilyStatus> : null;
  if (!status || typeof status.configured !== "boolean" || typeof status.storageAvailable !== "boolean" ||
    !(status.source === null || status.source === "saved" || status.source === "environment") ||
    status.configured !== (status.source !== null) ||
    !(status.updatedAt === null || (typeof status.updatedAt === "string" && Number.isFinite(Date.parse(status.updatedAt))))) throw new Error("El estado de Tavily no es válido.");
  return status as TavilyStatus;
}

export function TavilyModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [status, setStatus] = useState<TavilyStatus | null>(null);
  const [key, setKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState<"save" | "validate" | "remove" | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reload, setReload] = useState(0);
  const busy = useRef(false);
  const actionController = useRef<AbortController | null>(null);
  const id = useId();
  const [confirmRemove, setConfirmRemove] = useState(false);
  const confirmButton = useRef<HTMLButtonElement>(null);

  useEffect(() => { if (confirmRemove) confirmButton.current?.focus(); }, [confirmRemove]);

  useEffect(() => {
    setKey("");
    setError("");
    setNotice("");
    setConfirmRemove(false);
    setStatus(null);
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    fetch("/api/tavily", { cache: "no-store", signal: controller.signal })
      .then(readStatus)
      .then((next) => { if (!controller.signal.aborted) setStatus(next); })
      .catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "No se pudo cargar Tavily."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [open, reload]);

  useEffect(() => () => actionController.current?.abort(), []);

  async function act(action: "save" | "validate" | "remove") {
    if (busy.current || loading || !status) return;
    if (action === "save" && (!key.trim() || !status.storageAvailable)) return;
    if (action === "validate" && !key.trim() && !status.configured) return;
    if (action === "remove" && status.source !== "saved") return;
    busy.current = true;
    setPending(action);
    setError("");
    setNotice("");
    const controller = new AbortController();
    actionController.current = controller;
    try {
      const next = await readStatus(await fetch("/api/tavily", {
        method: action === "save" ? "PUT" : action === "validate" ? "POST" : "DELETE",
        ...(action === "save" || (action === "validate" && key.trim()) ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ apiKey: key }) } : {}),
        cache: "no-store",
        signal: controller.signal,
      }));
      if (controller.signal.aborted) return;
      setStatus(next);
      if (action !== "validate") setKey("");
      setConfirmRemove(false);
      setNotice(action === "remove" ? next.source === "environment" ? "Clave del perfil eliminada. La búsqueda web seguirá usando la clave configurada en el servidor." : "API key eliminada. La búsqueda web de Tavily ya no está configurada." : action === "save" ? "API key validada y guardada de forma segura." : key.trim() ? "La nueva API key es válida. Pulsa Guardar para utilizarla." : "La API key de Tavily es válida.");
    } catch (reason) {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "No se pudo gestionar Tavily.");
    } finally {
      busy.current = false;
      if (actionController.current === controller) actionController.current = null;
      if (!controller.signal.aborted) setPending(null);
    }
  }

  return (
    <Modal open={open} onClose={() => { if (!busy.current) { setKey(""); onClose(); } }} title="Tavily · Búsqueda web" pending={pending !== null}
      submitLabel={pending === "save" ? "Validando y guardando…" : status?.source === "saved" ? "Actualizar API key" : "Guardar API key"}
      submitDisabled={loading || !status?.storageAvailable || !key.trim() || confirmRemove}
      onSubmit={(event) => { event.preventDefault(); void act("save"); }}>
      <div className={`${styles.form} ${styles.tavilyForm}`}>
        <div className={styles.providerHeader}>
          <span className={styles.providerName}>Tavily</span>
          <span className={`${styles.providerBadge} ${status?.configured ? styles.active : ""}`}>
            {loading ? <Skeleton variant="text" width={70} height={9} /> : !status ? "No disponible" : status.source === "saved" ? "Clave guardada" : status.source === "environment" ? "Clave del servidor" : "Sin configurar"}
          </span>
        </div>
        {status?.source === "saved" && status.updatedAt && <p className={styles.keyHelp}>Guardada el <time dateTime={status.updatedAt}>{new Date(status.updatedAt).toLocaleString()}</time></p>}
        <p className={styles.securityNote}>Permite al chat buscar información en la web. La clave guardada nunca se muestra; introduce una nueva para reemplazarla. Guardar valida la clave antes de sustituir la actual.</p>
        <div className={styles.field}>
          <label htmlFor={`${id}-key`} className={styles.label}>API key de Tavily</label>
          <input id={`${id}-key`} aria-describedby={`${id}-key-help${error && status ? ` ${id}-error` : ""}`} className={styles.input} type="password" autoComplete="off" spellCheck={false} maxLength={4096}
            value={key} disabled={loading || pending !== null || !status?.storageAvailable || confirmRemove} onChange={(event) => { setKey(event.target.value); setError(""); setNotice(""); }}
            placeholder={status?.source === "saved" ? "Introduce una nueva clave para reemplazar la guardada" : "Introduce tu API key"} />
          <span id={`${id}-key-help`} className={styles.keyHelp}>{status?.source === "saved" ? "La clave actual se conserva hasta validar y guardar el reemplazo." : "La clave solo se envía para validación y almacenamiento seguro."}</span>
        </div>
        <div className={styles.connectionActions}>
          <button type="button" className={styles.retryButton} disabled={loading || pending !== null || !status || (!key.trim() && (!status.configured || (status.source === "saved" && !status.storageAvailable))) || confirmRemove} onClick={() => void act("validate")}>{pending === "validate" ? "Validando…" : key.trim() ? "Validar API key" : status?.source === "environment" ? "Validar clave del servidor" : "Validar clave guardada"}</button>
          {status?.source === "saved" && !confirmRemove && <button type="button" className={styles.removeButton} disabled={loading || pending !== null} onClick={() => { setConfirmRemove(true); setError(""); setNotice(""); }}>Quitar API key</button>}
        </div>
        {status?.source === "environment" && <p className={styles.keyHelp}>Al guardar una nueva API key, se utilizará en lugar de la actual.</p>}
        {status && !status.storageAvailable && <p className={styles.warningMessage}>El almacenamiento seguro requiere Windows DPAPI. No puedes guardar, reemplazar ni utilizar claves cifradas desde este sistema.{status.source === "environment" && " Puedes validar la clave definida en el servidor."}</p>}
        {key.trim() && <p className={styles.keyHelp}>Validar comprueba la nueva clave sin guardarla ni reemplazar la actual.</p>}
        {confirmRemove && <div className={styles.removeConfirm} role="group" aria-label="Confirmar eliminación de API key"><span>¿Quitar la clave guardada? Si existe una clave del servidor, seguirá utilizándose.</span><button ref={confirmButton} type="button" className={styles.removeButton} disabled={pending !== null} onClick={() => void act("remove")}>{pending === "remove" ? "Quitando…" : "Confirmar y quitar"}</button><button type="button" className={styles.retryButton} disabled={pending !== null} onClick={() => setConfirmRemove(false)}>Cancelar</button></div>}
        {error && <p id={`${id}-error`} role="alert" className={styles.errorMessage}>{error}{!status && <button type="button" className={styles.retryButton} disabled={loading} onClick={() => setReload((value) => value + 1)}>Reintentar</button>}</p>}
        {notice && <p role="status" aria-live="polite" className={styles.statusMessage}>{notice}{status?.updatedAt && <span className={styles.keyHelp}> Actualizada: <time dateTime={status.updatedAt}>{new Date(status.updatedAt).toLocaleString()}</time></span>}</p>}
      </div>
    </Modal>
  );
}
