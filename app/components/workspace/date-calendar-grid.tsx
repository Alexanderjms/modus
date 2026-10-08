"use client";

import type { KeyboardEvent } from "react";
import { parseCalendarDate } from "./date-picker-date.mjs";
import styles from "./date-picker.module.css";
import { useT } from "../../i18n/provider";

export function DateCalendarGrid({
  dates,
  view,
  selectedDate,
  focusDate,
  today,
  isAvailable,
  onSelectDate,
  onDayKeyDown,
  formatLongLabel,
  formatMonth,
}: {
  dates: string[];
  view: { year: number; month: number };
  selectedDate: string;
  focusDate: string;
  today: string;
  isAvailable: (date: string) => boolean;
  onSelectDate: (date: string) => void;
  onDayKeyDown: (event: KeyboardEvent<HTMLButtonElement>, date: string) => void;
  formatLongLabel: (value: string) => string;
  formatMonth: (year: number, month: number) => string;
}) {
  const t = useT();
  return (
    <>
      <div className={styles.calendarWeekdays} aria-hidden="true">{["L", "M", "X", "J", "V", "S", "D"].map((day, index) => <span key={index}>{t(day)}</span>)}</div>
      <div className={styles.calendarGrid} role="grid" aria-label={formatMonth(view.year, view.month)}>
        {Array.from({ length: 6 }, (_, week) => <div role="row" className={styles.calendarWeek} key={week}>
          {dates.slice(week * 7, week * 7 + 7).map((date, day) => {
            if (!parseCalendarDate(date)) return <div role="gridcell" key={`${date}:${day}`} />;
            const inMonth = date.slice(0, 7) === `${String(view.year).padStart(4, "0")}-${String(view.month + 1).padStart(2, "0")}`;
            return <div role="gridcell" aria-selected={date === selectedDate || undefined} key={`${date}:${day}`}>
              <button
                type="button"
                data-date={date}
                disabled={!isAvailable(date)}
                tabIndex={date === focusDate ? 0 : -1}
                aria-label={formatLongLabel(date)}
                aria-current={date === today ? "date" : undefined}
                aria-pressed={date === selectedDate}
                className={`${styles.day} ${!inMonth ? styles.outsideMonth : ""} ${date === today ? styles.today : ""} ${date === selectedDate ? styles.selected : ""}`}
                onClick={() => onSelectDate(date)}
                onKeyDown={(event) => onDayKeyDown(event, date)}
              >{Number(date.slice(-2))}</button>
            </div>;
          })}
        </div>)}
      </div>
      <div className={styles.calendarFooter}>
        <button type="button" onClick={() => onSelectDate(today)} disabled={!isAvailable(today)}>{t("Hoy")}</button>
        <button type="button" onClick={() => onSelectDate("")} disabled={!selectedDate}>{t("Borrar")}</button>
      </div>
    </>
  );
}
