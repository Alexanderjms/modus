import type { ReactNode } from "react";
import { BrandHeader } from "./brand-header";

export function OnboardingFrame({ children }: { children: ReactNode }) {
  return (
    <main className="relative isolate flex min-h-svh items-center justify-center overflow-hidden bg-[var(--page)] px-6 py-24 text-[var(--foreground)]">
      <BrandHeader />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      >
        <div className="absolute -left-40 top-[420px] size-[640px] rounded-full bg-[radial-gradient(ellipse_50%_50%_at_50%_50%,var(--ambient-blue)_0%,transparent_100%)]" />
        <div className="absolute left-[360px] -top-[140px] size-[640px] rounded-full bg-[radial-gradient(ellipse_50%_50%_at_50%_50%,var(--ambient-violet)_0%,transparent_100%)]" />
        <div className="absolute left-[780px] top-[420px] size-[640px] rounded-full bg-[radial-gradient(ellipse_50%_50%_at_50%_50%,var(--ambient-peach)_0%,transparent_100%)]" />
        <div className="absolute left-[1220px] -top-[140px] size-[640px] rounded-full bg-[radial-gradient(ellipse_50%_50%_at_50%_50%,var(--ambient-cyan)_0%,transparent_100%)]" />
      </div>
      {children}
    </main>
  );
}
