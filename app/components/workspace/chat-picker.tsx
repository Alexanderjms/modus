"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import styles from "./chat-picker.module.css";
import { Skeleton } from "../skeleton";

export type ChatPickerOption = {
  value: string;
  label: string;
  color?: string | null;
  detail?: string;
  icon?: string;
  invertInDark?: boolean;
  disabled?: boolean;
  badge?: "FREE";
};

function FreeBadge() {
  return <span className={styles.freeBadge}><i aria-hidden="true" /><span>FREE</span></span>;
}

function placePopover(trigger: HTMLElement, popover: HTMLElement) {
  const rect = trigger.getBoundingClientRect();
  const width = Math.min(Math.max(rect.width, 224), window.innerWidth - 24);
  popover.style.width = `${width}px`;
  const height = popover.offsetHeight;
  const below = window.innerHeight - rect.bottom - 8;
  const above = rect.top - 8;
  const placeBelow = below >= height || (below >= above && below > 0);
  popover.style.left = `${Math.max(
    12,
    Math.min(rect.left, window.innerWidth - width - 12),
  )}px`;
  popover.style.top = `${Math.max(
    12,
    Math.min(
      placeBelow ? rect.bottom + 8 : rect.top - height - 8,
      window.innerHeight - height - 12,
    ),
  )}px`;
}

