"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import styles from "./turso-guide.module.css";

const INPUT_CLASS =
  "h-[34px] w-full rounded-[7px] bg-[var(--surface)] px-[10px] py-0 text-[12.5px] leading-[normal] text-[var(--foreground)] caret-[#007AFF] outline outline-1 -outline-offset-[0.5px] outline-[var(--border)] focus:shadow-[0px_0px_3px_#007AFF33] focus:outline-2 focus:-outline-offset-[1px] focus:outline-[#007AFF]";

export function LocalProfileForm() {
  const router = useRouter();
  const nameInput = useRef<HTMLInputElement>(null);
  const pinFields = useRef<HTMLFieldSetElement>(null);
  const [pinEnabled, setPinEnabled] = useState(false);

  useEffect(() => {
    const input = nameInput.current;
    if (input) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  }, []);

  useEffect(() => {
    const inputs = pinFields.current?.querySelectorAll("input");
    if (pinEnabled) inputs?.[0]?.focus({ preventScroll: true });
    else
      inputs?.forEach((input) => {
        input.value = "";
      });
  }, [pinEnabled]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    router.push("/onboarding/local/preparando");
  }

  return (
    <form
      onSubmit={handleSubmit}
      aria-label="Perfil local"
      className="flex w-full flex-col items-center gap-6"
    >
      <div className="flex w-full flex-col items-start gap-[5px]">
        <label
          htmlFor="local-profile-name"
          className="text-[11px] font-semibold leading-[normal] text-[var(--muted)]"
        >
          Nombre
        </label>
        <input
          ref={nameInput}
          id="local-profile-name"
          name="name"
          type="text"
          required
          pattern={".*\\S.*"}
          autoComplete="given-name"
          defaultValue="Alexander"
          onChange={(event) => {
            event.currentTarget.setCustomValidity(
              event.currentTarget.value.trim() ? "" : "Introduce tu nombre.",
            );
          }}
          className={INPUT_CLASS}
        />
      </div>

      <div className="flex w-full flex-col items-start">
        <p className="mb-2 text-[11px] font-semibold leading-[normal] text-[var(--muted)]">
          Protección local
        </p>
        <div className="flex w-full items-center gap-[10px]">
          <button
            type="button"
            role="switch"
            aria-checked={pinEnabled}
            aria-labelledby="local-pin-label"
            aria-describedby="local-pin-help"
            aria-controls="local-pin-fields"
            onClick={() => setPinEnabled((enabled) => !enabled)}
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
              Proteger Modus con un PIN
            </p>
            <p
              id="local-pin-help"
              className="text-[11.5px] leading-[normal] text-[var(--muted)]"
            >
              Solicitar un PIN al abrir Modus.
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
              ref={pinFields}
              disabled={!pinEnabled}
              aria-label="Configura tu PIN"
              className="flex w-full flex-col gap-4 pb-px pt-6"
            >
              <div className="flex w-full flex-col gap-[5px]">
                <label
                  htmlFor="local-pin"
                  className="text-[11px] font-semibold leading-[normal] text-[var(--muted)]"
                >
                  PIN
                </label>
                <input
                  id="local-pin"
                  type="password"
                  inputMode="numeric"
                  autoComplete="new-password"
                  placeholder="Introduce tu PIN"
                  className={INPUT_CLASS}
                />
              </div>
              <div className="flex w-full flex-col gap-[5px]">
                <label
                  htmlFor="local-pin-confirmation"
                  className="text-[11px] font-semibold leading-[normal] text-[var(--muted)]"
                >
                  Confirmar PIN
                </label>
                <input
                  id="local-pin-confirmation"
                  type="password"
                  inputMode="numeric"
                  autoComplete="new-password"
                  placeholder="Repite tu PIN"
                  className={INPUT_CLASS}
                />
              </div>
            </fieldset>
          </div>
        </div>
      </div>

      <button
        type="submit"
        className="inline-flex w-fit items-center justify-center rounded-[7px] bg-[#007AFF] px-[11px] py-[5px] text-[12px] font-semibold leading-[normal] text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#007AFF]"
      >
        Continuar
      </button>
    </form>
  );
}
