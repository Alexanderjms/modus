import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { Geist } from "next/font/google";
import "bootstrap-icons/font/bootstrap-icons.css";
import "./globals.css";
import "./theme.css";
import "./panels.css";
import { PinLockScreen } from "./components/pin-lock-screen";
import { I18nProvider } from "./i18n/provider";
import { UserProvider } from "./components/user-context";
import { getLocalProfileName } from "../db/local/profile.cjs";
import { getCloudProfile, getSessionUserId } from "../db/local/pin-lock.cjs";
import { getStorageMode } from "../db/local/storage.cjs";
import { getLang } from "./i18n/server";
import { isSignedOut } from "../db/local/storage.cjs";
import { UNLOCK_COOKIE, lockKind, isUnlocked } from "../db/local/pin-lock.cjs";

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
  if (isSignedOut()) {
    const pathname = (await headers()).get("x-pathname") ?? "/";
    if (pathname !== "/" && !pathname.startsWith("/onboarding")) redirect("/");
  }
  const unlocked = isUnlocked((await cookies()).get(UNLOCK_COOKIE)?.value);
  const kind = unlocked ? null : lockKind();
  const lang = await getLang();
  let userName: string | null = null;
  if (!kind && !isSignedOut()) {
    try {
      userName = getStorageMode() === "turso"
        ? getCloudProfile(getSessionUserId((await cookies()).get(UNLOCK_COOKIE)?.value))?.username ?? null
        : getLocalProfileName();
    } catch {}
  }

  return (
    <html lang={lang} className={geist.variable} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try { const saved = localStorage.getItem("modus-theme"); document.documentElement.dataset.theme = saved === "dark" || saved === "light" ? saved : matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"; } catch { document.documentElement.dataset.theme = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"; }`,
          }}
        />
      </head>
      <body className="font-sans">
        <I18nProvider initialLang={lang}>
          <UserProvider name={userName}>{kind ? <PinLockScreen kind={kind} /> : children}</UserProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
