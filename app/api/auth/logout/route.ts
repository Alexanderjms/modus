import { cookies } from "next/headers";
import { validateLoopbackSecurity } from "../../../../db/local/providers.cjs";
import { signOut } from "../../../../db/local/storage.cjs";
import { UNLOCK_COOKIE, endSession } from "../../../../db/local/pin-lock.cjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const secError = validateLoopbackSecurity(request);
  if (secError) return secError;

  const jar = await cookies();
  endSession(jar.get(UNLOCK_COOKIE)?.value);
  jar.delete(UNLOCK_COOKIE);
  signOut();
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
