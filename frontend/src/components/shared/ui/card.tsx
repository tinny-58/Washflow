import React from "react";
import { cn } from "@/lib/utils";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "glass" | "solid" | "subtle" | "accent";
  hoverEffect?: boolean;
}

export function Card({
  className,
  variant = "glass",
  hoverEffect = false,
  children,
  ...props
}: CardProps) {
  const variantClasses = {
    glass:
      "bg-white/[0.04] backdrop-blur-xl border border-white/10 shadow-xl shadow-black/20",
    solid:
      "bg-slate-900 border border-white/10 shadow-2xl shadow-black/40",
    subtle:
      "bg-white/[0.02] border border-white/5",
    accent:
      "bg-gradient-to-br from-sky-500/10 via-white/[0.03] to-indigo-500/10 border border-sky-500/20 shadow-xl shadow-sky-500/5",
  };

  return (
    <div
      className={cn(
        "rounded-2xl p-5 text-slate-100 transition-all duration-200",
        variantClasses[variant],
        hoverEffect &&
          "hover:border-white/20 hover:bg-white/[0.06] hover:shadow-2xl hover:-translate-y-0.5",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex flex-col space-y-1.5 pb-4", className)} {...props}>
      {children}
    </div>
  );
}

export function CardTitle({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn(
        "text-base sm:text-lg font-bold tracking-tight text-white leading-tight",
        className
      )}
      {...props}
    >
      {children}
    </h3>
  );
}

export function CardDescription({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn("text-xs sm:text-sm text-slate-400 font-normal", className)} {...props}>
      {children}
    </p>
  );
}

export function CardContent({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("pt-0", className)} {...props}>
      {children}
    </div>
  );
}

export function CardFooter({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex items-center pt-4 border-t border-white/10 mt-4", className)}
      {...props}
    >
      {children}
    </div>
  );
}
