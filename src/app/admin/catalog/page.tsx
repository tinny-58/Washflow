"use client";

import React, { useEffect, useState } from "react";
import { Plus, Tag, Edit2, Check, X, ToggleLeft, ToggleRight, Sparkles } from "lucide-react";
import { GlassCard } from "@/components/shared/glass-card";
import { PriceCatalogItem } from "@/db/schema";

export default function AdminCatalogPage() {
  const [items, setItems] = useState<PriceCatalogItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // New item form
  const [showAddForm, setShowAddForm] = useState<boolean>(false);
  const [newCategory, setNewCategory] = useState<"basket" | "duvet" | "mat">("duvet");
  const [newVariant, setNewVariant] = useState<string>("");
  const [newPrice, setNewPrice] = useState<string>("500");
  const [newDescription, setNewDescription] = useState<string>("");

  // Editing state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState<string>("");
  const [editVariant, setEditVariant] = useState<string>("");

  const fetchCatalog = async () => {
    try {
      const res = await fetch("/api/admin/catalog");
      const data = await res.json();
      if (data.items) {
        setItems(data.items);
      }
    } catch (err) {
      console.error("Failed to load admin catalog:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCatalog();
  }, []);

  const handleCreateItem = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/admin/catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: newCategory,
          variant: newVariant,
          price: parseInt(newPrice, 10),
          description: newDescription,
        }),
      });

      if (res.ok) {
        setShowAddForm(false);
        setNewVariant("");
        setNewDescription("");
        fetchCatalog();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to add item");
      }
    } catch {
      alert("Network error");
    }
  };

  const handleToggleActive = async (id: string, currentActive: boolean) => {
    try {
      const res = await fetch("/api/admin/catalog", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, active: !currentActive }),
      });
      if (res.ok) {
        fetchCatalog();
      }
    } catch {
      alert("Failed to toggle status");
    }
  };

  const handleSaveEdit = async (id: string) => {
    try {
      const res = await fetch("/api/admin/catalog", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          price: parseInt(editPrice, 10),
          variant: editVariant,
        }),
      });
      if (res.ok) {
        setEditingId(null);
        fetchCatalog();
      }
    } catch {
      alert("Failed to save changes");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Tag className="w-5 h-5 text-emerald-400" />
            <span>Price Catalog Management</span>
          </h2>
          <p className="text-xs text-slate-300">
            Edit live service pricing. Changes instantly reflect for all customers.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowAddForm(!showAddForm)}
          className="px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-bold text-xs shadow-lg shadow-sky-500/20 flex items-center gap-1.5 transition active:scale-95"
        >
          <Plus className="w-4 h-4" />
          <span>Add Catalog Item</span>
        </button>
      </div>

      {/* Add New Item Modal / Form */}
      {showAddForm && (
        <GlassCard className="border-sky-500/40 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white">Add New Laundry Tier / Size</h3>
            <button
              onClick={() => setShowAddForm(false)}
              className="text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleCreateItem} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Category
              </label>
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value as any)}
                className="w-full px-3 py-2 rounded-xl glass-input text-xs text-white"
              >
                <option value="basket">Basket (Everyday Wear)</option>
                <option value="duvet">Duvet & Bedding</option>
                <option value="mat">Floor & Bath Mat</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Price (KES) <span className="text-rose-400">*</span>
              </label>
              <input
                type="number"
                min="50"
                step="10"
                required
                value={newPrice}
                onChange={(e) => setNewPrice(e.target.value)}
                className="w-full px-3 py-2 rounded-xl glass-input text-xs text-white"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Variant Title / Dimension <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Super King 7x7 Duvet / Giant Shaggy Carpet"
                value={newVariant}
                onChange={(e) => setNewVariant(e.target.value)}
                className="w-full px-3 py-2 rounded-xl glass-input text-xs text-white"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Description (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Deep steam sanitization and warm fluff cycle"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                className="w-full px-3 py-2 rounded-xl glass-input text-xs text-white"
              />
            </div>

            <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-4 py-2 rounded-xl bg-white/10 text-xs text-slate-300"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-xs shadow-md"
              >
                Save Item
              </button>
            </div>
          </form>
        </GlassCard>
      )}

      {/* Catalog Table */}
      <GlassCard className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/80 border-b border-white/10 text-slate-300 uppercase tracking-wider font-semibold">
              <tr>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Variant / Dimensions</th>
                <th className="px-4 py-3">Price (KES)</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {items.map((item) => {
                const isEditing = editingId === item.id;
                return (
                  <tr key={item.id} className="hover:bg-white/5 transition">
                    <td className="px-4 py-3 font-semibold text-white capitalize">
                      {item.category}
                    </td>

                    <td className="px-4 py-3 text-slate-200">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editVariant}
                          onChange={(e) => setEditVariant(e.target.value)}
                          className="px-2 py-1 rounded bg-slate-900 border border-sky-400 text-xs text-white"
                        />
                      ) : (
                        <div>
                          <div className="font-medium text-white">{item.variant}</div>
                          {item.description && (
                            <div className="text-[11px] text-slate-400">{item.description}</div>
                          )}
                        </div>
                      )}
                    </td>

                    <td className="px-4 py-3 font-bold text-sky-300">
                      {isEditing ? (
                        <input
                          type="number"
                          value={editPrice}
                          onChange={(e) => setEditPrice(e.target.value)}
                          className="w-24 px-2 py-1 rounded bg-slate-900 border border-sky-400 text-xs text-white"
                        />
                      ) : (
                        `KES ${item.price.toLocaleString()}`
                      )}
                    </td>

                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => handleToggleActive(item.id, item.active)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold ${
                          item.active
                            ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                            : "bg-slate-700/50 text-slate-400 border border-white/10"
                        }`}
                      >
                        {item.active ? "Active" : "Inactive"}
                      </button>
                    </td>

                    <td className="px-4 py-3 text-right">
                      {isEditing ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleSaveEdit(item.id)}
                            className="p-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-white"
                            title="Save"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="p-1.5 rounded-lg bg-white/10 text-slate-300"
                            title="Cancel"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(item.id);
                            setEditPrice(item.price.toString());
                            setEditVariant(item.variant);
                          }}
                          className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-slate-300 hover:text-white transition"
                          title="Edit Price"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </div>
  );
}
