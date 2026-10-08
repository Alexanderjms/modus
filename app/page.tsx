import { OnboardingFrame } from "./components/onboarding-frame";
import { StorageSelection } from "./components/storage-selection";
import { redirect } from "next/navigation";
import { hasProfile } from "../db/local/profile.cjs";
import { isSignedOut } from "../db/local/storage.cjs";
import { getT } from "./i18n/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function Home() {
  const t = await getT();
  if (!isSignedOut() && hasProfile()) redirect("/inicio");
  return (
    <OnboardingFrame>
      <section className="flex w-full max-w-[400px] flex-col items-center gap-6">
        <header className="w-full">
          <div className="flex w-full flex-col items-center gap-2 text-center">
            <h1
              id="storage-heading"
              className="w-full text-xl font-bold tracking-[-0.3px] [line-height:normal]"
            >
              {t("Configura tu almacenamiento")}
            </h1>
            <p
              id="storage-question"
              className="w-full text-[13px] font-medium [line-height:normal]"
            >
              {t("¿Dónde quieres guardar tus datos?")}
            </p>
            <p className="w-full text-[12.5px] leading-[18px] text-[var(--muted)]">
              {t("Elige cómo almacenar tus proyectos, tareas y conversaciones.")}
            </p>
          </div>
        </header>

        <StorageSelection />
      </section>
    </OnboardingFrame>
  );
}
