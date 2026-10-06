import type { DatabaseSync } from "node:sqlite";
import {
  jsonResponse,
  withNoStore,
  validateLoopbackSecurity,
  resolveUser,
  openProjectDatabase,
  getWeeklyActivity,
} from "../../../../db/local/tasks.cjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface ActivityDayDto {
  date: string;
  completed: number;
}

export interface ActivityResponseDto {
  days: ActivityDayDto[];
  historyNotice: string;
}

export async function GET(request: Request) {
  const secError = validateLoopbackSecurity(request);
  if (secError) return withNoStore(secError);

  let db: DatabaseSync | null = null;
  try {
    const dbResult = openProjectDatabase();
    if ("error" in dbResult && dbResult.error) {
      return withNoStore(dbResult.error);
    }
    db = dbResult.db;

    const user = resolveUser(db);
    if (user instanceof Response) {
      return withNoStore(user);
    }

    const activity = getWeeklyActivity(db, user.id);
    return jsonResponse(activity, 200);
  } catch {
    return jsonResponse({ error: "Error interno del servidor" }, 500);
  } finally {
    if (db) {
      try {
        db.close();
      } catch {}
    }
  }
}
