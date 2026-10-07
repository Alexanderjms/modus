import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Geist } from "next/font/google";
import "bootstrap-icons/font/bootstrap-icons.css";
import "./globals.css";
import "./theme.css";
import "./panels.css";
import { PinLockScreen } from "./components/pin-lock-screen";
import { UNLOCK_COOKIE, hasPin, isUnlocked } from "../db/local/pin-lock.cjs";

const geist = Geist({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-geist",
});

export const metadata: Metadata = {
  title: "modus",
  description: "modus project",
  icons: { icon: "/favicon.png" },
};

export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locked = hasPin() && !isUnlocked((await cookies()).get(UNLOCK_COOKIE)?.value);

  return (
    <html lang="es" className={geist.variable} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try { const saved = localStorage.getItem("modus-theme"); document.documentElement.dataset.theme = saved === "dark" || saved === "light" ? saved : matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"; } catch { document.documentElement.dataset.theme = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"; }`,
          }}
        />
      </head>
      <body className="font-sans">{locked ? <PinLockScreen /> : children}</body>
    </html>
  );
}
