import type { Metadata } from "next";
import { OnboardingFrame } from "../../components/onboarding-frame";
import { OnboardingBackButton } from "../../components/onboarding-back-button";
import { TursoCredentialsForm } from "../../components/turso-credentials-form";
import { TursoGuide } from "../../components/turso-guide";
import { getT } from "../../i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Conecta Turso | modus"), description: t("Conecta tu base de datos de Turso con modus.") };
}

export default async function TursoOnboardingPage() {
  const t = await getT();
  return (
    <OnboardingFrame>
      <section
        aria-labelledby="storage-settings-title"
        className="relative z-10 flex w-full max-w-[900px] flex-col gap-6"
      >
        <OnboardingBackButton />
        <header className="relative flex min-h-[26px] w-full items-center justify-center min-[1024px]:h-[26px]">
          <h1
            id="storage-settings-title"
            className="w-full px-8 text-center text-[16px] font-bold leading-[21px] tracking-[-0.3px] min-[1024px]:px-0 min-[1024px]:text-[20px] min-[1024px]:leading-[26px]"
          >
            {t("Configuración de almacenamiento")}
          </h1>
        </header>

        <div className="grid w-full grid-cols-1 items-start gap-8 min-[1024px]:grid-cols-[471px_430px] min-[1024px]:gap-[22px]">
          <section className="flex w-full flex-col items-center gap-6 min-[1024px]:w-[471px]">
            <header className="flex w-full flex-col items-center gap-2 text-center">
              <h2 className="w-full text-[20px] font-bold leading-[26px] tracking-[-0.3px]">
                {t("Conecta Turso")}
              </h2>
              <p className="w-full text-[12.5px] font-normal leading-[18px] text-[var(--muted)]">
                {t("Introduce las credenciales de tu base de datos.")}
              </p>
            </header>

            <TursoCredentialsForm />
          </section>

          <TursoGuide />
        </div>
      </section>
    </OnboardingFrame>
  );
}
