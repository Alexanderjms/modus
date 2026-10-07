import { redirect } from "next/navigation";
import { hasLocalProfile } from "../../db/local/profile.cjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function LocalPage() {
  redirect(hasLocalProfile() ? "/inicio" : "/onboarding/local");
}
