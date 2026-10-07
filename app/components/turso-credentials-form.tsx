"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { EyeIcon } from "./onboarding/eye-icon";

export function TursoCredentialsForm() {
  const router = useRouter();
  const [showToken, setShowToken] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/onboarding/turso/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          databaseUrl: String(form.get("databaseUrl") ?? ""),
          authToken: String(form.get("authToken") ?? ""),
        }),
      });
      if (response.ok) {
        router.push("/onboarding/turso/perfil");
        return;
      }
      const result = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(result?.error ?? "No se pudo conectar con Turso. Inténtalo de nuevo.");
    } catch {
      setError("No se pudo conectar con el servidor. Inténtalo de nuevo.");
    }
    setPending(false);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex w-full flex-col items-center"
      aria-label="Credenciales de Turso"
    >
      <div className="flex w-full flex-col gap-4">
        <div className="flex w-full flex-col items-start gap-[5px]">
          <label
            htmlFor="turso-database-url"
            className="text-[11px] font-semibold leading-[14px] text-[var(--muted)]"
          >
            Database URL
          </label>
          <div className="flex h-[34px] w-full items-center gap-[6px] rounded-[7px] bg-[var(--surface)] px-[10px] outline outline-1 -outline-offset-[0.5px] outline-[var(--border)] has-[input:focus]:shadow-[0px_0px_3px_#007AFF33] has-[input:focus]:outline-2 has-[input:focus]:-outline-offset-[1px] has-[input:focus]:outline-[#007AFF]">
            <input
              id="turso-database-url"
              name="databaseUrl"
              type="text"
              required
              autoComplete="url"
              spellCheck={false}
              disabled={pending}
              placeholder="libsql://tu-base.turso.io"
              className="h-full min-w-0 flex-1 bg-transparent p-0 text-[12.5px] font-normal leading-normal text-[var(--foreground)] outline-none placeholder:text-[var(--muted)]"
            />
          </div>
        </div>

        <div className="flex w-full flex-col items-start gap-[5px]">
          <label
            htmlFor="turso-auth-token"
            className="text-[11px] font-semibold leading-[14px] text-[var(--muted)]"
          >
            Auth Token
          </label>
          <div className="flex h-[34px] w-full items-center gap-[6px] rounded-[7px] bg-[var(--surface)] pl-[10px] pr-[3px] outline outline-1 -outline-offset-[0.5px] outline-[var(--border)] has-[input:focus]:shadow-[0px_0px_3px_#007AFF33] has-[input:focus]:outline-2 has-[input:focus]:-outline-offset-[1px] has-[input:focus]:outline-[#007AFF]">
            <input
              id="turso-auth-token"
              name="authToken"
              type={showToken ? "text" : "password"}
              required
              autoComplete="off"
              disabled={pending}
              placeholder="Pega tu Auth Token"
              className="h-full min-w-0 flex-1 bg-transparent p-0 text-[12.5px] font-normal leading-normal text-[var(--foreground)] outline-none placeholder:text-[var(--muted)] placeholder:opacity-100"
            />
            <button
              type="button"
              aria-label={
                showToken ? "Ocultar Auth Token" : "Mostrar Auth Token"
              }
              aria-pressed={showToken}
              onClick={() => setShowToken((visible) => !visible)}
              className="flex size-7 shrink-0 items-center justify-center rounded-[5px] text-[var(--muted)] hover:text-[var(--foreground)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#007AFF]"
            >
              <EyeIcon hidden={!showToken} />
            </button>
          </div>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-4 w-full text-[12px] leading-[18px] text-[#c2413a]">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-6 inline-flex h-[26px] w-fit items-center justify-center rounded-[7px] bg-[#007AFF] px-[11px] py-[5px] text-[12px] font-semibold leading-4 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#007AFF] disabled:opacity-60"
      >
        {pending ? "Conectando…" : "Probar conexión"}
      </button>
    </form>
  );
}
