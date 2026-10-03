"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import logo from "../public/Logo.png";

const stages = [
  "Preparando el entorno local…",
  "Preparando el espacio de almacenamiento…",
  "Configurando el perfil local…",
  "Finalizando la preparación…",
  "Preparación de demostración completada.",
];

export function LocalStoragePreparation() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const progress = step * 25;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (step === stages.length - 1) router.replace("/onboarding/listo");
      else setStep(step + 1);
    }, 900);
    return () => window.clearTimeout(timer);
  }, [step, router]);

  return (
    <section
      aria-labelledby="preparing-title"
      className="relative z-10 flex w-full max-w-[400px] flex-col items-center gap-5 text-center"
    >
      <Image
        src={logo}
        alt="Modus"
        width={32}
        height={32}
        priority
        className={`size-8 object-contain ${progress < 100 ? "motion-safe:animate-pulse [animation-timing-function:linear]" : ""}`}
      />
      <div className="flex w-full flex-col gap-2">
        <div
          role="progressbar"
          aria-label="Demostración de preparación del almacenamiento local"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
          aria-valuetext={`${progress}% — ${stages[step]}`}
          className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--toggle-track)]"
        >
          <div
            className="h-full w-full rounded-full bg-[#007AFF] transition-transform duration-200 ease-linear motion-reduce:transition-none"
            style={{ transform: `translateX(${progress - 100}%)` }}
          />
        </div>
        <div className="flex items-start justify-between gap-3 text-left text-[11.5px] leading-[17px] text-[var(--muted)]">
          <span role="status" aria-atomic="true">
            {stages[step]}
          </span>
          <span className="shrink-0 tabular-nums">{progress}%</span>
        </div>
      </div>
      <h1
        id="preparing-title"
        className="w-full text-xl font-bold leading-[normal] tracking-[-0.3px]"
      >
        Preparando almacenamiento
      </h1>
    </section>
  );
}
