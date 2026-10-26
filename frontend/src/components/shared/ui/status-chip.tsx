import React from "react";
import { cn } from "@/lib/utils";

export type StatusChipVariant =
  | "amber"
  | "sky"
  | "indigo"
  | "cyan"
  | "emerald"
  | "rose"
  | "slate";

export interface StatusChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  label: React.ReactNode;
  variant?: StatusChipVariant;
  dot?: boolean;
  pulse?: boolean;
  size?: "sm" | "md" | "lg";
  accessibleLabel?: string;
}

export function StatusChip({
  label,
  variant = "slate",
  dot = true,
  pulse = false,
  size = "md",
  accessibleLabel,
  className,
  ...props
}: StatusChipProps) {
  const variantStyles: Record<
    StatusChipVariant,
    { badge: string; dot: string; ping: string }
  > = {
    amber: {
      badge: "bg-amber-500/15 text-amber-300 border-amber-500/30",
      dot: "bg-amber-400",
      ping: "bg-amber-400/75",
    },
    sky: {
      badge: "bg-sky-500/15 text-sky-300 border-sky-500/30",
      dot: "bg-sky-400",
      ping: "bg-sky-400/75",
    },
    indigo: {
      badge: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
      dot: "bg-indigo-400",
      ping: "bg-indigo-400/75",
    },
    cyan: {
      badge: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
      dot: "bg-cyan-400",
      ping: "bg-cyan-400/75",
    },
    emerald: {
      badge: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
      dot: "bg-emerald-400",
      ping: "bg-emerald-400/75",
    },
    rose: {
      badge: "bg-rose-500/15 text-rose-300 border-rose-500/30",
      dot: "bg-rose-400",
      ping: "bg-rose-400/75",
    },
    slate: {
      badge: "bg-slate-500/15 text-slate-300 border-slate-500/30",
      dot: "bg-slate-400",
      ping: "bg-slate-400/75",
    },
  };

  const sizeStyles = {
    sm: "px-2 py-0.5 text-[10px] gap-1",
    md: "px-2.5 py-1 text-xs gap-1.5",
    lg: "px-3 py-1.5 text-sm gap-2",
  };

  const dotSizes = {
    sm: "w-1.5 h-1.5",
    md: "w-2 h-2",
    lg: "w-2.5 h-2.5",
  };

  const currentVariant = variantStyles[variant];

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full font-medium border font-mono tracking-wide select-none transition-colors",
        currentVariant.badge,
        sizeStyles[size],
        className
      )}
      aria-label={accessibleLabel || (typeof label === "string" ? label : undefined)}
      {...props}
    >
      {dot && (
        <span className="relative flex shrink-0">
          {pulse && (
            <span
              className={cn(
                "absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping",
                currentVariant.ping
              )}
            />
          )}
          <span
            className={cn(
              "relative inline-flex rounded-full shrink-0",
              dotSizes[size],
              currentVariant.dot
            )}
          />
        </span>
      )}
      <span className="truncate">{label}</span>
    </span>
  );
}
