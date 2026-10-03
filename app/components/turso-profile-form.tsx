"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

const INPUT_CLASS =
  "h-full min-w-0 flex-1 bg-transparent p-0 text-[12.5px] font-normal leading-[normal] text-[var(--foreground)] caret-[#007AFF] outline-none placeholder:text-[var(--foreground)] placeholder:opacity-100";
const FIELD_CLASS =
  "flex h-[34px] w-full items-center gap-[6px] rounded-[7px] bg-[var(--surface)] pl-[10px] pr-[3px] outline outline-1 -outline-offset-[0.5px] outline-[var(--border)] has-[input:focus]:shadow-[0px_0px_3px_#007AFF33] has-[input:focus]:outline-2 has-[input:focus]:-outline-offset-[1px] has-[input:focus]:outline-[#007AFF]";

export function TursoProfileForm() {
  const firstName = useRef<HTMLInputElement>(null);
  const password = useRef<HTMLInputElement>(null);
  const confirmation = useRef<HTMLInputElement>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    const input = firstName.current;
    if (input) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  }, []);

  function validateConfirmation() {
    confirmation.current?.setCustomValidity(
      confirmation.current.value &&
        confirmation.current.value !== password.current?.value
        ? "Las contraseñas deben coincidir."
        : "",
    );
    setStatus("");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(
      "Turso aún no está integrado; no se han enviado datos ni guardado tu perfil.",
    );
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
          { id: "turso-first-name", label: "Nombre", name: "givenName", value: "Alexander", autoComplete: "given-name", ref: firstName },
          { id: "turso-last-name", label: "Apellido", name: "familyName", value: "Molina", autoComplete: "family-name", ref: undefined },
        ].map((field) => (
          <div key={field.id} className="flex w-full flex-col items-start gap-[5px]">
            <label htmlFor={field.id} className="text-[11px] font-semibold leading-[normal] text-[var(--muted)]">
              {field.label}
            </label>
            <div className={`${FIELD_CLASS} !pr-[10px]`}>
              <input
                id={field.id}
                ref={field.ref}
                name={field.name}
                type="text"
                required
                pattern={".*\\S.*"}
                autoFocus={field.name === "givenName"}
                autoComplete={field.autoComplete}
                defaultValue={field.value}
                className={INPUT_CLASS}
              />
            </div>
          </div>
        ))}
        {[
          { id: "turso-profile-password", label: "Contraseña", name: "password", ref: password, visible: showPassword, setVisible: setShowPassword },
          { id: "turso-profile-confirmation", label: "Confirmar contraseña", name: "confirmation", ref: confirmation, visible: showConfirmation, setVisible: setShowConfirmation },
        ].map((field) => (
          <div key={field.id} className="flex w-full flex-col items-start gap-[5px]">
            <label htmlFor={field.id} className="text-[11px] font-semibold leading-[normal] text-[var(--muted)]">
              {field.label}
            </label>
            <div className={FIELD_CLASS}>
              <input
                id={field.id}
                ref={field.ref}
                name={field.name}
                type={field.visible ? "text" : "password"}
                required
                minLength={8}
                autoComplete="new-password"
                placeholder={"•".repeat(16)}
                aria-describedby={field.name === "password" ? "turso-password-requirement" : undefined}
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
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-[14px]" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8">
                  <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
                  <circle cx="12" cy="12" r="3" />
                  {field.visible && <path d="m3 3 18 18" />}
                </svg>
              </button>
            </div>
            {field.name === "password" && (
              <p id="turso-password-requirement" className="w-full text-[11.5px] leading-[17px] text-[var(--muted)]">
                Mínimo 8 caracteres.
              </p>
            )}
          </div>
        ))}
      </div>
      <button
        type="submit"
        className="mt-6 inline-flex w-fit items-center justify-center rounded-[7px] bg-[#007AFF] px-[11px] py-[5px] text-[12px] font-semibold leading-[normal] text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#007AFF]"
      >
        Crear perfil
      </button>
      <p role="status" aria-live="polite" className={status ? "mt-3 w-full text-center text-[11.5px] leading-[17px] text-[var(--muted)]" : "sr-only"}>
        {status}
      </p>
    </form>
  );
}
