"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ChatGPTConnection } from "../../chat-contract";
import { Skeleton } from "../skeleton";
import { Modal } from "./modal";
import styles from "./profile-modals.module.css";
import { useT } from "../../i18n/provider";

const labels: Record<ChatGPTConnection["status"], string> = {
  connected: "Conectado",
  disconnected: "Sin conectar",
  expired: "Reconectar",
  permission_required: "Autorizar plan",
};

function validConnection(value: unknown): value is ChatGPTConnection {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Partial<ChatGPTConnection>;
  return item.id === "chatgpt" && typeof item.status === "string" && Object.hasOwn(labels, item.status)
    && typeof item.configured === "boolean" && typeof item.available === "boolean"
    && (item.email === null || typeof item.email === "string")
    && (item.expiresAt === null || (typeof item.expiresAt === "string" && Number.isFinite(Date.parse(item.expiresAt))));
}

async function readResult(response: Response): Promise<Record<string, unknown>> {
  const value: unknown = await response.json().catch(() => null);
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("No se pudo leer el estado de ChatGPT.");
  const result = value as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "No se pudo completar la conexión de ChatGPT.");
  return result;
}

export function ChatGPTConnectionCard({ open, disabled = false }: { open: boolean; disabled?: boolean }) {
  const t = useT();
  const [connection, setConnection] = useState<ChatGPTConnection | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<"connect" | "disconnect" | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loopbackUrl, setLoopbackUrl] = useState("");
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const requestRef = useRef<AbortController | null>(null);
  const actionRef = useRef(false);
  const openRef = useRef(open);
  openRef.current = open;

  const load = useCallback(async () => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    setError("");
    try {
      const result = await readResult(await fetch("/api/providers/chatgpt", { cache: "no-store", signal: controller.signal }));
      if (!validConnection(result.connection)) throw new Error(t("El estado de ChatGPT no es válido."));
      if (!controller.signal.aborted) {
        setConnection(result.connection);
        if (result.connection.configured) {
          try { setWelcomeOpen(localStorage.getItem("modus-chatgpt-welcome-seen") !== "true"); }
          catch { setWelcomeOpen(false); }
        }
      }
    } catch (reason) {
      if (!controller.signal.aborted) {
        setConnection(null);
        setError(reason instanceof Error ? reason.message : t("No se pudo cargar ChatGPT."));
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const local = new URL(window.location.href);
    if (local.hostname !== "127.0.0.1" || local.protocol !== "http:") {
      local.hostname = "127.0.0.1";
      local.protocol = "http:";
      local.searchParams.delete("chatgpt");
      setLoopbackUrl(local.toString());
    } else setLoopbackUrl("");
    setNotice("");
    void load();
    const focus = () => { if (!actionRef.current) void load(); };
    window.addEventListener("focus", focus);
    return () => {
      requestRef.current?.abort();
      window.removeEventListener("focus", focus);
    };
  }, [open, load]);

  async function act(action: "connect" | "disconnect") {
    if (actionRef.current || disabled || loading || !connection?.available) return;
    actionRef.current = true;
    setPending(action);
    setError("");
    setNotice("");
    try {
      const result = await readResult(await fetch(
        action === "connect" ? "/api/providers/chatgpt/connect" : "/api/providers/chatgpt",
        { method: action === "connect" ? "POST" : "DELETE", cache: "no-store" },
      ));
      if (action === "connect") {
        if (typeof result.authorizationUrl !== "string") throw new Error(t("No se recibió la autorización de ChatGPT."));
        const url = new URL(result.authorizationUrl);
        if (url.origin !== "https://auth.openai.com" || url.pathname !== "/api/accounts/authorize") throw new Error(t("La dirección de autorización no es válida."));
        if (openRef.current) window.location.assign(url.toString());
      } else {
        if (!validConnection(result.connection)) throw new Error(t("No se pudo confirmar la desconexión."));
        window.dispatchEvent(new CustomEvent("modus:providers-changed", { detail: { provider: "chatgpt", disconnected: true } }));
        if (openRef.current) {
          setConnection(result.connection);
          setNotice(typeof result.warning === "string" ? result.warning : t("ChatGPT desconectado de Modus."));
        }
      }
    } catch (reason) {
      if (openRef.current) setError(reason instanceof Error ? reason.message : t("No se pudo completar la conexión de ChatGPT."));
    } finally {
      actionRef.current = false;
      setPending(null);
    }
  }

  const busy = disabled || loading || pending !== null;
  const dismissWelcome = () => {
    try { localStorage.setItem("modus-chatgpt-welcome-seen", "true"); } catch {}
    setWelcomeOpen(false);
  };

  return (
    <>
    <section className={`${styles.providerCard} ${styles.connectionCard}`} aria-label={t("Conexión de ChatGPT")} aria-busy={loading || pending !== null}>
      <div className={styles.providerHeader}>
        <img src="/providers/chatgpt.svg" alt="" aria-hidden="true" className={`${styles.providerLogo} ${styles.invertInDark}`} />
        <span className={styles.providerName}>{t("ChatGPT")}</span>
        <span className={`${styles.providerBadge} ${connection?.configured ? styles.active : ""}`}>
          {loading ? <Skeleton variant="text" width={56} height={9} /> : connection ? t(labels[connection.status]) : t("No disponible")}
        </span>
      </div>
      <p className={styles.keyLabel}>{t("Usa tu plan de ChatGPT mediante OAuth. No necesitas una API key.")}</p>
      {connection?.email && <p>{connection.email}</p>}
      {connection?.configured && <p className={styles.keyLabel}>{t("La sesión se renueva automáticamente mientras siga autorizada.")}</p>}
      {connection?.status === "permission_required" && <p>{t("La cuenta está vinculada, pero necesitas autorizar el uso de tu plan para chatear.")}</p>}
      {connection?.status === "expired" && <p>{t("La sesión expiró o fue revocada. Reconecta tu cuenta para continuar.")}</p>}
      {connection?.available === false && <p role="status">{t("La conexión segura requiere Windows DPAPI.")}</p>}
      {disabled && <p>{t("Guarda o descarta los cambios de API keys antes de modificar esta conexión.")}</p>}
      {loopbackUrl && <p className={styles.keyLabel}>{t("El flujo oficial requiere abrir Modus en 127.0.0.1. Es posible que debas desbloquear tu perfil de nuevo.")}</p>}
      <div className={styles.connectionActions}>
        {loopbackUrl ? <a className={styles.connectionButton} href={loopbackUrl} target="_blank" rel="noopener noreferrer" aria-label={t("Conectar ChatGPT Plus / Pro (continúa en otra pestaña)")} aria-disabled={busy || !connection?.available} onClick={(event) => { if (busy || !connection?.available) event.preventDefault(); }}>{t("Conectar ChatGPT Plus / Pro")}</a> : (
          <button type="button" className={styles.connectionButton} disabled={busy || !connection?.available} onClick={() => void act("connect")}>
            {pending === "connect" ? t("Abriendo ChatGPT…") : connection?.status === "expired" || connection?.configured ? t("Reconectar ChatGPT") : t("Conectar ChatGPT Plus / Pro")}
          </button>
        )}
        {(connection?.configured || connection?.status === "permission_required") && (
          <button type="button" className={styles.removeButton} disabled={busy} onClick={() => void act("disconnect")}>
            {pending === "disconnect" ? t("Desconectando…") : t("Desconectar")}
          </button>
        )}
        <a href="https://chatgpt.com/settings/usage" target="_blank" rel="noopener noreferrer">{t("Gestionar uso")}</a>
      </div>
      {error && <div className={styles.errorMessage} role="alert"><span>{t(error)}</span><button className={styles.retryButton} type="button" disabled={busy} onClick={() => void load()}>{t("Reintentar")}</button></div>}
      {notice && <p role="status">{t(notice)}</p>}
    </section>
    {open && welcomeOpen && connection?.configured && createPortal(
      <Modal open onClose={dismissWelcome} title={t("Estás usando tu plan de ChatGPT")} submitLabel={t("Entendido")} onSubmit={(event) => { event.preventDefault(); event.stopPropagation(); dismissWelcome(); }}>
        <div className={styles.connectionWelcome}>
          <p>{t("Las solicitudes compatibles de Modus utilizarán el plan de tu cuenta de ChatGPT. El consumo y los límites los gestiona OpenAI.")}</p>
          <a href="https://chatgpt.com/settings/usage" target="_blank" rel="noopener noreferrer">{t("Gestionar uso en ChatGPT")}</a>
        </div>
      </Modal>, document.body,
    )}
    </>
  );
}
