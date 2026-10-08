"use client";

import { useRouter } from "next/navigation";
import { useT } from "../i18n/provider";

export function OnboardingBackButton() {
  const t = useT();
  const router = useRouter();

  return (
    <button
      type="button"
      aria-label={t("Volver atrás")}
      title={t("Volver atrás")}
      onClick={() =>
        window.history.length > 1 ? router.back() : router.push("/")
      }
      className="relative flex size-8 shrink-0 self-start items-center justify-center rounded-[6px] text-[var(--muted)] before:absolute before:-inset-[6px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#007AFF] min-[1024px]:absolute min-[1024px]:-top-16 min-[1024px]:left-0 min-[1200px]:-left-16"
    >
      <i
        aria-hidden="true"
        className="bi bi-arrow-left text-[14px] leading-none"
      />
    </button>
  );
}
