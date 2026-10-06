"use client";

import { useEffect, useState } from "react";
import { Skeleton } from "../skeleton";
import styles from "./weekly-activity.module.css";
import {
  parseWeeklyActivity,
  type WeeklyActivityData,
} from "./weekly-activity-data.mjs";

const weekdayFormatter = new Intl.DateTimeFormat("es", { weekday: "short" });
const dateFormatter = new Intl.DateTimeFormat("es", { day: "numeric" });
const fullDateFormatter = new Intl.DateTimeFormat("es", { dateStyle: "full" });

export function WeeklyActivity({ refreshKey = 0 }: { refreshKey?: number }) {
  const [activity, setActivity] = useState<WeeklyActivityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const maximum = activity
    ? Math.max(...activity.days.map((day) => day.completed))
    : 0;

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
          throw new Error(payload?.error || "No se pudo cargar la actividad semanal.");
        }
        setActivity(parseWeeklyActivity(payload));
      } catch (reason) {
        if (!controller.signal.aborted) {
          setActivity(null);
          setError(
            reason instanceof Error ? reason.message : "No se pudo cargar la actividad semanal.",
          );
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadActivity();
    return () => controller.abort();
  }, [reload, refreshKey]);

  return (
    <section className={styles.section} aria-labelledby="weekly-activity-heading">
      <header className={styles.header}>
        <div>
          <h2 id="weekly-activity-heading">Actividad semanal</h2>
          {activity && <p className={styles.notice}>{activity.historyNotice}</p>}
        </div>
        {activity && (
          <div
            className={styles.total}
            role="group"
            aria-label={`Total semanal: ${activity.total} finalizaciones`}
          >
            <span className={styles.totalLabel}>Total semanal</span>
            <strong>{activity.total}</strong>
            <span>finalizaciones</span>
          </div>
        )}
      </header>
      {loading ? (
        <div className={styles.skeleton} role="status" aria-label="Cargando actividad semanal">
          <Skeleton variant="rounded" width="100%" height={142} />
        </div>
      ) : error ? (
        <p className={styles.error} role="alert">
          {error}{" "}
          <button type="button" onClick={() => setReload((current) => current + 1)}>
            Reintentar
          </button>
        </p>
      ) : activity ? (
        <>
          {activity.total === 0 && (
            <p className={styles.empty} role="status">
              No hay finalizaciones registradas en estos siete días.
            </p>
          )}
          <ol className={styles.chart} aria-label="Finalizaciones por día">
            {activity.days.map((day) => {
              const height = day.completed === 0
                ? 2
                : Math.max(6, (day.completed / maximum) * 100);

              return (
                <li className={styles.day} key={day.date}>
                  <span className={styles.dayName} aria-hidden="true">
                    {weekdayFormatter.format(day.localDate)}
                  </span>
                  <span className={styles.date} aria-hidden="true">
                    {dateFormatter.format(day.localDate)}
                  </span>
                  <div className={styles.barTrack} aria-hidden="true">
                    <span
                      className={day.completed === 0 ? styles.zeroBar : styles.bar}
                      style={{ height: `${height}%` }}
                    />
                  </div>
                  <span className={styles.count} aria-hidden="true">{day.completed}</span>
                  <span className="sr-only">
                    {fullDateFormatter.format(day.localDate)}: {day.completed} finalizaciones
                  </span>
                </li>
              );
            })}
          </ol>
        </>
      ) : null}
    </section>
  );
}
