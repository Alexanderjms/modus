"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { OnboardingFrame } from "./onboarding-frame";
import { useT } from "../i18n/provider";

const FIELD_CLASS =
  "h-[34px] w-full rounded-[7px] bg-[var(--surface)] px-[10px] py-0 text-[12.5px] leading-[normal] text-[var(--foreground)] caret-[#007AFF] outline outline-1 -outline-offset-[0.5px] outline-[var(--border)] focus:shadow-[0px_0px_3px_#007AFF33] focus:outline-2 focus:-outline-offset-[1px] focus:outline-[#007AFF] disabled:opacity-60";
const PIN_CLASS = `${FIELD_CLASS} text-center text-[15px] tracking-[0.3em]`;
const LABEL_CLASS = "text-[11px] font-semibold leading-[normal] text-[var(--muted)]";

export function PinLockScreen({ kind = "pin" }: { kind?: "pin" | "password" }) {
  const t = useT();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const cloud = kind === "password";
  const [pin, setPin] = useState("");
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [retryAfter, setRetryAfter] = useState(0);
  const ready = cloud ? Boolean(usuario.trim() && password) : Boolean(pin);

  useEffect(() => {
    input.current?.focus();
  }, []);

  useEffect(() => {
    if (retryAfter <= 0) return;
    const timer = window.setTimeout(() => setRetryAfter((seconds) => seconds - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [retryAfter]);

  useEffect(() => {
    if (!pending && retryAfter === 0) input.current?.focus();
  }, [pending, retryAfter]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || retryAfter > 0 || !ready) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/pin/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cloud ? { usuario: usuario.trim(), password } : { pin }),
      });
      if (response.ok) {
        router.refresh();
        return;
      }
      const result = (await response.json().catch(() => null)) as { error?: string; retryAfter?: number } | null;
      setError(result?.error ?? t("No se pudo desbloquear. Inténtalo de nuevo."));
      setRetryAfter(result?.retryAfter ?? 0);
      setPin("");
      setPassword("");
    } catch {
      setError(t("No se pudo conectar. Inténtalo de nuevo."));
    }
    setPending(false);
  }

  return (
    <OnboardingFrame>
      <section aria-labelledby="pin-lock-title" className="flex w-full max-w-[320px] flex-col items-center gap-6">
        <header className="flex w-full flex-col items-center gap-2 text-center">
          <h1 id="pin-lock-title" className="text-xl font-bold tracking-[-0.3px] [line-height:normal]">
            {cloud ? t("Inicia sesión") : t("Modus está bloqueado")}
          </h1>
          <p className="text-[12.5px] leading-[18px] text-[var(--muted)]">
            {cloud ? t("Usa el usuario y la contraseña de tu perfil en Turso.") : t("Introduce tu PIN para continuar.")}
          </p>
        </header>
        <form onSubmit={submit} className="flex w-full flex-col items-center gap-4">
          {cloud ? (
            <>
              <div className="flex w-full flex-col items-start gap-[5px]">
                <label htmlFor="cloud-login-username" className={LABEL_CLASS}>{t("Usuario")}</label>
                <input
                  ref={input}
                  id="cloud-login-username"
                  type="text"
                  autoComplete="username"
                  maxLength={32}
                  disabled={pending || retryAfter > 0}
                  aria-describedby={error ? "pin-lock-error" : undefined}
                  value={usuario}
                  onChange={(event) => { setUsuario(event.currentTarget.value); setError(""); }}
                  className={FIELD_CLASS}
                />
              </div>
              <div className="flex w-full flex-col items-start gap-[5px]">
                <label htmlFor="cloud-login-password" className={LABEL_CLASS}>{t("Contraseña")}</label>
                <input
                  id="cloud-login-password"
                  type="password"
                  autoComplete="current-password"
                  maxLength={200}
                  disabled={pending || retryAfter > 0}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? "pin-lock-error" : undefined}
                  value={password}
                  onChange={(event) => { setPassword(event.currentTarget.value); setError(""); }}
                  className={FIELD_CLASS}
                />
              </div>
            </>
          ) : (
            <div className="flex w-full flex-col items-start gap-[5px]">
              <label htmlFor="pin-lock-input" className={LABEL_CLASS}>{t("PIN")}</label>
              <input
                ref={input}
                id="pin-lock-input"
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={12}
                autoComplete="current-password"
                disabled={pending || retryAfter > 0}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? "pin-lock-error" : undefined}
                value={pin}
                onChange={(event) => {
                  setPin(event.currentTarget.value.replace(/\D/g, ""));
                  setError("");
                }}
                className={PIN_CLASS}
              />
            </div>
          )}
          {(error || retryAfter > 0) && (
            <p id="pin-lock-error" role="alert" className="w-full text-[12px] leading-[18px] text-[#c2413a]">
              {t(error)}
              {retryAfter > 0 ? t(" Reintenta en {0} s.", retryAfter) : ""}
            </p>
          )}
          <button
            type="submit"
            disabled={pending || retryAfter > 0 || !ready}
            className="inline-flex w-fit items-center justify-center rounded-[7px] bg-[#007AFF] px-[11px] py-[5px] text-[12px] font-semibold leading-[normal] text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#007AFF] disabled:opacity-60"
          >
            {pending ? (cloud ? t("Entrando…") : t("Desbloqueando…")) : cloud ? t("Iniciar sesión") : t("Desbloquear")}
          </button>
        </form>
      </section>
    </OnboardingFrame>
  );
}
