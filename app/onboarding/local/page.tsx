import type { Metadata } from "next";
import { LocalProfileForm } from "../../components/local-profile-form";
import { OnboardingFrame } from "../../components/onboarding-frame";

export const metadata: Metadata = {
  title: "Configura tu perfil | Modus",
  description: "Personaliza tu experiencia en Modus.",
};

export default function LocalOnboardingPage() {
  return (
    <OnboardingFrame>
      <section
        aria-labelledby="local-profile-title"
        className="relative z-10 flex w-full max-w-[400px] flex-col items-center gap-6"
      >
        <header className="flex w-full flex-col items-center gap-5">
          <div className="flex w-full flex-col items-center gap-2 text-center">
            <h1
              id="local-profile-title"
              className="w-full text-[20px] font-bold leading-[normal] tracking-[-0.3px] text-[var(--foreground)]"
            >
              Configura tu perfil
            </h1>
            <p className="w-full text-[12.5px] leading-[18px] text-[var(--muted)]">
              Personaliza tu experiencia en Modus.
            </p>
          </div>
        </header>
        <LocalProfileForm />
      </section>
    </OnboardingFrame>
  );
}
