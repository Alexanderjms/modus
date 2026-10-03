"use client";

import { useState } from "react";
import styles from "./turso-guide.module.css";

const steps = [
  {
    title: "Crea una cuenta o inicia sesión",
    description: "Abre el panel de Turso. Regístrate si aún no tienes una cuenta; si ya tienes una, inicia sesión.",
  },
  {
    title: "Crea una base de datos libSQL",
    description: "En el panel web, crea una base de datos y ponle un nombre. Si te pregunta el tipo, elige libSQL. Esta pantalla necesita una dirección que empiece por libsql://.",
  },
  {
    title: "Copia el Database URL",
    description: "Abre la página de esa base y copia Database URL desde sus opciones de conexión. Debe empezar por libsql://. No copies la dirección que aparece en la barra del navegador.",
  },
  {
    title: "Busca o crea un Auth Token",
    description: "En esa misma página, abre la sección de tokens y crea uno para esta base de datos. Cópialo cuando aparezca y guárdalo como una contraseña. No lo compartas ni lo publiques.",
  },
  {
    title: "Pega las credenciales aquí",
    description: "Pega la dirección en Database URL y el token en Auth Token. El botón Probar conexión aún no valida la conexión con Turso ni envía tus credenciales.",
  },
];

export function TursoGuide() {
  const [openStep, setOpenStep] = useState<number | null>(0);

  return (
    <aside className="box-border w-full border-t border-[var(--divider-soft)] pt-8 min-[1024px]:w-[430px] min-[1024px]:border-l min-[1024px]:border-t-0 min-[1024px]:pl-[22px] min-[1024px]:pt-0">
      <div className="flex w-full flex-col gap-6">
        <header className="flex w-full flex-col items-start gap-2">
          <h2 className="text-[15px] font-semibold leading-[19px]">¿Primera vez en Turso?</h2>
          <p className="text-[12.5px] leading-[18px] text-[var(--muted)]">
            Sigue estos pasos en el panel web de Turso. No necesitas usar la terminal.
          </p>
        </header>
        <ol aria-label="Pasos para obtener tus credenciales" className="relative flex w-full list-none flex-col gap-4 before:absolute before:bottom-[10px] before:left-[9.5px] before:top-[10px] before:w-px before:bg-[var(--divider)] before:opacity-[0.55]">
          {steps.map((step, index) => {
            const isOpen = openStep === index;
            return (
              <li key={step.title} className="relative flex w-full items-start gap-3">
                <span aria-hidden="true" className={`flex size-5 shrink-0 items-center justify-center rounded-full text-[10.5px] font-semibold outline outline-1 -outline-offset-[0.5px] ${isOpen ? "bg-[#007AFF] text-white outline-[#007AFF]" : "bg-[var(--page)] text-[var(--muted)] outline-[var(--border)]"}`}>
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <button
                    id={`turso-step-${index}-trigger`}
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={`turso-step-${index}-panel`}
                    onClick={() => setOpenStep(isOpen ? null : index)}
                    className="flex w-full items-center gap-2 rounded-sm text-left text-[12.5px] font-semibold leading-[17px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#007AFF]"
                  >
                    <span className="min-w-0 flex-1">{step.title}</span>
                    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" data-open={isOpen} className={`${styles.chevron} size-[14px] shrink-0 text-[var(--muted)]`}>
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </button>
                  <div
                    id={`turso-step-${index}-panel`}
                    role="region"
                    aria-labelledby={`turso-step-${index}-trigger`}
                    aria-hidden={!isOpen}
                    inert={!isOpen}
                    data-open={isOpen}
                    className={styles.panel}
                  >
                    <div className="min-h-0 overflow-hidden">
                      <div className="flex flex-col items-start gap-[6px] pt-[6px] text-[11.5px] leading-[17px] text-[var(--muted)]">
                        <p>{step.description}</p>
                        {index === 0 && (
                          <a href="https://app.turso.tech/" target="_blank" rel="noreferrer" className="inline-flex min-h-[26px] items-center gap-[5px] rounded-[7px] bg-[var(--surface)] px-[11px] py-[5px] text-xs font-medium leading-4 text-[var(--foreground)] outline outline-1 -outline-offset-[0.5px] outline-[var(--divider)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#007AFF]">
                            Abrir Turso
                            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-3 text-[var(--muted)]">
                              <path d="M14 5h5v5m0-5-8 8M19 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" />
                            </svg>
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </aside>
  );
}
