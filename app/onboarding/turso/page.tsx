import type { Metadata } from "next";
import Link from "next/link";
import { OnboardingFrame } from "../../components/onboarding-frame";
import { TursoCredentialsForm } from "../../components/turso-credentials-form";
import { TursoGuide } from "../../components/turso-guide";

export const metadata: Metadata = {
  title: "Conecta Turso | Sona",
  description: "Conecta tu base de datos de Turso con Sona.",
};

function ArrowLeftIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      className="size-[14px]"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    >
      <path d="M19 12H5" />
      <path d="m12 19-7-7 7-7" />
    </svg>
  );
}

export default function TursoOnboardingPage() {
  return (
    <OnboardingFrame>
      <section
        aria-labelledby="storage-settings-title"
        className="relative z-10 flex w-full max-w-[900px] flex-col gap-6"
      >
        <header className="relative flex min-h-[26px] w-full items-center justify-center min-[1024px]:h-[26px]">
          <h1
            id="storage-settings-title"
            className="w-full px-8 text-center text-[16px] font-bold leading-[21px] tracking-[-0.3px] min-[1024px]:px-0 min-[1024px]:text-[20px] min-[1024px]:leading-[26px]"
          >
            Configuración de almacenamiento
          </h1>
          <Link
            href="/"
            aria-label="Volver a la configuración de almacenamiento"
            className="absolute left-0 top-0 flex size-[26px] items-center justify-center rounded-[6px] text-[var(--muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#007AFF]"
          >
            <ArrowLeftIcon />
          </Link>
        </header>

        <div className="grid w-full grid-cols-1 items-start gap-8 min-[1024px]:grid-cols-[471px_430px] min-[1024px]:gap-[22px]">
          <section className="flex w-full flex-col items-center gap-6 min-[1024px]:w-[471px]">
            <header className="flex w-full flex-col items-center gap-2 text-center">
              <h2 className="w-full text-[20px] font-bold leading-[26px] tracking-[-0.3px]">
                Conecta Turso
              </h2>
              <p className="w-full text-[12.5px] font-normal leading-[18px] text-[var(--muted)]">
                Introduce las credenciales de tu
                <br />
                base de datos.
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
