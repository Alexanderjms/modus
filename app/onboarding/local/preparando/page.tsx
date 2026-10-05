import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Preparando almacenamiento | Modus",
};

export default function LocalPreparingPage() {
  redirect("/onboarding/local");
}
