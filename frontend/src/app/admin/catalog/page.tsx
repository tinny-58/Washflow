"use client";

import React, { useEffect, useState, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Tag,
  Plus,
  Edit2,
  Check,
  X,
  ExternalLink,
  RefreshCw,
  ArrowUp,
  ArrowDown,
  Upload,
  AlertTriangle,
  ShieldAlert,
  Sparkles,
  Eye,
  CheckCircle2,
} from "lucide-react";
import { GlassCard } from "@/components/shared/glass-card";
import { ServiceIllustration } from "@/components/shared/service-illustrations";
import { PriceCatalogItem } from "@/lib/types";

export default function AdminCatalogPage() {
  const [items, setItems] = useState<PriceCatalogItem[]>([]);
  const [catalogVersion, setCatalogVersion] = useState<number>(1);
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [syncStatus, setSyncStatus] = useState<"synced" | "syncing" | "error">("synced");

  // Edit / Create Modal state
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingItem, setEditingItem] = useState<PriceCatalogItem | null>(null);

  // Form Fields
  const [formCategory, setFormCategory] = useState<string>("basket");
  const [formVariant, setFormVariant] = useState<string>("");
  const [formPrice, setFormPrice] = useState<string>("300");
  const [formDescription, setFormDescription] = useState<string>("");
  const [formSizeLabel, setFormSizeLabel] = useState<string>("Up to 7 kg");
  const [formBadge, setFormBadge] = useState<string>("");
  const [formImageUrl, setFormImageUrl] = useState<string>("");
  const [formImageAlt, setFormImageAlt] = useState<string>("");
  const [formCategoryDescription, setFormCategoryDescription] = useState<string>("");
  const [formDisplayOrder, setFormDisplayOrder] = useState<number>(0);
  const [formActive, setFormActive] = useState<boolean>(true);

  // Uploading state
  const [uploadingImage, setUploadingImage] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Guard Modals: Price Deviation & Step-up
  const [pendingSavePayload, setPendingSavePayload] = useState<any>(null);
  const [showDeviationModal, setShowDeviationModal] = useState<boolean>(false);
  const [deviationInfo, setDeviationInfo] = useState<{ oldPrice: number; newPrice: number; percentage: number } | null>(null);

  const [showStepUpModal, setShowStepUpModal] = useState<boolean>(false);
  const [stepUpPin, setStepUpPin] = useState<string>("");
  const [stepUpError, setStepUpError] = useState<string>("");

  // Concurrency conflict modal
  const [showConflictModal, setShowConflictModal] = useState<boolean>(false);

  const fetchCatalog = async () => {
    try {
      setSyncStatus("syncing");
      const res = await fetch("/api/admin/catalog");
      const data = await res.json();
      if (data.items) {
        setItems(data.items);
        setCatalogVersion(data.catalogVersion || 1);
        setLastUpdated(data.lastUpdated || new Date().toISOString());
        setSyncStatus("synced");
      }
    } catch (err) {
      console.error("Failed to load admin catalog:", err);
      setSyncStatus("error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCatalog();
  }, []);

  const openCreateModal = () => {
    setEditingItem(null);
    setFormCategory("basket");
    setFormVariant("");
    setFormPrice("300");
    setFormDescription("");
    setFormSizeLabel("Up to 7 kg");
    setFormBadge("");
    setFormImageUrl("");
    setFormImageAlt("");
    setFormCategoryDescription("Everyday wearable clothes washed individually, tumble-dried and folded crisp.");
    setFormDisplayOrder(items.length + 1);
    setFormActive(true);
    setIsModalOpen(true);
  };

  const openEditModal = (item: PriceCatalogItem) => {
    setEditingItem(item);
    setFormCategory(item.category);
    setFormVariant(item.variant);
    setFormPrice(item.price.toString());
    setFormDescription(item.description || "");
    setFormSizeLabel(item.sizeLabel || "");
    setFormBadge(item.badge || "");
    setFormImageUrl(item.imageUrl || "");
    setFormImageAlt(item.imageAlt || "");
    setFormCategoryDescription(item.categoryDescription || "");
    setFormDisplayOrder(item.displayOrder || 0);
    setFormActive(item.active);
    setIsModalOpen(true);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      alert("Only JPEG, PNG, or WebP images are allowed.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert("Image must be smaller than 5 MB.");
      return;
    }

    try {
      setUploadingImage(true);
      const formData = new FormData();
      formData.append("image", file);

      const res = await fetch("/api/admin/catalog/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (res.ok && data.url) {
        setFormImageUrl(data.url);
        if (!formImageAlt) {
          setFormImageAlt(`${formVariant || "Service"} illustration`);
        }
      } else {
        alert(data.error || "Image upload failed");
      }
    } catch {
      alert("Network error during image upload");
    } finally {
      setUploadingImage(false);
    }
  };

  const executeSave = async (payload: any) => {
    try {
      const isEdit = !!editingItem;
      const url = isEdit ? `/api/admin/catalog/${editingItem.id}` : "/api/admin/catalog";
      const method = isEdit ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (res.status === 422 && data.requiresConfirmation) {
        // Price deviation > 20% guard
        setPendingSavePayload(payload);
        setDeviationInfo({
          oldPrice: data.oldPrice,
          newPrice: data.newPrice,
          percentage: Math.round((Math.abs(data.newPrice - data.oldPrice) / data.oldPrice) * 100),
        });
        setShowDeviationModal(true);
        return;
      }

      if (res.status === 403 && data.requiresStepUp) {
        // Step-up authentication guard
        setPendingSavePayload(payload);
        setShowStepUpModal(true);
        return;
      }

      if (res.status === 409) {
        // Concurrency conflict
        setShowConflictModal(true);
        return;
      }

      if (!res.ok) {
        alert(data.error || "Failed to save catalog item");
        return;
      }

      // Success
      setIsModalOpen(false);
      setShowDeviationModal(false);
      setShowStepUpModal(false);
      setPendingSavePayload(null);
      await fetchCatalog();
    } catch {
      alert("Network error occurred while saving item.");
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const newPriceNum = parseInt(formPrice, 10);
    if (isNaN(newPriceNum) || newPriceNum < 50) {
      alert("Price must be at least KES 50.");
      return;
    }

    const payload: any = {
      category: formCategory,
      variant: formVariant,
      price: newPriceNum,
      description: formDescription || null,
      sizeLabel: formSizeLabel || null,
      imageUrl: formImageUrl || null,
      imageAlt: formImageAlt || null,
      badge: formBadge || null,
      displayOrder: formDisplayOrder,
      categoryDescription: formCategoryDescription || null,
      active: formActive,
    };

    if (editingItem) {
      payload.version = editingItem.version;
    }

    await executeSave(payload);
  };

  const handleConfirmDeviation = async () => {
    if (!pendingSavePayload) return;
    const updated = { ...pendingSavePayload, confirmedDeviation: true };
    setShowDeviationModal(false);
    await executeSave(updated);
  };

  const handleConfirmStepUp = async () => {
    if (!stepUpPin.trim()) {
      setStepUpError("Enter admin authorization PIN.");
      return;
    }
    const updated = {
      ...pendingSavePayload,
      stepUpConfirmed: true,
      adminPin: stepUpPin,
    };
    setShowStepUpModal(false);
    setStepUpPin("");
    setStepUpError("");
    await executeSave(updated);
  };

  const handleMoveOrder = async (index: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= items.length) return;

    const newItems = [...items];
    const temp = newItems[index];
    newItems[index] = newItems[targetIndex];
    newItems[targetIndex] = temp;

    // Re-assign displayOrder sequence
    const reordered = newItems.map((item, idx) => ({
      id: item.id,
      displayOrder: idx + 1,
    }));

    setItems(
      newItems.map((item, idx) => ({
        ...item,
        displayOrder: idx + 1,
      }))
    );

    try {
      await fetch("/api/admin/catalog/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: reordered }),
      });
      fetchCatalog();
    } catch {
      alert("Failed to save display order.");
    }
  };

  const handleToggleActive = async (item: PriceCatalogItem) => {
    try {
      const res = await fetch(`/api/admin/catalog/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          active: !item.active,
          version: item.version,
        }),
      });
      if (res.ok) {
        fetchCatalog();
      }
    } catch {
      alert("Failed to toggle status");
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Tag className="w-5 h-5 text-sky-400" />
            <h1 className="text-xl font-bold text-white tracking-tight">Price Catalog</h1>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-300">
              v{catalogVersion}
            </span>
          </div>
          <p className="text-xs text-slate-300 mt-1">
            Changes apply to new bookings. Existing orders keep their price snapshot.
          </p>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          {/* Sync indicator */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900/60 border border-white/10 text-[11px] text-slate-300">
            <span
              className={`w-2 h-2 rounded-full ${
                syncStatus === "synced"
                  ? "bg-emerald-400 animate-pulse"
                  : syncStatus === "syncing"
                  ? "bg-amber-400 animate-spin"
                  : "bg-rose-400"
              }`}
            />
            <span>
              {syncStatus === "synced"
                ? `Live on website (${new Date(lastUpdated).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })})`
                : syncStatus === "syncing"
                ? "Revalidating..."
                : "Sync error"}
            </span>
          </div>

          <Link
            href="/prices"
            target="_blank"
            className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-slate-200 hover:text-white transition flex items-center gap-1.5"
          >
            <span>View on website</span>
            <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
          </Link>

          <button
            type="button"
            onClick={openCreateModal}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 text-slate-950 font-bold text-xs shadow-lg shadow-sky-500/20 flex items-center gap-1.5 transition active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>Add Service</span>
          </button>
        </div>
      </div>

      {/* Catalog Table Card */}
      <GlassCard className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/90 border-b border-white/10 text-slate-300 uppercase tracking-wider font-semibold">
              <tr>
                <th className="px-4 py-3 w-14 text-center">Order</th>
                <th className="px-4 py-3">Visual & Item</th>
                <th className="px-4 py-3">Category & Size</th>
                <th className="px-4 py-3">Price (KES)</th>
                <th className="px-4 py-3 text-center">Badge</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {items.map((item, index) => (
                <tr key={item.id} className="hover:bg-white/5 transition">
                  {/* Reordering Controls */}
                  <td className="px-3 py-3 text-center">
                    <div className="flex flex-col items-center gap-0.5">
                      <button
                        type="button"
                        disabled={index === 0}
                        onClick={() => handleMoveOrder(index, "up")}
                        className="p-1 rounded text-slate-400 hover:text-white disabled:opacity-20 hover:bg-white/5"
                        title="Move Up"
                      >
                        <ArrowUp className="w-3 h-3" />
                      </button>
                      <span className="text-[10px] font-mono text-slate-400 font-bold">
                        {item.displayOrder || index + 1}
                      </span>
                      <button
                        type="button"
                        disabled={index === items.length - 1}
                        onClick={() => handleMoveOrder(index, "down")}
                        className="p-1 rounded text-slate-400 hover:text-white disabled:opacity-20 hover:bg-white/5"
                        title="Move Down"
                      >
                        <ArrowDown className="w-3 h-3" />
                      </button>
                    </div>
                  </td>

                  {/* Visual & Item Title */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="relative w-12 h-12 rounded-xl overflow-hidden bg-slate-800/80 border border-white/10 flex-shrink-0 flex items-center justify-center">
                        {item.imageUrl ? (
                          <Image
                            src={item.imageUrl}
                            alt={item.imageAlt || item.variant}
                            fill
                            className="object-cover"
                            sizes="48px"
                          />
                        ) : (
                          <div className="scale-75">
                            <ServiceIllustration
                              category={item.category}
                              variant={item.variant}
                              className="w-10 h-10"
                            />
                          </div>
                        )}
                      </div>
                      <div>
                        <div className="font-bold text-white text-sm">{item.variant}</div>
                        {item.description && (
                          <div className="text-[11px] text-slate-400 line-clamp-1 max-w-xs">
                            {item.description}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Category & Size */}
                  <td className="px-4 py-3">
                    <span className="capitalize font-medium text-slate-200 block">
                      {item.category}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      {item.sizeLabel || "Standard"}
                    </span>
                  </td>

                  {/* Price */}
                  <td className="px-4 py-3 font-mono font-bold text-sm text-sky-300">
                    KES {item.price.toLocaleString()}
                  </td>

                  {/* Badge */}
                  <td className="px-4 py-3 text-center">
                    {item.badge ? (
                      <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-400/20 text-amber-300 border border-amber-400/30">
                        {item.badge}
                      </span>
                    ) : (
                      <span className="text-slate-600 text-xs">—</span>
                    )}
                  </td>

                  {/* Active Toggle */}
                  <td className="px-4 py-3 text-center">
                    <button
                      type="button"
                      onClick={() => handleToggleActive(item)}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold transition ${
                        item.active
                          ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30"
                          : "bg-slate-700/50 text-slate-400 border border-white/10 hover:bg-slate-700"
                      }`}
                    >
                      {item.active ? "Active" : "Inactive"}
                    </button>
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => openEditModal(item)}
                      className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-slate-300 hover:text-white transition inline-flex items-center gap-1.5"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      <span>Edit</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassCard>

      {/* Edit / Create Item Modal with Live Preview */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
          <div className="relative w-full max-w-4xl bg-slate-900 border border-white/10 rounded-2xl shadow-2xl p-6 my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-white/10">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Tag className="w-4 h-4 text-sky-400" />
                  <span>{editingItem ? "Edit Catalog Item" : "Create New Catalog Item"}</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Edits save atomically and instantly update public landing and booking pages.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/5"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-6">
              {/* Form Controls (7 cols) */}
              <form onSubmit={handleFormSubmit} className="lg:col-span-7 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Category <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. basket, duvet, mat"
                      value={formCategory}
                      onChange={(e) => setFormCategory(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl glass-input text-xs text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Price (KES) <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="number"
                      min="50"
                      step="10"
                      required
                      value={formPrice}
                      onChange={(e) => setFormPrice(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl glass-input text-xs text-white font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Variant Title <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Small Basket, up to 7 kg / King Duvet"
                    value={formVariant}
                    onChange={(e) => setFormVariant(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl glass-input text-xs text-white"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Size / Unit Label
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Up to 7 kg / 6x6 ft bed"
                      value={formSizeLabel}
                      onChange={(e) => setFormSizeLabel(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl glass-input text-xs text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Badge (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Popular / Best Value"
                      value={formBadge}
                      onChange={(e) => setFormBadge(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl glass-input text-xs text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Short Description (Plain text)
                  </label>
                  <textarea
                    rows={2}
                    placeholder="e.g. Individual wash, tumble-dried and folded crisp."
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl glass-input text-xs text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Category Header Description
                  </label>
                  <input
                    type="text"
                    placeholder="Displayed under category tabs on public prices page"
                    value={formCategoryDescription}
                    onChange={(e) => setFormCategoryDescription(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl glass-input text-xs text-white"
                  />
                </div>

                {/* Secure Image Upload */}
                <div className="p-3.5 rounded-xl bg-slate-950/60 border border-white/10 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-300">
                      Product Photo (Processed with Sharp)
                    </span>
                    {formImageUrl && (
                      <button
                        type="button"
                        onClick={() => {
                          setFormImageUrl("");
                          setFormImageAlt("");
                        }}
                        className="text-[11px] text-rose-400 hover:underline"
                      >
                        Remove Image
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    <input
                      type="file"
                      ref={fileInputRef}
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handleImageUpload}
                      className="hidden"
                    />
                    <button
                      type="button"
                      disabled={uploadingImage}
                      onClick={() => fileInputRef.current?.click()}
                      className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/15 border border-white/10 text-xs font-medium text-slate-200 transition flex items-center gap-1.5"
                    >
                      <Upload className="w-3.5 h-3.5 text-sky-400" />
                      <span>{uploadingImage ? "Processing..." : "Choose File"}</span>
                    </button>
                    <span className="text-[11px] text-slate-400">
                      JPEG, PNG, WebP up to 5MB. Strips EXIF metadata.
                    </span>
                  </div>

                  {formImageUrl && (
                    <div className="pt-2">
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                        Image Alt Text (Accessibility required)
                      </label>
                      <input
                        type="text"
                        required={!!formImageUrl}
                        placeholder="Descriptive label for screen readers"
                        value={formImageAlt}
                        onChange={(e) => setFormImageAlt(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-xl glass-input text-xs text-white"
                      />
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-200">
                    <input
                      type="checkbox"
                      checked={formActive}
                      onChange={(e) => setFormActive(e.target.checked)}
                      className="rounded border-slate-700 text-sky-500 focus:ring-sky-400 w-4 h-4 bg-slate-900"
                    />
                    <span>Active on public website & booking flow</span>
                  </label>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsModalOpen(false)}
                      className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs text-slate-300"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2 rounded-xl bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 text-slate-950 font-bold text-xs shadow-lg shadow-sky-500/20"
                    >
                      {editingItem ? "Update Service" : "Create Service"}
                    </button>
                  </div>
                </div>
              </form>

              {/* Exact Public Card Live Preview (5 cols) */}
              <div className="lg:col-span-5 bg-slate-950/60 p-4 rounded-xl border border-white/10 flex flex-col">
                <div className="flex items-center justify-between mb-3 text-xs text-slate-400">
                  <span className="flex items-center gap-1.5 font-bold text-white">
                    <Eye className="w-3.5 h-3.5 text-sky-400" />
                    <span>Public Card Live Preview</span>
                  </span>
                  <span className="text-[10px] text-slate-500">Live preview</span>
                </div>

                {/* Render identical card to /prices */}
                <div className="relative rounded-2xl bg-slate-900/90 border border-white/10 p-5 flex flex-col justify-between hover:border-sky-500/40 transition">
                  {formBadge && (
                    <div className="absolute top-3 right-3 px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-500/20 text-sky-300 border border-sky-500/30">
                      {formBadge}
                    </div>
                  )}

                  <div className="relative w-full h-32 mb-4 rounded-xl overflow-hidden bg-slate-950/60 border border-white/5 flex items-center justify-center">
                    {formImageUrl ? (
                      <Image
                        src={formImageUrl}
                        alt={formImageAlt || formVariant || "Preview"}
                        fill
                        className="object-cover"
                      />
                    ) : (
                      <ServiceIllustration
                        category={formCategory}
                        variant={formVariant}
                        className="w-20 h-20"
                      />
                    )}
                  </div>

                  <div>
                    <div className="text-[11px] font-mono font-bold text-sky-400 uppercase tracking-wider mb-1">
                      {formCategory}
                    </div>
                    <h4 className="text-base font-bold text-white mb-1">
                      {formVariant || "Service Title"}
                    </h4>
                    {formSizeLabel && (
                      <div className="text-xs text-slate-400 mb-2">{formSizeLabel}</div>
                    )}
                    {formDescription && (
                      <p className="text-xs text-slate-300 leading-relaxed mb-4">
                        {formDescription}
                      </p>
                    )}
                  </div>

                  <div className="pt-3 border-t border-white/10 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-slate-400 block">Price</span>
                      <span className="text-lg font-mono font-extrabold text-white">
                        KES {parseInt(formPrice, 10).toLocaleString() || 0}
                      </span>
                    </div>

                    <div className="px-3.5 py-1.5 rounded-xl bg-sky-500 text-slate-950 font-bold text-xs flex items-center gap-1">
                      <span>Book now</span>
                    </div>
                  </div>
                </div>

                <div className="mt-3 text-[11px] text-slate-400 text-center">
                  This card updates live as you edit the fields.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 20% Price Deviation Confirmation Modal */}
      {showDeviationModal && deviationInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-slate-900 border border-amber-500/40 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-amber-400">
              <AlertTriangle className="w-6 h-6 flex-shrink-0" />
              <h3 className="text-base font-bold text-white">Confirm Significant Price Change</h3>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              You are changing the price from{" "}
              <strong className="text-white">KES {deviationInfo.oldPrice}</strong> to{" "}
              <strong className="text-white">KES {deviationInfo.newPrice}</strong> (a{" "}
              <strong className="text-amber-400">{deviationInfo.percentage}%</strong> difference).
              Please confirm this change.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowDeviationModal(false)}
                className="px-4 py-2 rounded-xl bg-white/10 text-xs text-slate-300 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeviation}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs"
              >
                Confirm Price Change
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step-up Re-authentication Modal */}
      {showStepUpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-slate-900 border border-sky-500/40 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-sky-400">
              <ShieldAlert className="w-6 h-6 flex-shrink-0" />
              <h3 className="text-base font-bold text-white">Admin Step-Up Verification</h3>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Price modifications require administrative confirmation to prevent accidental live adjustments. Enter your admin authorization PIN or passkey.
            </p>

            <div>
              <input
                type="password"
                placeholder="Admin PIN"
                value={stepUpPin}
                onChange={(e) => setStepUpPin(e.target.value)}
                className="w-full px-3 py-2 rounded-xl glass-input text-xs text-white"
              />
              {stepUpError && (
                <span className="text-[11px] text-rose-400 mt-1 block">{stepUpError}</span>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowStepUpModal(false)}
                className="px-4 py-2 rounded-xl bg-white/10 text-xs text-slate-300 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmStepUp}
                className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs"
              >
                Authorize & Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Concurrency Conflict 409 Modal */}
      {showConflictModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-slate-900 border border-rose-500/40 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-400">
              <AlertTriangle className="w-6 h-6 flex-shrink-0" />
              <h3 className="text-base font-bold text-white">Concurrent Edit Detected</h3>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              This catalog item was modified by another administrator or in another tab while you had it open. To protect against overwriting data, your changes were not applied.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowConflictModal(false);
                  setIsModalOpen(false);
                  fetchCatalog();
                }}
                className="px-4 py-2 rounded-xl bg-rose-500 hover:bg-rose-400 text-white font-bold text-xs"
              >
                Reload Latest Version
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
