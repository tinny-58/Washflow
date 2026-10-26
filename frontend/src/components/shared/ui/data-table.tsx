"use client";

import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Inbox } from "lucide-react";
import { TableRowSkeleton } from "./skeleton";
import { EmptyState } from "./empty-state";

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  render?: (row: T) => React.ReactNode;
  className?: string;
  mobileHidden?: boolean;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (row: T) => string;
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: {
    label: string;
    onClick?: () => void;
    href?: string;
  };
  pageSize?: number;
  mobileCardRender?: (row: T) => React.ReactNode;
  className?: string;
  onRowClick?: (row: T) => void;
}

export function DataTable<T>({
  columns,
  data,
  keyExtractor,
  loading = false,
  emptyTitle = "No records found",
  emptyDescription = "There are currently no items to display in this list.",
  emptyAction,
  pageSize = 10,
  mobileCardRender,
  className,
  onRowClick,
}: DataTableProps<T>) {
  const [currentPage, setCurrentPage] = useState<number>(1);

  const totalPages = Math.ceil(data.length / pageSize) || 1;
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedData = data.slice(startIndex, startIndex + pageSize);

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  if (loading) {
    return (
      <div className={cn("w-full overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]", className)}>
        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="bg-white/5 border-b border-white/10 text-slate-400 uppercase text-[10px] tracking-wider font-semibold">
              <tr>
                {columns.map((col) => (
                  <th key={col.key} className={cn("p-4", col.className)}>
                    {col.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 5 }).map((_, idx) => (
                <TableRowSkeleton key={idx} cols={columns.length} />
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile Skeleton Cards */}
        <div className="md:hidden p-4 space-y-3">
          {Array.from({ length: 3 }).map((_, idx) => (
            <div key={idx} className="p-4 rounded-xl border border-white/10 bg-white/5 animate-pulse space-y-2">
              <div className="h-4 bg-white/10 rounded w-1/3" />
              <div className="h-3 bg-white/10 rounded w-2/3" />
              <div className="h-3 bg-white/10 rounded w-1/2" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title={emptyTitle}
        description={emptyDescription}
        action={emptyAction}
        className={className}
      />
    );
  }

  return (
    <div className={cn("w-full overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] flex flex-col", className)}>
      {/* 1. Desktop & Tablet Table (> md) */}
      <div className="hidden md:block overflow-x-auto scrollbar-thin scrollbar-thumb-white/10">
        <table className="w-full text-left text-xs sm:text-sm border-collapse">
          <thead className="bg-white/5 border-b border-white/10 text-slate-400 uppercase text-[10px] tracking-wider font-semibold select-none">
            <tr>
              {columns.map((col) => (
                <th key={col.key} className={cn("p-4", col.className)}>
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {paginatedData.map((row) => {
              const rowKey = keyExtractor(row);
              return (
                <tr
                  key={rowKey}
                  onClick={() => onRowClick && onRowClick(row)}
                  className={cn(
                    "hover:bg-white/[0.04] transition-colors group",
                    onRowClick && "cursor-pointer"
                  )}
                >
                  {columns.map((col) => (
                    <td key={col.key} className={cn("p-4 text-slate-200", col.className)}>
                      {col.render ? col.render(row) : (row as any)[col.key]}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 2. Mobile Responsive Card List (< md) */}
      <div className="md:hidden divide-y divide-white/10">
        {paginatedData.map((row) => {
          const rowKey = keyExtractor(row);
          if (mobileCardRender) {
            return (
              <div
                key={rowKey}
                onClick={() => onRowClick && onRowClick(row)}
                className={cn("p-4 transition hover:bg-white/[0.03]", onRowClick && "cursor-pointer")}
              >
                {mobileCardRender(row)}
              </div>
            );
          }

          // Default Mobile Card
          return (
            <div
              key={rowKey}
              onClick={() => onRowClick && onRowClick(row)}
              className={cn("p-4 space-y-2.5 transition hover:bg-white/[0.03]", onRowClick && "cursor-pointer")}
            >
              {columns
                .filter((c) => !c.mobileHidden)
                .map((col) => (
                  <div key={col.key} className="flex items-center justify-between gap-3 text-xs">
                    <span className="text-slate-400 text-[11px] font-medium">{col.header}:</span>
                    <span className="font-semibold text-slate-100 text-right">
                      {col.render ? col.render(row) : (row as any)[col.key]}
                    </span>
                  </div>
                ))}
            </div>
          );
        })}
      </div>

      {/* 3. Pagination Controls (if data exceeds pageSize) */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-white/10 bg-white/[0.02] text-xs text-slate-400">
          <div>
            Showing <span className="font-bold text-white">{startIndex + 1}</span> to{" "}
            <span className="font-bold text-white">{Math.min(startIndex + pageSize, data.length)}</span> of{" "}
            <span className="font-bold text-white">{data.length}</span> results
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => handlePageChange(1)}
              disabled={currentPage === 1}
              className="p-1.5 rounded-lg border border-white/10 hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none text-slate-300"
              aria-label="First page"
            >
              <ChevronsLeft className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="p-1.5 rounded-lg border border-white/10 hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none text-slate-300"
              aria-label="Previous page"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>

            <span className="px-2 text-slate-300 font-mono">
              {currentPage} / {totalPages}
            </span>

            <button
              type="button"
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded-lg border border-white/10 hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none text-slate-300"
              aria-label="Next page"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => handlePageChange(totalPages)}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded-lg border border-white/10 hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none text-slate-300"
              aria-label="Last page"
            >
              <ChevronsRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
