"use client";

import React, { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Calendar as CalendarIcon,
  Check,
  AlertCircle,
  X,
} from "lucide-react";
import { StatusChip } from "./status-chip";

export type DayCapacityStatus = "available" | "limited" | "full" | "closed";

export interface DayCapacityInfo {
  date: string; // YYYY-MM-DD
  status: DayCapacityStatus;
  availableSlots: number;
  totalCapacity: number;
  reason?: string;
}

export interface PickupWindowOption {
  id: string;
  name: string; // e.g., "Morning (8:00 AM - 11:00 AM)"
  startHour: number;
  endHour: number;
  capacity: number;
  reserved: number;
  available: boolean;
  reason?: string;
}

export interface CalendarProps {
  selectedDate: string | null; // YYYY-MM-DD
  onSelectDate: (date: string) => void;
  selectedWindowId?: string | null;
  onSelectWindow?: (window: PickupWindowOption) => void;
  capacityData?: Record<string, DayCapacityInfo>;
  windows?: PickupWindowOption[];
  minDate?: string; // YYYY-MM-DD (min lead time)
  maxDate?: string; // YYYY-MM-DD (horizon limit)
  closedDaysOfWeek?: number[]; // 0 = Sun, 6 = Sat
  className?: string;
}

export function Calendar({
  selectedDate,
  onSelectDate,
  selectedWindowId,
  onSelectWindow,
  capacityData = {},
  windows = [],
  minDate,
  maxDate,
  closedDaysOfWeek = [],
  className,
}: CalendarProps) {
  // Nairobi Current Date reference
  const todayStr = useMemo(() => {
    return new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Nairobi" });
  }, []);

  const [currentMonth, setCurrentMonth] = useState<Date>(() => {
    return selectedDate ? new Date(selectedDate) : new Date();
  });

  const [mobileSheetOpen, setMobileSheetOpen] = useState<boolean>(false);

  // Month navigation
  const prevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  const monthYearLabel = useMemo(() => {
    return currentMonth.toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
      timeZone: "Africa/Nairobi",
    });
  }, [currentMonth]);

  // Calendar days generation
  const daysInMonth = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();

    const firstDayIndex = new Date(year, month, 1).getDay(); // 0 is Sunday
    const lastDate = new Date(year, month + 1, 0).getDate();
    const prevMonthLastDate = new Date(year, month, 0).getDate();

    const days: {
      dateStr: string;
      dayNumber: number;
      isCurrentMonth: boolean;
      isDisabled: boolean;
      capacity?: DayCapacityInfo;
    }[] = [];

    // Previous month padding days
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const d = prevMonthLastDate - i;
      const prevDate = new Date(year, month - 1, d);
      const dateStr = prevDate.toLocaleDateString("en-CA", { timeZone: "Africa/Nairobi" });
      days.push({
        dateStr,
        dayNumber: d,
        isCurrentMonth: false,
        isDisabled: true,
      });
    }

    // Current month days
    for (let d = 1; d <= lastDate; d++) {
      const thisDate = new Date(year, month, d);
      const dateStr = thisDate.toLocaleDateString("en-CA", { timeZone: "Africa/Nairobi" });
      const dayOfWeek = thisDate.getDay();

      let isDisabled = false;
      if (minDate && dateStr < minDate) isDisabled = true;
      if (maxDate && dateStr > maxDate) isDisabled = true;
      if (closedDaysOfWeek.includes(dayOfWeek)) isDisabled = true;

      const cap = capacityData[dateStr];
      if (cap && (cap.status === "full" || cap.status === "closed")) {
        isDisabled = true;
      }

      days.push({
        dateStr,
        dayNumber: d,
        isCurrentMonth: true,
        isDisabled,
        capacity: cap,
      });
    }

    // Next month padding days to complete 35 or 42 grid cells
    const remaining = (7 - (days.length % 7)) % 7;
    for (let d = 1; d <= remaining; d++) {
      const nextDate = new Date(year, month + 1, d);
      const dateStr = nextDate.toLocaleDateString("en-CA", { timeZone: "Africa/Nairobi" });
      days.push({
        dateStr,
        dayNumber: d,
        isCurrentMonth: false,
        isDisabled: true,
      });
    }

    return days;
  }, [currentMonth, minDate, maxDate, closedDaysOfWeek, capacityData]);

  const handleDateClick = (dateStr: string, isDisabled: boolean) => {
    if (isDisabled) return;
    onSelectDate(dateStr);
    if (windows.length > 0) {
      setMobileSheetOpen(true);
    }
  };

  const getCapacityStatusBadge = (status?: DayCapacityStatus) => {
    if (!status) return null;
    switch (status) {
      case "available":
        return <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" title="Slots Available" />;
      case "limited":
        return <span className="w-1.5 h-1.5 rounded-full bg-amber-400" title="Limited Capacity" />;
      case "full":
        return <span className="w-1.5 h-1.5 rounded-full bg-rose-400" title="Fully Booked" />;
      case "closed":
        return <span className="w-1.5 h-1.5 rounded-full bg-slate-500" title="Closed" />;
    }
  };

  return (
    <div className={cn("w-full flex flex-col space-y-4", className)}>
      {/* Month Header Navigation */}
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-2">
          <CalendarIcon className="w-5 h-5 text-sky-400" />
          <h4 className="text-base font-bold text-white tracking-tight">{monthYearLabel}</h4>
          <span className="text-[10px] text-slate-400 font-mono hidden sm:inline">(EAT / Nairobi)</span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={prevMonth}
            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 transition"
            aria-label="Previous Month"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={nextMonth}
            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 transition"
            aria-label="Next Month"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-1 sm:gap-2 text-center text-xs font-semibold text-slate-400 uppercase select-none">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
          <div key={day} className="py-1">
            {day}
          </div>
        ))}
      </div>

      {/* Month Days Grid */}
      <div className="grid grid-cols-7 gap-1 sm:gap-2 select-none" role="grid">
        {daysInMonth.map((day, idx) => {
          const isSelected = selectedDate === day.dateStr;
          const isToday = day.dateStr === todayStr;

          return (
            <button
              key={`${day.dateStr}-${idx}`}
              type="button"
              disabled={day.isDisabled || !day.isCurrentMonth}
              onClick={() => handleDateClick(day.dateStr, day.isDisabled)}
              className={cn(
                "relative min-h-[44px] sm:min-h-[54px] rounded-xl flex flex-col items-center justify-center p-1 sm:p-2 text-xs sm:text-sm font-medium transition-all outline-none",
                day.isCurrentMonth
                  ? "border border-white/10 hover:border-sky-400/50 hover:bg-white/5"
                  : "opacity-20 pointer-events-none border border-transparent",
                day.isDisabled && day.isCurrentMonth && "opacity-40 line-through bg-slate-900/40 border-white/5 cursor-not-allowed",
                isSelected && "bg-sky-500/20 border-sky-400 text-sky-200 font-bold shadow-lg shadow-sky-500/10 ring-2 ring-sky-400/30",
                isToday && !isSelected && "border-amber-400/50 text-amber-300 font-bold"
              )}
              aria-selected={isSelected}
              aria-label={`${day.dateStr} ${day.isDisabled ? "Unavailable" : "Available"}`}
            >
              <span>{day.dayNumber}</span>

              {/* Status indicator dot */}
              {day.isCurrentMonth && !day.isDisabled && (
                <div className="mt-1 flex items-center justify-center gap-0.5">
                  {getCapacityStatusBadge(day.capacity?.status || "available")}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Capacity Legend */}
      <div className="flex flex-wrap items-center justify-center gap-4 pt-2 text-[11px] text-slate-400 border-t border-white/5">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          <span>Available</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-amber-400" />
          <span>Limited</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-rose-400" />
          <span>Full</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-slate-500" />
          <span>Closed</span>
        </div>
      </div>

      {/* Pickup Windows Selection Sheet (Desktop inline or Mobile Bottom Sheet) */}
      {selectedDate && windows.length > 0 && (
        <div className="mt-4 pt-4 border-t border-white/10 space-y-3">
          <div className="flex items-center justify-between">
            <h5 className="text-xs sm:text-sm font-bold text-white flex items-center gap-2">
              <Clock className="w-4 h-4 text-sky-400" />
              <span>Pickup Windows for {selectedDate}</span>
            </h5>
            <span className="text-xs text-slate-400 font-mono">Select a 3-hour window</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {windows.map((win) => {
              const isWinSelected = selectedWindowId === win.id;
              return (
                <button
                  key={win.id}
                  type="button"
                  disabled={!win.available}
                  onClick={() => onSelectWindow && onSelectWindow(win)}
                  className={cn(
                    "min-h-[44px] flex items-center justify-between px-3.5 py-2.5 rounded-xl border text-xs sm:text-sm font-medium transition text-left",
                    isWinSelected
                      ? "bg-sky-500/20 border-sky-400 text-sky-200 font-semibold"
                      : win.available
                      ? "bg-white/5 border-white/10 hover:border-white/20 text-slate-200"
                      : "opacity-40 border-white/5 bg-slate-900/40 text-slate-400 line-through cursor-not-allowed"
                  )}
                >
                  <div className="flex flex-col">
                    <span className="leading-tight">{win.name}</span>
                    <span className="text-[10px] text-slate-400 font-mono mt-0.5">
                      {win.available
                        ? `${win.capacity - win.reserved} slots left`
                        : win.reason || "Full"}
                    </span>
                  </div>

                  {isWinSelected && <Check className="w-4 h-4 text-sky-400 shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
