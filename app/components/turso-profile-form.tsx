"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

const INPUT_CLASS =
  "h-full min-w-0 flex-1 bg-transparent p-0 text-[12.5px] font-normal leading-[normal] text-[var(--foreground)] caret-[#007AFF] outline-none placeholder:text-[var(--muted)] placeholder:opacity-100";
const FIELD_CLASS =
  "flex h-[34px] w-full items-center gap-[6px] rounded-[7px] bg-[var(--surface)] pl-[10px] pr-[3px] outline outline-1 -outline-offset-[0.5px] outline-[var(--border)] has-[input:focus]:shadow-[0px_0px_3px_#007AFF33] has-[input:focus]:outline-2 has-[input:focus]:-outline-offset-[1px] has-[input:focus]:outline-[#007AFF]";

export function TursoProfileForm() {
  const router = useRouter();
  const firstName = useRef<HTMLInputElement>(null);
  const password = useRef<HTMLInputElement>(null);
  const confirmation = useRef<HTMLInputElement>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  function validateConfirmation() {
    confirmation.current?.setCustomValidity(
      confirmation.current.value &&
        confirmation.current.value !== password.current?.value
        ? "Las contraseñas deben coincidir."
        : "",
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/onboarding/turso", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          usuario: String(form.get("usuario") ?? ""),
          password: String(form.get("password") ?? ""),
          confirmation: String(form.get("confirmation") ?? ""),
        }),
      });
      if (response.ok) {
        router.push("/onboarding/listo");
        return;
      }
      const result = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(result?.error ?? "No se pudo crear el perfil. Inténtalo de nuevo.");
    } catch {
      setError("No se pudo conectar con el servidor. Inténtalo de nuevo.");
    }
    setPending(false);
  }

  return (
    <form
      aria-label="Crear perfil en Turso"
      className="flex w-full flex-col items-center"
      onInput={validateConfirmation}
      onSubmit={handleSubmit}
    >
      <div className="flex w-full flex-col gap-4">
        {[
          {
            id: "turso-username",
            label: "Usuario",
            name: "usuario",
            value: "",
            type: "text",
            autoComplete: "username",
            ref: firstName,
          },
        ].map((field) => (
          <div
            key={field.id}
            className="flex w-full flex-col items-start gap-[5px]"
          >
            <label
              htmlFor={field.id}
              className="text-[11px] font-semibold leading-[normal] text-[var(--muted)]"
            >
              {field.label}
            </label>
            <div className={`${FIELD_CLASS} !pr-[10px]`}>
              <input
                id={field.id}
                ref={field.ref}
                name={field.name}
                type={field.type}
                required
                disabled={pending}
                pattern={".*\\S.*"}
                autoFocus={field.name === "usuario"}
                autoComplete={field.autoComplete}
                defaultValue={field.value}
                className={INPUT_CLASS}
              />
            </div>
          </div>
        ))}
        {[
          {
            id: "turso-profile-password",
            label: "Contraseña",
            name: "password",
            placeholder: "Escribe tu contraseña",
            ref: password,
            visible: showPassword,
            setVisible: setShowPassword,
          },
          {
            id: "turso-profile-confirmation",
            label: "Confirmar contraseña",
            name: "confirmation",
            placeholder: "Repite tu contraseña",
            ref: confirmation,
            visible: showConfirmation,
            setVisible: setShowConfirmation,
          },
        ].map((field) => (
          <div
            key={field.id}
            className="flex w-full flex-col items-start gap-[5px]"
          >
            <label
              htmlFor={field.id}
              className="text-[11px] font-semibold leading-[normal] text-[var(--muted)]"
            >
              {field.label}
            </label>
            <div className={FIELD_CLASS}>
              <input
                id={field.id}
                ref={field.ref}
                name={field.name}
                type={field.visible ? "text" : "password"}
                required
                disabled={pending}
                minLength={8}
                autoComplete="new-password"
                placeholder={field.placeholder}
                aria-describedby={
                  field.name === "password"
                    ? "turso-password-requirement"
                    : undefined
                }
                className={INPUT_CLASS}
              />
              <button
                type="button"
                aria-label={`${field.visible ? "Ocultar" : "Mostrar"} ${field.label.toLowerCase()}`}
                aria-pressed={field.visible}
                aria-controls={field.id}
                onClick={() => field.setVisible((visible) => !visible)}
                className="flex size-7 shrink-0 items-center justify-center rounded-[5px] text-[var(--muted)] hover:text-[var(--foreground)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#007AFF]"
              >
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
                  <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
                  <circle cx="12" cy="12" r="3" />
                  {field.visible && <path d="m3 3 18 18" />}
                </svg>
              </button>
            </div>
            {field.name === "password" && (
              <p
                id="turso-password-requirement"
                className="w-full text-[11.5px] leading-[17px] text-[var(--muted)]"
              >
                Mínimo 8 caracteres.
              </p>
            )}
          </div>
        ))}
      </div>
      {error && (
        <p role="alert" className="mt-4 w-full text-[12px] leading-[18px] text-[#c2413a]">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="mt-6 inline-flex w-fit items-center justify-center rounded-[7px] bg-[#007AFF] px-[11px] py-[5px] text-[12px] font-semibold leading-[normal] text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#007AFF] disabled:opacity-60"
      >
        {pending ? "Creando perfil…" : "Crear perfil"}
      </button>
    </form>
  );
}
