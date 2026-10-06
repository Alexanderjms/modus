"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Modal } from "./modal";
import styles from "./profile-modals.module.css";
import { ProviderCard } from "./provider-card";
import {
  providers,
  providerErrorForStatus,
  providerRequestError,
  readProviderStatus,
  type ProviderId,
  type ProviderStatus,
} from "./provider-data.mjs";

export function ProfileModal({
  open,
  onClose,
  storageType = "local",
}: {
  open: boolean;
  onClose: () => void;
  storageType?: "local" | "cloud";
}) {
  const isLocal = storageType === "local";

  const [name, setName] = useState("Alexander");
  const [lastName, setLastName] = useState("Molina");
  const [pin, setPin] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isLocal && password && password !== confirmPassword) {
      alert("Las contraseñas no coinciden.");
      return;
    }
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Perfil" onSubmit={handleSubmit}>
      <div className={styles.form}>
        <div className={styles.field}>
          <label htmlFor="profile-name" className={styles.label}>
            Nombre
          </label>
          <input
            id="profile-name"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={styles.input}
          />
        </div>

        {isLocal ? (
          <div className={styles.field}>
            <label htmlFor="profile-pin" className={styles.label}>
              PIN de acceso
            </label>
            <input
              id="profile-pin"
              type="password"
              inputMode="numeric"
              maxLength={6}
              placeholder="Introduce nuevo PIN"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              className={styles.input}
            />
          </div>
        ) : (
          <>
            <div className={styles.field}>
              <label htmlFor="profile-last-name" className={styles.label}>
                Apellido
              </label>
              <input
                id="profile-last-name"
                type="text"
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className={styles.input}
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="profile-password" className={styles.label}>
                Nueva contraseña
              </label>
              <input
                id="profile-password"
                type="password"
                minLength={8}
                placeholder="Mínimo 8 caracteres"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={styles.input}
              />
            </div>
            <div className={styles.field}>
              <label
                htmlFor="profile-confirm-password"
                className={styles.label}
              >
                Confirmar contraseña
              </label>
              <input
                id="profile-confirm-password"
                type="password"
                minLength={8}
                placeholder="Repite la contraseña"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={styles.input}
              />
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

export function ProvidersModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [removed, setRemoved] = useState<Set<ProviderId>>(() => new Set());
  const [status, setStatus] = useState<ProviderStatus>({});
  const [storageAvailable, setStorageAvailable] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const savingRef = useRef(false);

  useEffect(() => {
    if (!open) {
      setKeys({});
      setRemoved(new Set());
      setStatus({});
      setStorageAvailable(null);
      setLoaded(false);
      setLoading(false);
      setError("");
      return;
    }

    const controller = new AbortController();
    setKeys({});
    setRemoved(new Set());
    setStatus({});
    setStorageAvailable(null);
    setLoaded(false);
    setLoading(true);
    setError("");

    fetch("/api/providers", { cache: "no-store", signal: controller.signal })
      .then(readProviderStatus)
      .then(({ status: nextStatus, available }) => {
        if (controller.signal.aborted) return;
        setStatus(nextStatus);
        setStorageAvailable(available);
        setLoaded(true);
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setError(providerRequestError(reason, "No se pudieron cargar las claves. Inténtalo de nuevo."));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [open, reload]);

  function close() {
    setKeys({});
    setRemoved(new Set());
    setStatus({});
    setStorageAvailable(null);
    setLoaded(false);
    setError("");
    onClose();
  }

  function toggleRemoval(id: ProviderId) {
    setKeys((current) => ({ ...current, [id]: "" }));
    setRemoved((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!loaded || storageAvailable !== true || savingRef.current) return;

    const updates: Partial<Record<ProviderId, string | null>> = {};
    for (const provider of providers) {
      if (removed.has(provider.id)) {
        updates[provider.id] = null;
        continue;
      }
      const key = keys[provider.id]?.trim();
      if (key) updates[provider.id] = key;
    }
    if (Object.keys(updates).length === 0) return;

    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/providers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ keys: updates }),
      });
      const result = await readProviderStatus(response);
      setStatus(result.status);
      setStorageAvailable(result.available);
      close();
    } catch (reason: unknown) {
      if (reason instanceof Error && reason.message === providerErrorForStatus(501)) {
        setStorageAvailable(false);
      }
      setError(providerRequestError(reason, "No se pudieron guardar las claves. Inténtalo de nuevo."));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  const canEdit = loaded && storageAvailable === true && !loading && !saving;
  const hasChanges = removed.size > 0 || Object.values(keys).some((key) => key.trim());

  return (
    <Modal
      open={open}
      onClose={close}
      title="Proveedores y API Keys"
      className={styles.providersDialog}
      onSubmit={handleSubmit}
      submitLabel={saving ? "Guardando…" : loading ? "Cargando…" : "Guardar cambios"}
      pending={saving}
      submitDisabled={!canEdit || !hasChanges}
      descriptionId="provider-security-note"
    >
      <p id="provider-security-note" className={styles.securityNote}>
        Las API keys se guardan cifradas en SQLite con Windows DPAPI, protegidas por el usuario de
        Windows que ejecuta Modus. No se hashean: el servidor debe poder recuperarlas para usarlas.
        Las claves guardadas no se muestran de nuevo. El PIN no las cifra; al cambiar de usuario o
        equipo puede ser necesario ingresarlas otra vez.
      </p>

      {error && (
        <div className={styles.errorMessage} role="alert">
          <span>{error}</span>
          {!loaded && (
            <button
              type="button"
              className={styles.retryButton}
              onClick={() => setReload((current) => current + 1)}
              disabled={loading}
            >
              Reintentar
            </button>
          )}
        </div>
      )}
      {loaded && storageAvailable === false && (
        <p className={styles.warningMessage} role="status">
          La edición segura no está disponible en este sistema. Se requiere Windows DPAPI; las
          claves no se guardarán sin cifrado.
        </p>
      )}
      {saving && (
        <p className={styles.statusMessage} role="status" aria-live="polite">
          Guardando los cambios cifrados…
        </p>
      )}

      <div
        className={styles.providerList}
        aria-busy={loading || saving}
        role={loading ? "status" : undefined}
        aria-label={loading ? "Cargando el estado de las claves guardadas" : undefined}
      >
        {providers.map(({ id, name, placeholder, logo }) => (
          <ProviderCard
            key={id}
            id={id}
            name={name}
            placeholder={placeholder}
            logo={logo}
            configured={status[id] === true}
            isRemoved={removed.has(id)}
            loading={loading}
            canEdit={canEdit}
            value={keys[id] ?? ""}
            onKeyChange={(value) => setKeys((current) => ({ ...current, [id]: value }))}
            onToggleRemoval={() => toggleRemoval(id)}
          />
        ))}
      </div>
    </Modal>
  );
}
