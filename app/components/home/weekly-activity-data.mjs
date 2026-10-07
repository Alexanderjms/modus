const DAY_MS = 24 * 60 * 60 * 1000;

function parseDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("La actividad incluye una fecha inválida.");
  }

  const [year, month, day] = value.split("-").map(Number);
  const localDate = new Date(0);
  localDate.setFullYear(year, month - 1, day);
  localDate.setHours(12, 0, 0, 0);
  if (
    localDate.getFullYear() !== year ||
    localDate.getMonth() !== month - 1 ||
    localDate.getDate() !== day
  ) {
    throw new Error("La actividad incluye una fecha inválida.");
  }

  const utcDate = new Date(0);
  utcDate.setUTCFullYear(year, month - 1, day);
  utcDate.setUTCHours(0, 0, 0, 0);
  return { localDate, dayNumber: utcDate.getTime() / DAY_MS };
}

export function parseWeeklyActivity(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("La respuesta de actividad no es válida.");
  }
  if (!Array.isArray(value.days) || value.days.length < 1 || value.days.length > 400) {
    throw new Error("La respuesta de actividad debe incluir entre 1 y 400 días.");
  }
  if (typeof value.historyNotice !== "string" || !value.historyNotice.trim()) {
    throw new Error("La respuesta no incluye el aviso del historial.");
  }

  let total = 0;
  let previousDay = null;
  const days = value.days.map((day) => {
    if (!day || typeof day !== "object" || Array.isArray(day)) {
      throw new Error("La actividad diaria no es válida.");
    }
    if (!Number.isSafeInteger(day.completed) || day.completed < 0) {
      throw new Error("La actividad debe contener cantidades enteras no negativas.");
    }

    const { localDate, dayNumber } = parseDate(day.date);
    if (previousDay !== null && dayNumber !== previousDay + 1) {
      throw new Error("Los días de actividad deben estar en orden consecutivo.");
    }
    previousDay = dayNumber;
    total += day.completed;
    if (!Number.isSafeInteger(total)) {
      throw new Error("El total de actividad no es válido.");
    }

    return { date: day.date, completed: day.completed, localDate };
  });

  return { days, total, historyNotice: value.historyNotice };
}
