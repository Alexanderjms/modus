"use client";

import styles from "../turso-guide.module.css";
import { useT } from "../../i18n/provider";

export function TursoGuideStep({
  index,
  title,
  description,
  isOpen,
  onToggle,
}: {
  index: number;
  title: string;
  description: string;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const t = useT();
  return (
    <li className="relative flex w-full items-start gap-3">
      <span
        aria-hidden="true"
        className={`flex size-5 shrink-0 items-center justify-center rounded-full text-[10.5px] font-semibold outline outline-1 -outline-offset-[0.5px] ${isOpen ? "bg-[#007AFF] text-white outline-[#007AFF]" : "bg-[var(--page)] text-[var(--muted)] outline-[var(--border)]"}`}
      >
        {index + 1}
      </span>
      <div className="min-w-0 flex-1">
        <button
          id={`turso-step-${index}-trigger`}
          type="button"
          aria-expanded={isOpen}
          aria-controls={`turso-step-${index}-panel`}
          onClick={onToggle}
          className="flex w-full items-center gap-2 rounded-sm text-left text-[12.5px] font-semibold leading-[17px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#007AFF]"
        >
          <span className="min-w-0 flex-1">{title}</span>
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            data-open={isOpen}
            className={`${styles.chevron} size-[14px] shrink-0 text-[var(--muted)]`}
          >
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
              <p>{description}</p>
              {index === 0 && (
                <a
                  href="https://app.turso.tech/"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-[26px] items-center gap-[5px] rounded-[7px] bg-[var(--surface)] px-[11px] py-[5px] text-xs font-medium leading-4 text-[var(--foreground)] outline outline-1 -outline-offset-[0.5px] outline-[var(--divider)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#007AFF]"
                >
                  {t("Abrir Turso")}
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="size-3 text-[var(--muted)]"
                  >
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
}
