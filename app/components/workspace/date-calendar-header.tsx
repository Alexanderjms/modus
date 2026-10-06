"use client";

import type { KeyboardEvent, RefObject } from "react";
import styles from "./date-picker.module.css";

export type SelectorMenu = "month" | "year";

export function DateCalendarHeader({
  id,
  view,
  monthNames,
  selectorMenu,
  selectorIndex,
  yearOptions,
  monthTriggerRef,
  yearTriggerRef,
  monthAvailable,
  yearAvailable,
  onToggleSelector,
  onNavigateSelector,
  onChooseMonth,
  onChooseYear,
  onSelectorFocus,
  onCloseSelectorMenu,
  onNavigateMonth,
}: {
  id: string;
  view: { year: number; month: number };
  monthNames: string[];
  selectorMenu: SelectorMenu | null;
  selectorIndex: number;
  yearOptions: number[];
  monthTriggerRef: RefObject<HTMLButtonElement | null>;
  yearTriggerRef: RefObject<HTMLButtonElement | null>;
  monthAvailable: (year: number, month: number) => boolean;
  yearAvailable: (year: number) => boolean;
  onToggleSelector: (menu: SelectorMenu, keyboard: boolean) => void;
  onNavigateSelector: (event: KeyboardEvent<HTMLDivElement>) => void;
  onChooseMonth: (month: number) => void;
  onChooseYear: (year: number) => void;
  onSelectorFocus: (index: number) => void;
  onCloseSelectorMenu: () => void;
  onNavigateMonth: (delta: number) => void;
}) {
  return (
    <div className={styles.calendarHeader}>
      <div className={styles.selectorWrap} onBlurCapture={(event) => {
        if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) onCloseSelectorMenu();
      }}>
        <button
          ref={monthTriggerRef}
          type="button"
          className={styles.selectorTrigger}
          aria-label={`Mes: ${monthNames[view.month]}`}
          aria-haspopup="listbox"
          aria-expanded={selectorMenu === "month"}
          aria-controls={`${id}-months`}
          onClick={(event) => onToggleSelector("month", event.detail === 0)}
          onKeyDown={(event) => {
            if (["ArrowDown", "ArrowUp"].includes(event.key) && selectorMenu !== "month") {
              event.preventDefault();
              onToggleSelector("month", true);
            }
          }}
        ><span>{monthNames[view.month]}</span><i aria-hidden="true" className="bi bi-chevron-down" /></button>
        {selectorMenu === "month" && <div
          id={`${id}-months`}
          className={styles.selectorMenu}
          role="listbox"
          aria-label="Mes"
          onKeyDown={onNavigateSelector}
        >{monthNames.map((month, index) => <button
          key={month}
          type="button"
          role="option"
          aria-selected={view.month === index}
          aria-disabled={!monthAvailable(view.year, index) || undefined}
          disabled={!monthAvailable(view.year, index)}
          tabIndex={selectorIndex === index ? 0 : -1}
          data-menu-option={`month-${index}`}
          className={styles.selectorOption}
          onFocus={() => onSelectorFocus(index)}
          onClick={() => onChooseMonth(index)}
        >{month}{view.month === index && <i aria-hidden="true" className="bi bi-check2" />}</button>)}</div>}
      </div>
      <div className={styles.selectorWrap} onBlurCapture={(event) => {
        if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) onCloseSelectorMenu();
      }}>
        <button
          ref={yearTriggerRef}
          type="button"
          className={styles.selectorTrigger}
          aria-label={`Año: ${view.year}`}
          aria-haspopup="listbox"
          aria-expanded={selectorMenu === "year"}
          aria-controls={`${id}-years`}
          onClick={(event) => onToggleSelector("year", event.detail === 0)}
          onKeyDown={(event) => {
            if (["ArrowDown", "ArrowUp"].includes(event.key) && selectorMenu !== "year") {
              event.preventDefault();
              onToggleSelector("year", true);
            }
          }}
        ><span>{view.year}</span><i aria-hidden="true" className="bi bi-chevron-down" /></button>
        {selectorMenu === "year" && <div
          id={`${id}-years`}
          className={`${styles.selectorMenu} ${styles.yearMenu}`}
          role="listbox"
          aria-label="Año"
          onKeyDown={onNavigateSelector}
        >{yearOptions.map((year, index) => <button
          key={year}
          type="button"
          role="option"
          aria-selected={view.year === year}
          aria-disabled={!yearAvailable(year) || undefined}
          disabled={!yearAvailable(year)}
          tabIndex={selectorIndex === index ? 0 : -1}
          data-menu-option={`year-${index}`}
          className={styles.selectorOption}
          onFocus={() => onSelectorFocus(index)}
          onClick={() => onChooseYear(year)}
        >{year}{view.year === year && <i aria-hidden="true" className="bi bi-check2" />}</button>)}</div>}
      </div>
      <div className={styles.monthNavigation}>
        <button type="button" aria-label="Mes anterior" disabled={!monthAvailable(view.year, view.month - 1)} onClick={() => onNavigateMonth(-1)}><i aria-hidden="true" className="bi bi-chevron-left" /></button>
        <button type="button" aria-label="Mes siguiente" disabled={!monthAvailable(view.year, view.month + 1)} onClick={() => onNavigateMonth(1)}><i aria-hidden="true" className="bi bi-chevron-right" /></button>
      </div>
    </div>
  );
}
