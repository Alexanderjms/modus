import type { Metadata } from "next";
import { OnboardingFrame } from "../../../components/onboarding-frame";
import { LocalStoragePreparation } from "../../../components/local-storage-preparation";

export const metadata: Metadata = {
  title: "Preparando almacenamiento | Modus",
};

export default function LocalPreparingPage() {
  return (
    <OnboardingFrame>
      <LocalStoragePreparation />
    </OnboardingFrame>
  );
}
