import { cookies } from "next/headers";
import { openProjectDatabase, resolveUser } from "../../../db/local/projects.cjs";
import { COOKIE, completeAuthorization, profileFor } from "../../../db/local/chatgpt-oauth.cjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CallbackStatus = "connected" | "permission_required" | "error";

const desktop = () => !!process.env.MODUS_DESKTOP;

function html(status: CallbackStatus): Response {
  const target = `/inicio?chatgpt=${status}`;
  const message = status === "connected"
    ? desktop() ? "ChatGPT conectado. Ya puedes cerrar esta pestaña y volver a Modus." : "ChatGPT conectado. Volviendo a Modus…"
    : status === "permission_required"
    ? "Autoriza el uso de tu plan de ChatGPT para continuar."
    : "No se pudo completar la conexión con ChatGPT. Vuelve a intentarlo.";
  const body = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${desktop() ? "" : `<meta http-equiv="refresh" content="0;url=${target}">`}<title>Modus</title></head><body><p>${message}</p>${desktop() ? "" : `<p><a href="${target}">Volver a Modus</a></p>`}</body></html>`;
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; base-uri 'none'; form-action 'none'",
    },
  });
}

export async function GET(request: Request) {
  const host = request.headers.get("host") || "";
  if (!/^127\.0\.0\.1(?::\d+)?$/.test(host)) return html("error");

  const callbackUrl = new URL(request.url);
  callbackUrl.host = host;
  const jar = await cookies();
  const shared = globalThis as { __modusOAuthCookie?: string };
  const cookie = jar.get(COOKIE)?.value ?? (desktop() ? shared.__modusOAuthCookie : undefined);

  const status = await (async (): Promise<CallbackStatus> => {
    try {
      if (!cookie) return "error";
      if (callbackUrl.pathname !== "/auth/callback" || callbackUrl.protocol !== "http:") return "error";

      const dbResult = openProjectDatabase();
      if ("error" in dbResult) return "error";
      const { db } = dbResult;
      let profile: string;
      try {
        const user = resolveUser(db);
        if (user instanceof Response) return "error";
        profile = profileFor(db, user.id);
      } finally {
        try {
          db.close();
        } catch {}
      }

      const connection = await completeAuthorization(profile, cookie, callbackUrl);
      if (connection.status === "connected") return "connected";
      if (connection.status === "permission_required") return "permission_required";
      return "error";
    } catch {
      return "error";
    } finally {
      if (desktop()) delete shared.__modusOAuthCookie;
      jar.set({ name: COOKIE, value: "", path: "/auth/callback", maxAge: 0, httpOnly: true, sameSite: "lax", secure: false });
    }
  })();

  return html(status);
}
