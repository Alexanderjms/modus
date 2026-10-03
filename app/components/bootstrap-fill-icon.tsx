import type { HTMLAttributes } from "react";

type BootstrapFillIconName = "hdd" | "cloud" | "check-circle";

type BootstrapFillIconProps = Omit<HTMLAttributes<HTMLElement>, "children"> & {
  name: BootstrapFillIconName;
};

export function BootstrapFillIcon({ name, className, ...props }: BootstrapFillIconProps) {
  return (
    <i
      aria-hidden="true"
      className={["bi", `bi-${name}-fill`, className].filter(Boolean).join(" ")}
      {...props}
    />
  );
}
