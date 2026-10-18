import React from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  hoverEffect?: boolean;
}

export function GlassCard({
  children,
  className,
  hoverEffect = false,
  ...props
}: GlassCardProps) {
  return (
    <div
      className={twMerge(
        clsx(
          "glass-card rounded-2xl p-5 text-slate-100",
          hoverEffect && "glass-card-hover",
          className
        )
      )}
      {...props}
    >
      {children}
    </div>
  );
}
