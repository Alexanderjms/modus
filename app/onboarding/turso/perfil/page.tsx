import type { Metadata } from "next";
import { OnboardingFrame } from "../../../components/onboarding-frame";
import { OnboardingBackButton } from "../../../components/onboarding-back-button";
import { TursoProfileForm } from "../../../components/turso-profile-form";
import { getT } from "../../../i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Crea tu perfil | Modus"), description: t("Configura tu perfil para el almacenamiento en Turso.") };
}

export default async function TursoProfilePage() {
  const t = await getT();
  return (
    <OnboardingFrame>
      <section
        aria-labelledby="turso-profile-title"
        className="relative z-10 flex w-full max-w-[400px] flex-col items-center gap-6"
      >
        <OnboardingBackButton />
        <header className="flex w-full flex-col items-center gap-5">
          <div className="flex w-full flex-col items-center gap-2 text-center">
            <h1
              id="turso-profile-title"
              className="w-full text-[20px] font-bold leading-[normal] tracking-[-0.3px] text-[var(--foreground)]"
            >
              {t("Crea tu perfil")}
            </h1>
            <p className="w-full text-[12.5px] leading-[18px] text-[var(--muted)]">
              {t("Tu perfil se guardará junto con tus datos en Turso.")}
            </p>
            <p className="w-full text-[11.5px] leading-[17px] text-[var(--muted)]">
              {t("Podrás volver a acceder al conectar esta base de datos en otra instalación de Modus.")}
            </p>
          </div>
        </header>
        <TursoProfileForm />
      </section>
    </OnboardingFrame>
  );
}
