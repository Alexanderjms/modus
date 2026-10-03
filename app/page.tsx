import { OnboardingFrame } from "./components/onboarding-frame";
import { StorageSelection } from "./components/storage-selection";

export default function Home() {
  return (
    <OnboardingFrame>
      <section className="flex w-full max-w-[400px] flex-col items-center gap-6">
        <header className="w-full">
          <div className="flex w-full flex-col items-center gap-2 text-center">
            <h1
              id="storage-heading"
              className="w-full text-xl font-bold tracking-[-0.3px] [line-height:normal]"
            >
              Configura tu almacenamiento
            </h1>
            <p
              id="storage-question"
              className="w-full text-[13px] font-medium [line-height:normal]"
            >
              ¿Dónde quieres guardar tus datos?
            </p>
            <p className="w-full text-[12.5px] leading-[18px] text-[var(--muted)]">
              Elige cómo almacenar tus proyectos,
              <br />
              tareas y conversaciones.
            </p>
          </div>
        </header>

        <StorageSelection />
      </section>
    </OnboardingFrame>
  );
}
