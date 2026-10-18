"use client";

import React, { useEffect, useState } from "react";
import { Plus, Minus, ShoppingBag, Layers, Bed, Sparkles } from "lucide-react";
import { PriceCatalogItem } from "@/db/schema";

interface CatalogSelectorProps {
  onItemsChange: (items: { catalogId: string; qty: number; item: PriceCatalogItem }[], total: number) => void;
}

export function CatalogSelector({ onItemsChange }: CatalogSelectorProps) {
  const [catalog, setCatalog] = useState<PriceCatalogItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeCategory, setActiveCategory] = useState<"basket" | "duvet" | "mat">("basket");
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  useEffect(() => {
    fetch("/api/catalog")
      .then((res) => res.json())
      .then((data) => {
        if (data.items) {
          setCatalog(data.items);
        }
      })
      .catch((err) => console.error("Failed to load catalog:", err))
      .finally(() => setLoading(false));
  }, []);

  const handleUpdateQty = (catalogId: string, delta: number) => {
    setQuantities((prev) => {
      const current = prev[catalogId] || 0;
      const next = Math.max(0, current + delta);
      const updated = { ...prev, [catalogId]: next };
      if (next === 0) {
        delete updated[catalogId];
      }

      // Notify parent
      const selected = Object.entries(updated).map(([id, qty]) => {
        const item = catalog.find((c) => c.id === id)!;
        return { catalogId: id, qty, item };
      });

      const total = selected.reduce((sum, i) => sum + i.qty * (i.item?.price || 0), 0);
      onItemsChange(selected, total);

      return updated;
    });
  };

  const categories = [
    { id: "basket", label: "Baskets (Everyday)", icon: ShoppingBag },
    { id: "duvet", label: "Duvets & Bedding", icon: Bed },
    { id: "mat", label: "Floor & Bath Mats", icon: Layers },
  ] as const;

  const currentItems = catalog.filter((item) => item.category === activeCategory);

  const selectedCount = Object.values(quantities).reduce((a, b) => a + b, 0);

  if (loading) {
    return (
      <div className="py-12 flex flex-col items-center justify-center space-y-3">
        <div className="w-8 h-8 rounded-full border-2 border-sky-400 border-t-transparent animate-spin" />
        <p className="text-xs text-slate-400 font-medium">Loading live service catalog...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="text-sm font-semibold text-slate-200 flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 text-sky-400" />
          Choose Laundry Items
        </label>
        {selectedCount > 0 && (
          <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-sky-500/20 border border-sky-500/30 text-sky-300 animate-pulse">
            {selectedCount} item{selectedCount > 1 ? "s" : ""} selected
          </span>
        )}
      </div>

      {/* Category Tabs */}
      <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-slate-900/60 border border-white/10">
        {categories.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveCategory(id)}
            className={`py-2 px-2 rounded-lg text-xs font-medium flex flex-col sm:flex-row items-center justify-center gap-1.5 transition ${
              activeCategory === id
                ? "bg-sky-500 text-white shadow-md shadow-sky-500/25 font-semibold"
                : "text-slate-300 hover:text-white hover:bg-white/5"
            }`}
          >
            <Icon className="w-4 h-4" />
            <span className="truncate">{label.split(" ")[0]}</span>
          </button>
        ))}
      </div>

      {/* Catalog Items List */}
      <div className="space-y-2.5">
        {currentItems.map((item) => {
          const qty = quantities[item.id] || 0;
          return (
            <div
              key={item.id}
              className={`p-3.5 rounded-2xl border transition-all ${
                qty > 0
                  ? "bg-sky-500/15 border-sky-400/50 shadow-sm"
                  : "bg-white/5 border-white/10 hover:border-white/20"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <h4 className="text-sm font-semibold text-white tracking-tight">
                    {item.variant}
                  </h4>
                  {item.description && (
                    <p className="text-xs text-slate-300 mt-0.5 line-clamp-2">
                      {item.description}
                    </p>
                  )}
                  <div className="mt-2 text-xs font-bold text-sky-300">
                    KES {item.price.toLocaleString()} <span className="text-[10px] font-normal text-slate-400">/ unit</span>
                  </div>
                </div>

                {/* Quantity Stepper */}
                <div className="flex items-center gap-2 bg-slate-900/70 p-1 rounded-xl border border-white/10 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleUpdateQty(item.id, -1)}
                    disabled={qty === 0}
                    className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/15 text-slate-200 flex items-center justify-center transition disabled:opacity-30 disabled:pointer-events-none active:scale-95"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>

                  <span className="w-6 text-center text-sm font-bold text-white">
                    {qty}
                  </span>

                  <button
                    type="button"
                    onClick={() => handleUpdateQty(item.id, 1)}
                    className="w-8 h-8 rounded-lg bg-sky-500 hover:bg-sky-400 text-white flex items-center justify-center transition active:scale-95 shadow-sm shadow-sky-500/20"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
