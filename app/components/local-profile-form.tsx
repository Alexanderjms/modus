"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { LocalStoragePreparation } from "./local-storage-preparation";
import styles from "./turso-guide.module.css";
import { useT } from "../i18n/provider";

const INPUT_CLASS =
  "h-[34px] w-full rounded-[7px] bg-[var(--surface)] px-[10px] py-0 text-[12.5px] leading-[normal] text-[var(--foreground)] caret-[#007AFF] outline outline-1 -outline-offset-[0.5px] outline-[var(--border)] focus:shadow-[0px_0px_3px_#007AFF33] focus:outline-2 focus:-outline-offset-[1px] focus:outline-[#007AFF]";

export function LocalProfileForm() {
  const t = useT();
  const router = useRouter();
  const nameInput = useRef<HTMLInputElement>(null);
  const pinInput = useRef<HTMLInputElement>(null);
  const confirmationInput = useRef<HTMLInputElement>(null);
  const screenTitle = useRef<HTMLHeadingElement>(null);
  const requestPending = useRef(false);
  const [pinEnabled, setPinEnabled] = useState(false);
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [pinConfirmation, setPinConfirmation] = useState("");
  const [screen, setScreen] = useState<"form" | "confirm" | "pending">("form");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState(t("Iniciando la creación…"));

  useEffect(() => {
    if (screen === "form") nameInput.current?.focus();
    else screenTitle.current?.focus();
  }, [screen]);

  useEffect(() => {
    if (pinEnabled) pinInput.current?.focus({ preventScroll: true });
  }, [pinEnabled]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!name.trim()) {
      setError(t("Introduce tu nombre."));
      nameInput.current?.focus();
      return;
    }
    if (pinEnabled && !/^[0-9]+$/.test(pin)) {
      setError(t("Introduce un PIN formado solo por números."));
      pinInput.current?.focus();
      return;
    }
    if (pinEnabled && pin !== pinConfirmation) {
      setError(t("Los PIN deben coincidir."));
      confirmationInput.current?.focus();
      return;
    }
    setScreen("confirm");
  }

  async function createStorage() {
    if (requestPending.current) return;
    requestPending.current = true;
    setError("");
    setProgress(0);
    setProgressMessage(t("Iniciando la creación…"));
    setScreen("pending");

    let succeeded = false;
    let failureMessage = "";
    try {
      const response = await fetch("/api/onboarding/local", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/x-ndjson",
        },
        body: JSON.stringify({
          name: name.trim(),
          pinEnabled,
          ...(pinEnabled ? { pin, pinConfirmation } : {}),
        }),
      });

      const fail = (message: string): Error => {
        failureMessage = message;
        return new Error(message);
      };

      if (response.status !== 200) {
        const result = (await response.json().catch(() => null)) as {
          error?: unknown;
        } | null;
        throw fail(
          response.status === 409
            ? t("Ya existe un perfil local y no se sobrescribió.")
            : typeof result?.error === "string"
              ? result.error
              : t("No se pudo crear el almacenamiento local. Inténtalo de nuevo."),
        );
      }

      if (
        !response.headers
          .get("content-type")
          ?.toLowerCase()
          .startsWith("application/x-ndjson")
      ) {
        try {
          await response.body?.cancel();
        } catch {}
        throw fail(t("La respuesta del servidor no contiene avances válidos. Inténtalo de nuevo."));
      }

      const reader = response.body?.getReader();
      if (!reader) throw fail(t("No se recibió el progreso de creación. Inténtalo de nuevo."));

      const decoder = new TextDecoder("utf-8", { fatal: true });
      let buffer = "";
      let lastProgress = 0;
      let completionMessage: string | null = null;

      const consumeLine = (line: string) => {
        if (!line.trim()) throw fail(t("La respuesta de creación contiene una línea inválida."));

        let event: unknown;
        try {
          event = JSON.parse(line);
        } catch {
          throw fail(t("La respuesta de creación contiene datos inválidos."));
        }

        if (!event || typeof event !== "object" || Array.isArray(event)) {
          throw fail(t("La respuesta de creación contiene un evento inesperado."));
        }

        const record = event as Record<string, unknown>;
        if (completionMessage !== null) {
          throw fail(t("La respuesta de creación continuó después de completarse."));
        }

        if (record.type === "progress") {
          if (
            !Number.isInteger(record.progress) ||
            (record.progress as number) < lastProgress ||
            (record.progress as number) < 0 ||
            (record.progress as number) > 99 ||
            typeof record.message !== "string"
          ) {
            throw fail(t("La respuesta contiene un avance inválido."));
          }
          lastProgress = record.progress as number;
          setProgress(lastProgress);
          setProgressMessage(record.message as string);
          return;
        }

        if (record.type === "complete") {
          if (
            record.progress !== 100 ||
            typeof record.message !== "string" ||
            record.message !== "Almacenamiento local creado."
          ) {
            throw fail(t("La respuesta de finalización no es válida."));
          }
          completionMessage = record.message as string;
          return;
        }

        if (record.type === "error") {
          if (
            typeof record.error !== "string" ||
            !Number.isInteger(record.status) ||
            (record.status as number) < 400 ||
            (record.status as number) > 599
          ) {
            throw fail(t("La respuesta contiene un error inválido."));
          }
          throw fail(
            record.status === 409
              ? t("Ya existe un perfil local y no se sobrescribió.")
              : (record.error as string),
          );
        }

        throw fail(t("La respuesta de creación contiene un tipo de evento inesperado."));
      };

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          try {
            buffer += decoder.decode(value, { stream: true });
          } catch {
            throw fail(t("La respuesta contiene texto UTF-8 inválido."));
          }
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          lines.forEach(consumeLine);
        }
        try {
          buffer += decoder.decode();
        } catch {
          throw fail(t("La respuesta terminó con texto UTF-8 incompleto."));
        }
        if (buffer.length > 0) {
          throw fail(t("La respuesta de creación terminó de forma incompleta."));
        }
        if (completionMessage === null) {
          throw fail(t("La respuesta terminó antes de confirmar la creación."));
        }
      } catch (cause) {
        try {
          await reader.cancel();
        } catch {}
        throw cause;
      } finally {
        reader.releaseLock();
      }

      setProgress(100);
      setProgressMessage(completionMessage as string);
      succeeded = true;
      setPin("");
      setPinConfirmation("");
      router.replace("/onboarding/listo");
    } catch (cause) {
      setError(
        failureMessage ||
          (cause instanceof Error && cause.message
            ? t("La conexión se interrumpió durante la creación. Inténtalo de nuevo.")
            : t("No se pudo conectar para crear el almacenamiento. Inténtalo de nuevo.")),
      );
      setScreen("confirm");
    } finally {
      if (!succeeded) {
        requestPending.current = false;
      }
    }
  }

  if (screen === "pending") {
    return (
      <LocalStoragePreparation progress={progress} message={progressMessage} />
    );
  }

  if (screen === "confirm") {
    return (
      <section
        aria-labelledby="local-confirmation-title"
        className="flex w-full flex-col items-center gap-5"
      >
        <h2
          ref={screenTitle}
          id="local-confirmation-title"
          tabIndex={-1}
          className="w-full text-center text-[16px] font-semibold leading-[normal] text-[var(--foreground)] outline-none"
        >
          {t("Revisa el almacenamiento local")}
        </h2>

        <dl className="flex w-full flex-col gap-3 text-[12.5px]">
          <div className="flex items-center justify-between gap-4">
            <dt className="text-[var(--muted)]">{t("Nombre")}</dt>
            <dd className="min-w-0 break-words text-right font-medium text-[var(--foreground)]">
              {name.trim()}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-[var(--muted)]">{t("Protección con PIN")}</dt>
            <dd className="font-medium text-[var(--foreground)]">
              {pinEnabled ? t("Activada") : t("Desactivada")}
            </dd>
          </div>
        </dl>

        <div className="w-full text-left">
          <p className="mb-2 text-[11px] font-semibold text-[var(--muted)]">
            {t("Al continuar, Modus realizará este proceso:")}
          </p>
          <ol className="list-decimal space-y-1 pl-5 text-[12px] leading-[18px] text-[var(--foreground)]">
            <li>{t("Crear el archivo SQLite local.")}</li>
            <li>{t("Crear las tablas y relaciones.")}</li>
            <li>{t("Cargar los estados y prioridades iniciales.")}</li>
            <li>{t("Guardar el nombre y, si activaste el PIN, su hash.")}</li>
          </ol>
        </div>

        <p className="w-full text-[11.5px] leading-[17px] text-[var(--muted)]">
          {t("Tus datos se guardarán localmente en tu equipo, sin enviarse a internet. Tú tendrás el control de tus archivos y su seguridad.")}
        </p>

        {error && (
          <p role="alert" className="w-full text-[12px] leading-[18px] text-[#c2413a]">
            {t(error)}
          </p>
        )}

        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => {
              setError("");
              setScreen("form");
            }}
            className="rounded-[7px] px-[11px] py-[5px] text-[12px] font-semibold text-[var(--muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#007AFF]"
          >
            {t("Editar")}
          </button>
          <button
            type="button"
            onClick={createStorage}
            className="inline-flex w-fit items-center justify-center rounded-[7px] bg-[#007AFF] px-[11px] py-[5px] text-[12px] font-semibold leading-[normal] text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#007AFF]"
          >
            {t("Crear almacenamiento local")}
          </button>
        </div>
      </section>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      aria-label={t("Perfil local")}
      className="flex w-full flex-col items-center gap-6"
    >
      <div className="flex w-full flex-col items-start gap-[5px]">
        <label
          htmlFor="local-profile-name"
          className="text-[11px] font-semibold leading-[normal] text-[var(--muted)]"
        >
          {t("Nombre")}
        </label>
        <input
          ref={nameInput}
          id="local-profile-name"
          name="name"
          type="text"
          required
          maxLength={100}
          pattern={".*\\S.*"}
          autoComplete="given-name"
          placeholder={t("Tu nombre")}
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
          className={INPUT_CLASS}
        />
      </div>

      <div className="flex w-full flex-col items-start">
        <p className="mb-2 text-[11px] font-semibold leading-[normal] text-[var(--muted)]">
          {t("Protección local")}
        </p>
        <div className="flex w-full items-center gap-[10px]">
          <button
            type="button"
            role="switch"
            aria-checked={pinEnabled}
            aria-labelledby="local-pin-label"
            aria-describedby="local-pin-help"
            aria-controls="local-pin-fields"
            onClick={() => {
              if (pinEnabled) {
                setPinEnabled(false);
                setPin("");
                setPinConfirmation("");
                confirmationInput.current?.setCustomValidity("");
              } else {
                setPinEnabled(true);
              }
            }}
            className={`relative h-5 w-9 shrink-0 rounded-[10px] transition-colors duration-[160ms] outline outline-1 -outline-offset-[0.5px] focus-visible:ring-2 focus-visible:ring-[#007AFF] focus-visible:ring-offset-2 ${
              pinEnabled
                ? "bg-[#007AFF] outline-[#007AFF]"
                : "bg-[var(--toggle-track)] outline-[var(--border)]"
            }`}
          >
            <span
              aria-hidden="true"
              className={`absolute left-[2px] top-[2px] size-4 rounded-full bg-white shadow-[0px_1px_2px_#00000014] motion-safe:transition-transform motion-safe:duration-[160ms] motion-safe:ease-[cubic-bezier(0.23,1,0.32,1)] ${
                pinEnabled ? "translate-x-full" : "translate-x-0"
              }`}
            />
          </button>
          <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
            <p
              id="local-pin-label"
              className="text-[12.5px] leading-[normal] text-[var(--foreground)]"
            >
              {t("Proteger Modus con un PIN")}
            </p>
            <p
              id="local-pin-help"
              className="text-[11.5px] leading-[normal] text-[var(--muted)]"
            >
              {t("Guardar el hash de un PIN junto al perfil local.")}
            </p>
          </div>
        </div>
        <div
          id="local-pin-fields"
          aria-hidden={!pinEnabled}
          inert={!pinEnabled}
          data-open={pinEnabled}
          className={`${styles.panel} w-full`}
        >
          <div className="min-h-0 overflow-hidden">
            <fieldset
              disabled={!pinEnabled}
              aria-label={t("Configura tu PIN")}
              className="flex w-full flex-col gap-4 pb-px pt-6"
            >
              <div className="flex w-full flex-col gap-[5px]">
                <label
                  htmlFor="local-pin"
                  className="text-[11px] font-semibold leading-[normal] text-[var(--muted)]"
                >
                  {t("PIN")}
                </label>
                <input
                  id="local-pin"
                  ref={pinInput}
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]+"
                  required
                  autoComplete="new-password"
                  placeholder={t("Introduce tu PIN")}
                  value={pin}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setPin(value);
                    confirmationInput.current?.setCustomValidity(
                      pinConfirmation && value !== pinConfirmation
                        ? t("Los PIN deben coincidir.")
                        : "",
                    );
                  }}
                  className={INPUT_CLASS}
                />
              </div>
              <div className="flex w-full flex-col gap-[5px]">
                <label
                  htmlFor="local-pin-confirmation"
                  className="text-[11px] font-semibold leading-[normal] text-[var(--muted)]"
                >
                  {t("Confirmar PIN")}
                </label>
                <input
                  id="local-pin-confirmation"
                  ref={confirmationInput}
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]+"
                  required
                  autoComplete="new-password"
                  placeholder={t("Repite tu PIN")}
                  value={pinConfirmation}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setPinConfirmation(value);
                    event.currentTarget.setCustomValidity(
                      value && value !== pin ? t("Los PIN deben coincidir.") : "",
                    );
                  }}
                  className={INPUT_CLASS}
                />
              </div>
            </fieldset>
          </div>
        </div>
      </div>

      {error && (
        <p role="alert" className="w-full text-[12px] leading-[18px] text-[#c2413a]">
          {t(error)}
        </p>
      )}

      <button
        type="submit"
        className="inline-flex w-fit items-center justify-center rounded-[7px] bg-[#007AFF] px-[11px] py-[5px] text-[12px] font-semibold leading-[normal] text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#007AFF]"
      >
        {t("Continuar")}
      </button>
    </form>
  );
}
