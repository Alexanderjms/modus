"use client";

import { useState, type FormEvent } from "react";

const TOKEN_PLACEHOLDER = "•".repeat(20);

function EyeIcon({ hidden }: { hidden: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      className="size-[14px]"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    >
      {hidden ? (
        <>
          <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
          <circle cx="12" cy="12" r="3" />
        </>
      ) : (
        <>
          <path d="m3 3 18 18" />
          <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
          <path d="M9.9 5.2A10.5 10.5 0 0 1 12 5c6.4 0 10 7 10 7a14 14 0 0 1-3 3.8" />
          <path d="M6.2 6.2A15 15 0 0 0 2 12s3.6 7 10 7a10 10 0 0 0 4-.8" />
        </>
      )}
    </svg>
  );
}

export function TursoCredentialsForm() {
  const [showToken, setShowToken] = useState(false);
  const [status, setStatus] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(
      "La comprobación con Turso aún no está integrada; no se han enviado datos.",
    );
  }

  function clearStatus() {
    if (status) setStatus("");
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
              defaultValue="libsql://tu-base.turso.io"
              onChange={clearStatus}
              className="h-full min-w-0 flex-1 bg-transparent p-0 text-[12.5px] font-normal leading-normal text-[var(--muted)] outline-none placeholder:text-[var(--muted)]"
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
              placeholder={TOKEN_PLACEHOLDER}
              onChange={clearStatus}
              className="h-full min-w-0 flex-1 bg-transparent p-0 text-[12.5px] font-normal leading-normal text-[var(--foreground)] outline-none placeholder:text-[var(--foreground)] placeholder:opacity-100"
            />
            <button
              type="button"
              aria-label={showToken ? "Ocultar Auth Token" : "Mostrar Auth Token"}
              aria-pressed={showToken}
              onClick={() => setShowToken((visible) => !visible)}
              className="flex size-7 shrink-0 items-center justify-center rounded-[5px] text-[var(--muted)] hover:text-[var(--foreground)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#007AFF]"
            >
              <EyeIcon hidden={!showToken} />
            </button>
          </div>
        </div>
      </div>

      <button
        type="submit"
        className="mt-6 inline-flex h-[26px] w-fit items-center justify-center rounded-[7px] bg-[#007AFF] px-[11px] py-[5px] text-[12px] font-semibold leading-4 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#007AFF]"
      >
        Probar conexión
      </button>
      <p
        role="status"
        aria-live="polite"
        className={
          status
            ? "mt-3 w-full text-center text-[11.5px] leading-[17px] text-[var(--muted)]"
            : "sr-only"
        }
      >
        {status}
      </p>
    </form>
  );
}
