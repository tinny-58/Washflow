import React from "react";
import { cn } from "@/lib/utils";

export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-xl bg-white/10", className)}
      {...props}
    />
  );
}

export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-2xl p-5 border border-white/10 bg-white/[0.04] backdrop-blur-md space-y-4",
        className
      )}
    >
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-4 w-12 rounded-full" />
      </div>
      <Skeleton className="h-3 w-48" />
      <div className="space-y-2 pt-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
      </div>
      <div className="pt-2 flex justify-between">
        <Skeleton className="h-8 w-24 rounded-xl" />
        <Skeleton className="h-8 w-20 rounded-xl" />
      </div>
    </div>
  );
}

export function TableRowSkeleton({
  cols = 5,
  className,
}: {
  cols?: number;
  className?: string;
}) {
  return (
    <tr className={cn("border-b border-white/5", className)}>
      {Array.from({ length: cols }).map((_, idx) => (
        <td key={idx} className="p-4">
          <Skeleton className="h-4 w-full max-w-[120px]" />
        </td>
      ))}
    </tr>
  );
}

export function StatTileSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-2xl p-4 sm:p-5 border border-white/10 bg-white/[0.04] backdrop-blur-md space-y-3",
        className
      )}
    >
      <div className="flex items-center justify-between">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-7 w-7 rounded-lg" />
      </div>
      <Skeleton className="h-7 w-28" />
      <Skeleton className="h-3 w-36" />
    </div>
  );
}
