"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { addCalendarDays, calendarGrid, formatCalendarDate, parseCalendarDate } from "./date-picker-date.mjs";
import styles from "./date-picker.module.css";
import { DateCalendarHeader, type SelectorMenu } from "./date-calendar-header";
import { DateCalendarGrid } from "./date-calendar-grid";

const monthNames = Array.from({ length: 12 }, (_, month) =>
  new Intl.DateTimeFormat("es", { month: "long", timeZone: "UTC" })
    .format(parseCalendarDate(`2024-${String(month + 1).padStart(2, "0")}-01`)!),
);

export function DatePicker({
  label,
  value,
  onChange,
  min,
  max,
  disabled = false,
  suspended = false,
  invalid = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  disabled?: boolean;
  suspended?: boolean;
  invalid?: boolean;
}) {
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const monthTriggerRef = useRef<HTMLButtonElement>(null);
  const yearTriggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => dateParts(parseCalendarDate(value) ?? todayDate()));
  const [focusDate, setFocusDate] = useState(() => value || todayString());
  const [selectorMenu, setSelectorMenu] = useState<SelectorMenu | null>(null);
  const [selectorIndex, setSelectorIndex] = useState(0);
  const selectedDate = parseCalendarDate(value) ? value : "";
  const minimum = parseCalendarDate(min ?? "") ? min! : "";
  const maximum = parseCalendarDate(max ?? "") ? max! : "";
  const today = todayString();
  const dates = calendarGrid(view.year, view.month);
  const yearOptions = [...new Set([
    ...Array.from({ length: 21 }, (_, index) => view.year + index - 10),
    Number(today.slice(0, 4)),
    minimum ? Number(minimum.slice(0, 4)) : 0,
    maximum ? Number(maximum.slice(0, 4)) : 0,
  ])].filter((year) => year > 0 && year <= 9999).sort((a, b) => a - b);

  useEffect(() => {
    if (!open) return;
    positionPopover();
    const resize = () => positionPopover();
    window.addEventListener("resize", resize);
    window.addEventListener("scroll", resize, true);
    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("scroll", resize, true);
    };
  }, [open]);

  useEffect(() => {
    if (!suspended && !disabled) return;
    if (popoverRef.current?.matches(":popover-open")) popoverRef.current.hidePopover();
    setSelectorMenu(null);
    setOpen(false);
  }, [disabled, suspended]);

  function positionPopover() {
    const trigger = triggerRef.current;
    const popover = popoverRef.current;
    if (!trigger || !popover) return;
    const rect = trigger.getBoundingClientRect();
    const width = Math.min(304, window.innerWidth - 24);
    popover.style.width = `${width}px`;
    const height = popover.offsetHeight;
    const below = window.innerHeight - rect.bottom - 8;
    const above = rect.top - 8;
    const placeBelow = below >= height || (below >= above && below > 0);
    popover.style.left = `${Math.max(12, Math.min(rect.left, window.innerWidth - width - 12))}px`;
    popover.style.top = `${Math.max(12, Math.min(placeBelow ? rect.bottom + 8 : rect.top - height - 8, window.innerHeight - height - 12))}px`;
  }

  function show(keyboard = false) {
    let anchorString = selectedDate || today;
    if (!isAvailable(anchorString)) anchorString = minimum && anchorString < minimum ? minimum : maximum;
    const anchor = parseCalendarDate(anchorString) ?? todayDate();
    anchorString = formatCalendarDate(anchor);
    const nextView = dateParts(anchor);
    const nextFocus = isAvailable(anchorString) ? anchorString : firstAvailableDate(nextView.year, nextView.month);
    setSelectorMenu(null);
    setView(nextView);
    setFocusDate(nextFocus);
    if (!popoverRef.current?.matches(":popover-open")) popoverRef.current?.showPopover();
    setOpen(true);
    requestAnimationFrame(() => {
      positionPopover();
      if (keyboard) popoverRef.current?.querySelector<HTMLButtonElement>(`[data-date="${nextFocus}"]`)?.focus();
    });
  }

  function close(restoreFocus = false) {
    if (popoverRef.current?.matches(":popover-open")) popoverRef.current.hidePopover();
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }

  function toggleSelector(menu: SelectorMenu, keyboard = false) {
    if (selectorMenu === menu) {
      setSelectorMenu(null);
      return;
    }
    const index = menu === "month" ? view.month : yearOptions.indexOf(view.year);
    setSelectorIndex(index);
    setSelectorMenu(menu);
    if (keyboard) focusSelectorOption(menu, index);
  }

  function focusSelectorOption(menu: SelectorMenu, index: number) {
    requestAnimationFrame(() => popoverRef.current?.querySelector<HTMLButtonElement>(`[data-menu-option="${menu}-${index}"]`)?.focus());
  }

  function navigateSelector(event: KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const options = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("[role=option]:not(:disabled)"));
    if (!options.length) return;
    event.preventDefault();
    const current = options.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === "Home" ? 0
      : event.key === "End" ? options.length - 1
        : current < 0 ? event.key === "ArrowDown" ? 0 : options.length - 1
          : (current + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length;
    options[next]?.focus();
  }

  function chooseMonth(month: number) {
    changeMonth(view.year, month);
    setSelectorMenu(null);
    monthTriggerRef.current?.focus();
  }

  function chooseYear(year: number) {
    changeYear(year);
    setSelectorMenu(null);
    yearTriggerRef.current?.focus();
  }

  function isAvailable(date: string) {
    return (!minimum || date >= minimum) && (!maximum || date <= maximum);
  }

  function firstAvailableDate(year: number, month: number, preferredDay?: number) {
    if (year < 1 || year > 9999) return "";
    const available = calendarGrid(year, month).filter((date) => date.slice(0, 7) === `${String(year).padStart(4, "0")}-${String(month + 1).padStart(2, "0")}` && isAvailable(date));
    return available.find((date) => Number(date.slice(-2)) === preferredDay) ?? available[0] ?? "";
  }

  function changeMonth(year: number, month: number, preferredDay = Number(focusDate.slice(-2))) {
    const normalized = normalizeMonth(year, month);
    const first = firstAvailableDate(normalized.year, normalized.month, preferredDay);
    if (!first) return;
    const date = parseCalendarDate(first)!;
    setView(dateParts(date));
    setFocusDate(first);
  }

  function changeYear(year: number) {
    const minParts = minimum ? dateParts(parseCalendarDate(minimum)!) : null;
    const maxParts = maximum ? dateParts(parseCalendarDate(maximum)!) : null;
    const month = minParts?.year === year && view.month < minParts.month ? minParts.month
      : maxParts?.year === year && view.month > maxParts.month ? maxParts.month
        : view.month;
    changeMonth(year, month);
  }

  function selectDate(date: string) {
    if (date && !isAvailable(date)) return;
    setSelectorMenu(null);
    onChange(date);
    close(true);
  }

  function handleDayKeyDown(event: KeyboardEvent<HTMLButtonElement>, date: string) {
    const current = parseCalendarDate(date);
    if (!current) return;
    let next: Date | null = null;
    if (event.key === "ArrowLeft") next = addCalendarDays(current, -1);
    else if (event.key === "ArrowRight") next = addCalendarDays(current, 1);
    else if (event.key === "ArrowUp") next = addCalendarDays(current, -7);
    else if (event.key === "ArrowDown") next = addCalendarDays(current, 7);
    else if (event.key === "Home") next = addCalendarDays(current, -((current.getUTCDay() + 6) % 7));
    else if (event.key === "End") next = addCalendarDays(current, 6 - ((current.getUTCDay() + 6) % 7));
    else if (event.key === "PageUp" || event.key === "PageDown") {
      event.preventDefault();
      const amount = event.key === "PageUp" ? -1 : 1;
      const monthDate = parseCalendarDate(`${String(current.getUTCFullYear()).padStart(4, "0")}-${String(current.getUTCMonth() + 1).padStart(2, "0")}-01`)!;
      const targetMonth = new Date(monthDate);
      targetMonth.setUTCMonth(targetMonth.getUTCMonth() + amount * (event.shiftKey ? 12 : 1));
      const targetYear = targetMonth.getUTCFullYear();
      const targetMonthIndex = targetMonth.getUTCMonth();
      const first = firstAvailableDate(targetYear, targetMonthIndex, current.getUTCDate());
      if (first) {
        changeMonth(targetYear, targetMonthIndex, current.getUTCDate());
        requestAnimationFrame(() => popoverRef.current?.querySelector<HTMLButtonElement>(`[data-date="${first}"]`)?.focus());
      }
      return;
    } else return;
    event.preventDefault();
    if (!next) return;
    let nextString = formatCalendarDate(next);
    if (minimum && nextString < minimum) nextString = minimum;
    if (maximum && nextString > maximum) nextString = maximum;
    const target = parseCalendarDate(nextString);
    if (!target) return;
    const targetParts = dateParts(target);
    setView(targetParts);
    setFocusDate(nextString);
    requestAnimationFrame(() => popoverRef.current?.querySelector<HTMLButtonElement>(`[data-date="${nextString}"]`)?.focus());
  }

  function monthAvailable(year: number, month: number) {
    const normalized = normalizeMonth(year, month);
    if (normalized.year < 1 || normalized.year > 9999) return false;
    const datesInMonth = calendarGrid(normalized.year, normalized.month).filter((date) => date.slice(0, 7) === `${String(normalized.year).padStart(4, "0")}-${String(normalized.month + 1).padStart(2, "0")}`);
    return datesInMonth.some(isAvailable);
  }

  function yearAvailable(year: number) {
    const first = `${String(year).padStart(4, "0")}-01-01`;
    const last = `${String(year).padStart(4, "0")}-12-31`;
    return (!minimum || last >= minimum) && (!maximum || first <= maximum) && (!minimum || !maximum || minimum <= maximum);
  }

  return (
    <div className={styles.datePicker}>
      <button
        ref={triggerRef}
        type="button"
        className={`${styles.trigger} ${open ? styles.expanded : ""}`}
        aria-label={`${label}: ${selectedDate ? formatLabel(selectedDate) : "Sin fecha"}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={`${id}-calendar`}
        aria-invalid={invalid || undefined}
        disabled={disabled || suspended}
        onClick={() => open ? close() : show()}
        onKeyDown={(event) => {
          if (!open && ["Enter", " ", "ArrowDown"].includes(event.key)) {
            event.preventDefault();
            show(true);
          }
        }}
      >
        <span>{selectedDate ? formatLabel(selectedDate) : "Seleccionar fecha"}</span>
        <i aria-hidden="true" className="bi bi-calendar3" />
      </button>
      <div
        ref={popoverRef}
        id={`${id}-calendar`}
        className={styles.calendar}
        popover="auto"
        role="dialog"
        aria-label={label}
        onToggle={(event) => {
          const isOpen = event.currentTarget.matches(":popover-open");
          setOpen(isOpen);
          if (!isOpen) setSelectorMenu(null);
          if (!isOpen && popoverRef.current?.contains(document.activeElement)) triggerRef.current?.focus();
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            if (selectorMenu) {
              setSelectorMenu(null);
              (selectorMenu === "month" ? monthTriggerRef : yearTriggerRef).current?.focus();
            } else close(true);
          }
        }}
        onBlurCapture={(event) => {
          if (event.relatedTarget instanceof Node && !popoverRef.current?.contains(event.relatedTarget)) {
            setSelectorMenu(null);
            close();
          }
        }}
      >
        <DateCalendarHeader
          id={id}
          view={view}
          monthNames={monthNames}
          selectorMenu={selectorMenu}
          selectorIndex={selectorIndex}
          yearOptions={yearOptions}
          monthTriggerRef={monthTriggerRef}
          yearTriggerRef={yearTriggerRef}
          monthAvailable={monthAvailable}
          yearAvailable={yearAvailable}
          onToggleSelector={toggleSelector}
          onNavigateSelector={navigateSelector}
          onChooseMonth={chooseMonth}
          onChooseYear={chooseYear}
          onSelectorFocus={setSelectorIndex}
          onCloseSelectorMenu={() => setSelectorMenu(null)}
          onNavigateMonth={(delta) => { setSelectorMenu(null); changeMonth(view.year, view.month + delta); }}
        />
        <DateCalendarGrid
          dates={dates}
          view={view}
          selectedDate={selectedDate}
          focusDate={focusDate}
          today={today}
          isAvailable={isAvailable}
          onSelectDate={selectDate}
          onDayKeyDown={handleDayKeyDown}
          formatLongLabel={formatLongLabel}
          formatMonth={formatMonth}
        />
      </div>
    </div>
  );
}

function todayDate() {
  const current = new Date();
  return parseCalendarDate(`${String(current.getFullYear()).padStart(4, "0")}-${String(current.getMonth() + 1).padStart(2, "0")}-${String(current.getDate()).padStart(2, "0")}`)!;
}

function todayString() {
  return formatCalendarDate(todayDate());
}

function dateParts(date: Date) {
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() };
}

function normalizeMonth(year: number, month: number) {
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month, 1);
  return dateParts(date);
}

function formatLabel(value: string) {
  const date = parseCalendarDate(value)!;
  return new Intl.DateTimeFormat("es", { dateStyle: "medium", timeZone: "UTC" }).format(date);
}

function formatLongLabel(value: string) {
  const date = parseCalendarDate(value)!;
  return new Intl.DateTimeFormat("es", { dateStyle: "full", timeZone: "UTC" }).format(date);
}

function formatMonth(year: number, month: number) {
  const date = parseCalendarDate(`${String(year).padStart(4, "0")}-${String(month + 1).padStart(2, "0")}-01`)!;
  return new Intl.DateTimeFormat("es", { month: "long", year: "numeric", timeZone: "UTC" }).format(date);
}
