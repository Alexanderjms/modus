"use client";

import { createContext, useContext, type ReactNode } from "react";

const UserContext = createContext<string | null>(null);

export function UserProvider({ name, children }: { name: string | null; children: ReactNode }) {
  return <UserContext.Provider value={name}>{children}</UserContext.Provider>;
}

export const useUserName = () => useContext(UserContext);

export function userInitials(name: string | null) {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  const letters = words.length > 1 ? words[0][0] + words[1][0] : words[0].slice(0, 2);
  return letters.toLocaleUpperCase();
}
