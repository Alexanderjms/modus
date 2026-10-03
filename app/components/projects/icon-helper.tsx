"use client";

export function Icon({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  return <i aria-hidden className={`bi bi-${name} ${className ?? ""}`} />;
}
