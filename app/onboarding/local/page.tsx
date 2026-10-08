import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { hasLocalProfile } from "../../../db/local/profile.cjs";
import { LocalProfileForm } from "../../components/local-profile-form";
import { OnboardingFrame } from "../../components/onboarding-frame";
import { OnboardingBackButton } from "../../components/onboarding-back-button";
import { getT } from "../../i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("Configura tu perfil | Modus") };
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function LocalOnboardingPage() {
  const t = await getT();
  if (hasLocalProfile()) redirect("/inicio");
  return (
    <OnboardingFrame>
      <section
        aria-label={t("Perfil local")}
        className="relative z-10 flex w-full max-w-[400px] flex-col items-center gap-6"
      >
        <OnboardingBackButton />
        <LocalProfileForm />
      </section>
    </OnboardingFrame>
  );
}