export function ChatPicker({
  label,
  value,
  options,
  onChange,
  disabled = false,
  action,
  loading = false,
  size = "compact",
  multipleValues,
  onMultipleChange,
  footer,
  suspended = false,
  emptyLabel,
}: {
  label: string;
  value: string;
  options: ChatPickerOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  action?: { label: string; onSelect: () => void; disabled?: boolean };
  loading?: boolean;
  size?: "compact" | "form";
  multipleValues?: string[];
  onMultipleChange?: (values: string[]) => void;
  footer?: ReactNode;
  suspended?: boolean;
  emptyLabel?: string;
}) {
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const filtered = options.filter(({ label: optionLabel, detail, badge }) =>
    `${optionLabel} ${detail ?? ""} ${badge ?? ""}`
      .toLocaleLowerCase("es")
      .includes(query.trim().toLocaleLowerCase("es")),
  );
  const selected = multipleValues === undefined ? options.find((option) => option.value === value) : undefined;
  const searchName = label.replace(/^Seleccionar /, "").toLocaleLowerCase("es");
  const selectedIndex = Math.max(0, filtered.findIndex((option) => multipleValues === undefined
    ? option.value === value
    : multipleValues.includes(option.value)));

  function position() {
    if (triggerRef.current && popoverRef.current) placePopover(triggerRef.current, popoverRef.current);
  }

  function show(keyboard = false) {
    const popover = popoverRef.current;
    if (!popover) return;
    if (!popover.matches(":popover-open")) popover.showPopover();
    setOpen(true);
    position();
    requestAnimationFrame(() => {
      if (keyboard) focusOption(selectedIndex);
      else optionRefs.current[selectedIndex]?.scrollIntoView({ block: "nearest" });
    });
  }

  function close(restoreFocus = false) {
    if (popoverRef.current?.matches(":popover-open")) popoverRef.current.hidePopover();
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }

  function focusOption(index: number) {
    const target = index >= 0 && !filtered[index]?.disabled
      ? index
      : filtered.findIndex((option) => !option.disabled);
    optionRefs.current[target]?.focus();
  }

  useEffect(() => {
    if (!suspended) return;
    if (popoverRef.current?.matches(":popover-open")) popoverRef.current.hidePopover();
    setOpen(false);
  }, [suspended]);

  useEffect(() => {
    if (!open) return;
    position();
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [open]);

  function selectOption(option: ChatPickerOption) {
    if (multipleValues !== undefined) {
      if (option.disabled) return;
      onMultipleChange?.(multipleValues.includes(option.value)
        ? multipleValues.filter((selectedValue) => selectedValue !== option.value)
        : [...multipleValues, option.value]);
      return;
    }
    onChange(option.value);
    close(true);
  }

  function navigate(event: KeyboardEvent<HTMLElement>) {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const enabled = filtered.flatMap((option, index) => option.disabled ? [] : [index]);
    if (!enabled.length) return;
    event.preventDefault();
    const current = optionRefs.current.indexOf(document.activeElement as HTMLButtonElement);
    const currentPosition = enabled.indexOf(current);
    const next = event.key === "Home" ? enabled[0]
      : event.key === "End" ? enabled.at(-1)!
        : currentPosition < 0 ? event.key === "ArrowDown" ? enabled[0] : enabled.at(-1)!
          : enabled[(currentPosition + (event.key === "ArrowDown" ? 1 : -1) + enabled.length) % enabled.length];
    optionRefs.current[next]?.focus();
  }

  return (
      <div className={`${styles.picker} ${size === "form" ? styles.form : ""}`}>
      <button
        ref={triggerRef}
        type="button"
        className={`${styles.trigger} ${open ? styles.expanded : ""}`}
        aria-label={`${label}: ${
          loading ? "Cargando" : multipleValues !== undefined
            ? multipleValues.length ? `${multipleValues.length} seleccionadas` : "Seleccionar"
            : `${selected?.label ?? (value ? "No disponible" : "Seleccionar")}${selected?.badge ? `, ${selected.badge}` : ""}`
        }`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-menu`}
        aria-busy={loading || undefined}
        disabled={disabled}
        onClick={() => open ? close() : show()}
        onKeyDown={(event) => {
          if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key) && !open) {
            event.preventDefault();
            show(true);
          } else if (open && ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
            event.preventDefault();
            const enabled = filtered.flatMap((option, index) => option.disabled ? [] : [index]);
            focusOption(
              event.key === "Home"
                ? enabled[0]
                : event.key === "End"
                  ? enabled.at(-1) ?? -1
                  : selectedIndex,
            );
          }
        }}
      >
        <span className={styles.triggerContent}>
          {loading ? (
            <Skeleton variant="text" width={92} />
          ) : (
            <>
              {selected?.color && <span className={styles.colorDot} style={{ backgroundColor: selected.color }} aria-hidden="true" />}
              {selected?.icon && (
                <img
                  className={selected.invertInDark ? styles.invertInDark : ""}
                  src={selected.icon}
                  alt=""
                  aria-hidden="true"
                />
              )}
              <span className={styles.triggerLabel}>
                {multipleValues !== undefined
                  ? multipleValues.length
                    ? `${multipleValues.length} seleccionadas`
                    : "Seleccionar"
                  : selected?.label ?? (value ? "Opción no disponible" : "Seleccionar")}
              </span>
              {selected?.badge && <FreeBadge />}
            </>
          )}
        </span>
        <i aria-hidden="true" className="bi bi-chevron-down" />
      </button>
      <div
        ref={popoverRef}
        id={`${id}-menu`}
        className={styles.menu}
        popover="auto"
        onToggle={(event) => {
          const isOpen = event.currentTarget.matches(":popover-open");
          setOpen(isOpen);
          if (!isOpen && popoverRef.current?.contains(document.activeElement)) {
            triggerRef.current?.focus();
          }
        }}
        onKeyDown={navigate}
        onBlurCapture={(event) => {
          if (
            event.relatedTarget instanceof Node &&
            !popoverRef.current?.contains(event.relatedTarget)
          ) {
            close();
          }
        }}
      >
        <label className={styles.search}>
          <i aria-hidden="true" className="bi bi-search" />
          <input
            type="search"
            aria-label={`Buscar ${searchName}`}
            placeholder={`Buscar ${searchName}…`}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && filtered.length === 1 && !filtered[0].disabled) {
                event.preventDefault();
                selectOption(filtered[0]);
              }
            }}
          />
        </label>
        <div className={styles.options} role="listbox" aria-label={label} aria-multiselectable={multipleValues !== undefined || undefined}>
          {filtered.map((option, index) => {
            const isSelected = multipleValues === undefined
              ? option.value === value
              : multipleValues.includes(option.value);
            return (
              <button
                key={option.value}
                ref={(button) => { optionRefs.current[index] = button; }}
                type="button"
                role="option"
                aria-selected={isSelected}
                aria-disabled={option.disabled || undefined}
                disabled={option.disabled}
                tabIndex={index === selectedIndex ? 0 : -1}
                className={styles.option}
                onClick={() => selectOption(option)}
              >
                {option.icon && (
                  <img
                    className={option.invertInDark ? styles.invertInDark : ""}
                    src={option.icon}
                    alt=""
                    aria-hidden="true"
                  />
                )}
                {option.color && <span className={styles.colorDot} style={{ backgroundColor: option.color }} aria-hidden="true" />}
                <span className={styles.optionText}>
                  <span>{option.label}</span>
                  {option.detail && <small>{option.detail}</small>}
                </span>
                {option.badge && <FreeBadge />}
                {isSelected && <i aria-hidden="true" className="bi bi-check2" />}
              </button>
            );
          })}
          {!filtered.length && <p className={styles.empty}>{options.length ? "Sin coincidencias." : emptyLabel ?? "Sin coincidencias."}</p>}
        </div>
        {action && (
          <div className={styles.actionWrap}>
            <button
              type="button"
              className={styles.action}
              disabled={action.disabled}
              onClick={() => {
                action.onSelect();
                close(true);
              }}
            >
              <i aria-hidden="true" className="bi bi-plus-lg" />
              <span>{action.label}</span>
            </button>
          </div>
        )}
        {footer}
      </div>
    </div>
  );
}
