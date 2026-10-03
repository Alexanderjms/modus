import Link from "next/link";
import { OnboardingFrame } from "../../components/onboarding-frame";

export default function ReadyPage() {
  return (
    <OnboardingFrame>
      <section
        aria-labelledby="ready-heading"
        className="relative flex w-full max-w-[340px] flex-col items-center gap-6"
      >
        <header className="flex w-full flex-col items-center gap-5">
          <div className="flex w-full flex-col items-center gap-2 text-center">
            <h1
              id="ready-heading"
              className="w-full text-xl font-bold tracking-[-0.3px] [line-height:normal]"
            >
              Todo listo
            </h1>
            <p className="w-full text-[12.5px] leading-[18px] text-[var(--muted)]">
              Ya puedes empezar a trabajar en Modus.
            </p>
          </div>
        </header>

        <div className="flex w-full items-center justify-center gap-[7px]">
          <span
            aria-hidden="true"
            className="flex size-4 shrink-0 items-center justify-center rounded-[8px] bg-[var(--success)]"
          >
            <svg
              viewBox="0 0 13.99993896484375 14"
              preserveAspectRatio="xMidYMid meet"
              xmlns="http://www.w3.org/2000/svg"
              className="size-[10px] shrink-0"
            >
              <path
                d="M11.48096 2.95313q-0.07178 0.01367-0.12989 0.0581-0.05469 0.04102-3.07617 3.06592l-3.0249 3.00781-1.28857-1.28857q-1.28857-1.28516-1.38086-1.32618-0.08887-0.04443-0.22217-0.04443-0.1333 0-0.23242 0.0376-0.0957 0.03418-0.18799 0.11279-0.08887 0.0752-0.1333 0.1709-0.02734 0.07178-0.03418 0.11279-0.00684 0.04102-0.00684 0.14014l0 0.04102q-0.01367 0.11279 0.04102 0.19824 0.07178 0.10938 0.36572 0.40332 0.19482 0.21191 0.96729 0.98096l1.49707 1.48339q0.28027 0.2666 0.38964 0.33838 0.07178 0.05469 0.18457 0.04102l0.09571 0.01367q0.07178 0 0.14013-0.02734 0.08545-0.07178 0.32129-0.28711 0.23926-0.21875 0.79981-0.76221l2.2832-2.2832q2.08496-2.09863 2.7002-2.71387 0.61524-0.61865 0.64599-0.68701 0.04102-0.08545 0.04102-0.23926 0-0.09912-0.00684-0.14014-0.00684-0.04102-0.03418-0.11279-0.04443-0.08203-0.13672-0.16406-0.08887-0.08545-0.18115-0.11963-0.08887-0.0376-0.20849-0.0376-0.11963 0-0.18799 0.02734z"
                fill="#FFFFFF"
              />
            </svg>
          </span>
          <p className="whitespace-nowrap text-[11.5px] text-[var(--muted)] [line-height:normal]">
            Almacenamiento configurado
          </p>
        </div>

        <Link
          href="/inicio"
          className="flex items-center gap-[5px] rounded-[7px] bg-[#007AFF] px-[11px] py-[5px] text-xs font-semibold text-white [line-height:normal] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#007AFF]"
        >
          Ir a Inicio
        </Link>
      </section>
    </OnboardingFrame>
  );
}
