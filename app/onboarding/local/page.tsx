import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { hasLocalProfile } from "../../../db/local/profile.cjs";
import { LocalProfileForm } from "../../components/local-profile-form";
import { OnboardingFrame } from "../../components/onboarding-frame";
import { OnboardingBackButton } from "../../components/onboarding-back-button";

export const metadata: Metadata = {
  title: "Configura tu perfil | Modus",
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function LocalOnboardingPage() {
  if (hasLocalProfile()) redirect("/inicio");
  return (
    <OnboardingFrame>
      <section
        aria-label="Perfil local"
        className="relative z-10 flex w-full max-w-[400px] flex-col items-center gap-6"
      >
        <OnboardingBackButton />
        <LocalProfileForm />
      </section>
    </OnboardingFrame>
  );
}
