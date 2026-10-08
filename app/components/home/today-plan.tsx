"use client";

import type { Dispatch, SetStateAction } from "react";
import styles from "./today-plan.module.css";
import { Icon } from "../ui-icon";
import type { Task } from "./home-data";
import { useT } from "../../i18n/provider";

export function TodayPlan({
  tasks,
  visibleTasks,
  completed,
  setCompleted,
}: {
  tasks: Task[];
  visibleTasks: { task: Task; index: number }[];
  completed: boolean[];
  setCompleted: Dispatch<SetStateAction<boolean[]>>;
  search: string;
  query: string;
}) {
  const t = useT();
  const completedCount = completed.filter(Boolean).length;
  return (
    <section id="plan" aria-labelledby="plan-heading" className={styles.plan}>
      <header className={styles.planHeader}>
        <Icon name="stars" className={styles.planIcon} />
        <h2 id="plan-heading">{t("Plan para hoy")}</h2>
        <span className={styles.suggested}>{t("Sugerido por modus")}</span>
        <span className={styles.planMeta}>
          {tasks.length - completedCount}{" "}
          {t(tasks.length - completedCount === 1 ? "pendiente" : "pendientes")}
        </span>
      </header>
      <div className={styles.planBody}>
        {visibleTasks.length ? (
          visibleTasks.map(({ task, index }) => (
            <div key={task.text} className={styles.task}>
              <label className={styles.taskLabel}>
                <input
                  type="checkbox"
                  checked={completed[index]}
                  onChange={(event) =>
                    setCompleted((current) =>
                      current.map((value, position) =>
                        position === index ? event.target.checked : value,
                      ),
                    )
                  }
                />
                <span className={completed[index] ? styles.completedText : ""}>
                  {task.text}
                </span>
              </label>
              <span className={styles.projectChip}>
                <b style={{ background: task.project.color }} />
                {task.project.name}
              </span>
              {completed[index] && (
                <span className={styles.done}>
                  <Icon name="check" />
                  {t("Completada")}
                </span>
              )}
            </div>
          ))
        ) : (
          <p className={styles.empty}>
            {t("No hay tareas que coincidan con la búsqueda.")}
          </p>
        )}
      </div>
    </section>
  );
}
