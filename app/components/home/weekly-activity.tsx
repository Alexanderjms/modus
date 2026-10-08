"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Skeleton } from "../skeleton";
import styles from "./weekly-activity.module.css";
import {
  parseWeeklyActivity,
  type WeeklyActivityData,
  type WeeklyActivityDay,
} from "./weekly-activity-data.mjs";
import { useLang } from "../../i18n/provider";

const weekdayLabels = ["Lun", "", "Mié", "", "Vie", "", ""];

function levelFor(completed: number, maximum: number) {
  if (completed === 0) return 0;
  return Math.min(4, Math.max(1, Math.ceil((completed / maximum) * 4)));
}

function buildWeeks(days: WeeklyActivityDay[]) {
  const weeks: WeeklyActivityDay[][] = [];
  for (let index = 0; index < days.length; index += 7) weeks.push(days.slice(index, index + 7));
  return weeks;
}

export function WeeklyActivity({ refreshKey = 0 }: { refreshKey?: number }) {
  const { lang, t } = useLang();
  const monthFormatter = useMemo(() => new Intl.DateTimeFormat(lang, { month: "short" }), [lang]);
  const fullDateFormatter = useMemo(() => new Intl.DateTimeFormat(lang, { dateStyle: "full" }), [lang]);
  const tooltipDateFormatter = useMemo(() => new Intl.DateTimeFormat(lang, { weekday: "long", day: "numeric", month: "long", year: "numeric" }), [lang]);
  const [activity, setActivity] = useState<WeeklyActivityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; count: number; date: string; today: boolean } | null>(null);

  const maximum = activity ? Math.max(1, ...activity.days.map((day) => day.completed)) : 1;
  const weeks = useMemo(() => (activity ? buildWeeks(activity.days) : []), [activity]);
  const monthLabels = useMemo(() => {
    const labels: { column: number; text: string }[] = [];
    let previousMonth = -1;
    weeks.forEach((week, column) => {
      const month = week[0].localDate.getMonth();
      if (month === previousMonth) return;
      previousMonth = month;
      if (column === 0 && weeks.length > 3 && weeks[1][0].localDate.getMonth() !== month) return;
      labels.push({ column, text: monthFormatter.format(week[0].localDate).replace(".", "") });
    });
    return labels;
  }, [weeks, monthFormatter]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadActivity() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch("/api/home/activity", {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        if (!response.ok) {
          throw new Error(payload?.error || t("No se pudo cargar la actividad."));
        }
        setActivity(parseWeeklyActivity(payload));
      } catch (reason) {
        if (!controller.signal.aborted) {
          setActivity(null);
          setError(
            reason instanceof Error ? reason.message : t("No se pudo cargar la actividad."),
          );
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadActivity();
    return () => controller.abort();
  }, [reload, refreshKey]);

  useEffect(() => {
    const element = scroller.current;
    if (element) element.scrollLeft = element.scrollWidth;
  }, [activity]);

  return (
    <section className={styles.section} aria-labelledby="weekly-activity-heading">
      <header className={styles.header}>
        <div>
          <h2 id="weekly-activity-heading">{t("Actividad")}</h2>
          {activity && (
            <p className={styles.notice}>
              {activity.total} {activity.total === 1 ? t("finalización") : t("finalizaciones")} {t("en el último año")}
              {" · "}
              {t(activity.historyNotice)}
            </p>
          )}
        </div>
      </header>
      {loading ? (
        <div className={styles.skeleton} role="status" aria-label={t("Cargando actividad")}>
          <Skeleton variant="rounded" width="100%" height={142} />
        </div>
      ) : error ? (
        <p className={styles.error} role="alert">
          {t(error)}{" "}
          <button type="button" onClick={() => setReload((current) => current + 1)}>
            {t("Reintentar")}
          </button>
        </p>
      ) : activity ? (
        <>
          {activity.total === 0 && (
            <p className={styles.empty} role="status">
              {t("Aún no hay finalizaciones registradas. Completa tareas para llenar la cuadrícula.")}
            </p>
          )}
          <div className={styles.scroller} ref={scroller} onScroll={() => setTooltip(null)}>
            <div className={styles.calendar} style={{ "--weeks": weeks.length } as CSSProperties}>
              <div className={styles.months} aria-hidden="true">
                {monthLabels.map(({ column, text }) => (
                  <span key={column} style={{ gridColumn: column + 1 }}>{text}</span>
                ))}
              </div>
              <div className={styles.weekdays} aria-hidden="true">
                {weekdayLabels.map((label, index) => <span key={index}>{t(label)}</span>)}
              </div>
              <ol className={styles.grid} aria-label={t("Finalizaciones por día durante el último año")}>
                {weeks.flatMap((week, column) => week.map((day, row) => {
                  const isToday = column === weeks.length - 1 && row === week.length - 1;
                  const label = `${fullDateFormatter.format(day.localDate)}: ${day.completed} ${day.completed === 1 ? t("finalización") : t("finalizaciones")}`;
                  return (
                    <li
                      key={day.date}
                      className={styles.cell}
                      data-level={levelFor(day.completed, maximum)}
                      data-today={isToday || undefined}
                      style={{ "--col": column } as CSSProperties}
                      onPointerEnter={(event) => {
                        if (event.pointerType === "touch") return;
                        const rect = event.currentTarget.getBoundingClientRect();
                        setTooltip({
                          x: Math.min(Math.max(rect.left + rect.width / 2, 100), window.innerWidth - 100),
                          y: rect.top,
                          count: day.completed,
                          date: tooltipDateFormatter.format(day.localDate),
                          today: isToday,
                        });
                      }}
                      onPointerLeave={() => setTooltip(null)}
                    >
                      <span className="sr-only">{label}</span>
                    </li>
                  );
                }))}
              </ol>
            </div>
          </div>
          <div className={styles.legend} aria-hidden="true">
            <span>{t("Menos")}</span>
            {[0, 1, 2, 3, 4].map((level) => <i key={level} className={styles.cell} data-level={level} />)}
            <span>{t("Más")}</span>
          </div>
        </>
      ) : null}
      {tooltip && createPortal(
        <div className={styles.tooltip} role="presentation" style={{ left: tooltip.x, top: tooltip.y }}>
          <strong>{tooltip.count === 0 ? t("Sin finalizaciones") : `${tooltip.count} ${tooltip.count === 1 ? t("finalización") : t("finalizaciones")}`}</strong>
          <span>{tooltip.today ? t("Hoy · ") : ""}{tooltip.date}</span>
        </div>,
        document.body,
      )}
    </section>
  );
}
