"use client";

import Image from "next/image";
import logo from "../public/Logo.png";
import { ThemeToggle } from "./shell/theme-toggle";

export function BrandHeader() {
  return (
    <header className="absolute left-6 right-6 top-6 z-20 flex items-center justify-between gap-4 sm:left-8 sm:right-8 sm:top-8">
      <div className="flex items-end gap-1">
        <Image
          src={logo}
          alt=""
          width={48}
          height={32}
          priority
          className="h-8 w-12 rounded-md object-contain"
        />
        <span className="-translate-y-0.5 text-xl font-semibold leading-none tracking-[-0.3px]">
          Modus
        </span>
      </div>
      <ThemeToggle />
    </header>
  );
}
