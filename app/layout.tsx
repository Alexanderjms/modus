import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { BrandHeader } from "./components/brand-header";
import "bootstrap-icons/font/bootstrap-icons.css";
import "./globals.css";

const geist = Geist({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-geist",
});

export const metadata: Metadata = {
  title: "Sona",
  description: "Sona project",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={geist.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `try { const saved = localStorage.getItem("modus-theme"); document.documentElement.dataset.theme = saved === "dark" || saved === "light" ? saved : matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"; } catch { document.documentElement.dataset.theme = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"; }` }} />
      </head>
      <body className="font-sans">
        <BrandHeader />
        {children}
      </body>
    </html>
  );
}
