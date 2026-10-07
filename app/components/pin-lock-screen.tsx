"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { OnboardingFrame } from "./onboarding-frame";

const INPUT_CLASS =
  "h-[34px] w-full rounded-[7px] bg-[var(--surface)] px-[10px] py-0 text-center text-[15px] tracking-[0.3em] leading-[normal] text-[var(--foreground)] caret-[#007AFF] outline outline-1 -outline-offset-[0.5px] outline-[var(--border)] focus:shadow-[0px_0px_3px_#007AFF33] focus:outline-2 focus:-outline-offset-[1px] focus:outline-[#007AFF] disabled:opacity-60";

export function PinLockScreen() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [retryAfter, setRetryAfter] = useState(0);

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
    if (pending || retryAfter > 0 || !pin) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/pin/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      if (response.ok) {
        router.refresh();
        return;
      }
      const result = (await response.json().catch(() => null)) as { error?: string; retryAfter?: number } | null;
      setError(result?.error ?? "No se pudo desbloquear. Inténtalo de nuevo.");
      setRetryAfter(result?.retryAfter ?? 0);
      setPin("");
    } catch {
      setError("No se pudo conectar. Inténtalo de nuevo.");
    }
    setPending(false);
  }

  return (
    <OnboardingFrame>
      <section aria-labelledby="pin-lock-title" className="flex w-full max-w-[320px] flex-col items-center gap-6">
        <div
          aria-hidden="true"
          className="flex size-11 items-center justify-center rounded-full bg-[var(--surface)] text-[18px] text-[var(--foreground)] outline outline-1 -outline-offset-[0.5px] outline-[var(--border)]"
        >
          <i className="bi bi-lock-fill" />
        </div>
        <header className="flex w-full flex-col items-center gap-2 text-center">
          <h1 id="pin-lock-title" className="text-xl font-bold tracking-[-0.3px] [line-height:normal]">
            Modus está bloqueado
          </h1>
          <p className="text-[12.5px] leading-[18px] text-[var(--muted)]">Introduce tu PIN para continuar.</p>
        </header>
        <form onSubmit={submit} className="flex w-full flex-col items-center gap-4">
          <div className="flex w-full flex-col items-start gap-[5px]">
            <label htmlFor="pin-lock-input" className="text-[11px] font-semibold leading-[normal] text-[var(--muted)]">
              PIN
            </label>
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
              className={INPUT_CLASS}
            />
          </div>
          {(error || retryAfter > 0) && (
            <p id="pin-lock-error" role="alert" className="w-full text-[12px] leading-[18px] text-[#c2413a]">
              {error}
              {retryAfter > 0 ? ` Reintenta en ${retryAfter} s.` : ""}
            </p>
          )}
          <button
            type="submit"
            disabled={pending || retryAfter > 0 || !pin}
            className="inline-flex w-fit items-center justify-center rounded-[7px] bg-[#007AFF] px-[11px] py-[5px] text-[12px] font-semibold leading-[normal] text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#007AFF] disabled:opacity-60"
          >
            {pending ? "Desbloqueando…" : "Desbloquear"}
          </button>
        </form>
      </section>
    </OnboardingFrame>
  );
}
