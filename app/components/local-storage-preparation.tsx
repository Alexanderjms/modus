"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import logo from "../public/Logo.png";

export function LocalStoragePreparation({
  progress,
  message,
}: {
  progress: number;
  message: string;
}) {
  const title = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    title.current?.focus();
  }, []);

  return (
    <section
      aria-labelledby="preparing-title"
      aria-busy="true"
      className="relative z-10 flex w-full max-w-[400px] flex-col items-center gap-5 text-center"
    >
      <Image
        src={logo}
        alt="Modus"
        width={32}
        height={32}
        priority
        className="size-8 object-contain"
      />
      <h1
        ref={title}
        id="preparing-title"
        tabIndex={-1}
        className="w-full text-xl font-bold leading-[normal] tracking-[-0.3px]"
      >
        Preparando almacenamiento
      </h1>
      <div className="flex w-full flex-col gap-2">
        <div
          role="progressbar"
          aria-label="Progreso de creación del almacenamiento local"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
          aria-valuetext={`${progress}% — ${message}`}
          className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--toggle-track)]"
        >
          <div
            className="h-full w-full rounded-full bg-[#007AFF] transition-transform duration-200 ease-linear motion-reduce:transition-none"
            style={{ transform: `translateX(${progress - 100}%)` }}
          />
        </div>
        <div className="flex items-start justify-between gap-3 text-left text-[11.5px] leading-[17px] text-[var(--muted)]">
          <span role="status" aria-live="polite" aria-atomic="true">
            {message}
          </span>
          <span className="shrink-0 tabular-nums">{progress}%</span>
        </div>
      </div>
    </section>
  );
}
