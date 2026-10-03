"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BootstrapFillIcon } from "./bootstrap-fill-icon";

type StorageLocation = "local" | "turso";

type StorageOptionProps = {
  value: StorageLocation;
  label: string;
  description: string;
  selected: boolean;
  onSelect: (value: StorageLocation) => void;
};

function StorageOption({
  value,
  label,
  description,
  selected,
  onSelect,
}: StorageOptionProps) {
  return (
    <label className="relative min-w-0 flex-1 cursor-pointer">
      <input
        type="radio"
        name="storage-location"
        value={value}
        checked={selected}
        onChange={() => onSelect(value)}
        aria-labelledby={`${value}-label`}
        aria-describedby={`${value}-description`}
        className="peer sr-only"
      />
      <span className="relative flex h-[148px] flex-col items-center justify-center gap-3 rounded-[10px] bg-[var(--surface)] px-4 py-6 text-[var(--muted)] shadow-[0px_1px_2px_#0000000A] transition-[background-color,color,outline-color] duration-[160ms] ease-[cubic-bezier(0.23,1,0.32,1)] outline outline-1 -outline-offset-[0.5px] outline-[var(--card-border)] peer-checked:bg-[var(--selected)] peer-checked:text-[#007AFF] peer-checked:outline-[#007AFF] peer-focus-visible:ring-2 peer-focus-visible:ring-[#007AFF] peer-focus-visible:ring-offset-4 peer-focus-visible:ring-offset-[var(--page)] motion-reduce:duration-[125ms] sm:px-6">
        <BootstrapFillIcon
          name={value === "local" ? "hdd" : "cloud"}
          className="text-xl leading-none"
        />
        <span className="flex w-full flex-col items-center gap-[5px] [line-height:normal]">
          <span
            id={`${value}-label`}
            className="whitespace-nowrap text-[12.5px] font-semibold text-[var(--foreground)]"
          >
            {label}
          </span>
          <span
            id={`${value}-description`}
            className="whitespace-nowrap text-[11.5px] font-normal text-[var(--muted)]"
          >
            {description}
          </span>
        </span>
      </span>
      <BootstrapFillIcon
        name="check-circle"
        className="pointer-events-none absolute right-4 top-3 text-base leading-none text-[#007AFF] opacity-0 transition-opacity duration-[160ms] ease-[cubic-bezier(0.23,1,0.32,1)] peer-checked:opacity-100 motion-reduce:duration-[125ms]"
      />
    </label>
  );
}

export function StorageSelection() {
  const [storage, setStorage] = useState<StorageLocation>("local");
  const router = useRouter();

  return (
    <div className="flex w-full flex-col items-center gap-6">
      <fieldset
        aria-labelledby="storage-question"
        className="flex w-full gap-4"
      >
        <StorageOption
          value="local"
          label="Local"
          description="En este dispositivo"
          selected={storage === "local"}
          onSelect={setStorage}
        />
        <StorageOption
          value="turso"
          label="Turso"
          description="En la nube"
          selected={storage === "turso"}
          onSelect={setStorage}
        />
      </fieldset>
      <button
        type="button"
        onClick={() => {
          router.push(
            storage === "turso" ? "/onboarding/turso" : "/onboarding/local",
          );
        }}
        className="rounded-[7px] bg-[#007AFF] px-[11px] py-[5px] text-xs font-semibold text-white [line-height:normal] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#007AFF]"
      >
        Continuar
      </button>
    </div>
  );
}
