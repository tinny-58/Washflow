"use client";

import React, { useEffect, useRef } from "react";
import { Phone, MessageSquare, MapPin } from "lucide-react";

interface BookingMapItem {
  id: string;
  status: string;
  total: number;
  pickupWindow: string;
  customerName?: string;
  customerPhone?: string;
  address?: {
    lat: number;
    lng: number;
    addressText: string;
    landmark?: string | null;
  };
}

interface MapViewProps {
  bookings: BookingMapItem[];
  onStatusChange?: (bookingId: string, nextStatus: string) => void;
}

export function MapView({ bookings, onStatusChange }: MapViewProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersLayerRef = useRef<any>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !mapContainerRef.current) return;

    let isMounted = true;

    async function initMap() {
      const L = (await import("leaflet")).default;

      // Ensure leaflet styles
      if (!document.getElementById("leaflet-css")) {
        const link = document.createElement("link");
        link.id = "leaflet-css";
        link.rel = "stylesheet";
        link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        document.head.appendChild(link);
      }

      if (!isMounted || !mapContainerRef.current) return;

      if (!mapInstanceRef.current) {
        // Center on Nairobi
        const map = L.map(mapContainerRef.current, {
          center: [-1.286389, 36.817223],
          zoom: 12,
        });

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        }).addTo(map);

        const markersLayer = L.layerGroup().addTo(map);
        mapInstanceRef.current = map;
        markersLayerRef.current = markersLayer;
      }

      // Update markers
      if (markersLayerRef.current) {
        markersLayerRef.current.clearLayers();

        const validBookings = bookings.filter((b) => b.address?.lat && b.address?.lng);

        validBookings.forEach((b) => {
          const lat = b.address!.lat;
          const lng = b.address!.lng;

          const isDelivered = b.status === "DELIVERED";
          const isPending = b.status === "PENDING";

          const markerColor = isDelivered ? "#10b981" : isPending ? "#f59e0b" : "#0284c7";

          const customIcon = L.divIcon({
            className: "custom-pin",
            html: `
              <div style="background-color: ${markerColor}; width: 28px; height: 28px; border-radius: 50%; border: 3px solid white; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 10px rgba(0,0,0,0.5);">
                <span style="color: white; font-size: 10px; font-weight: bold;">🧺</span>
              </div>
            `,
            iconSize: [28, 28],
            iconAnchor: [14, 14],
          });

          const cleanPhone = b.customerPhone?.replace(/\+/g, "") || "";
          const popupHtml = `
            <div style="font-family: sans-serif; font-size: 12px; color: #0f172a; padding: 4px; min-width: 180px;">
              <div style="font-weight: bold; font-size: 13px; margin-bottom: 2px;">${b.customerName || "Customer"}</div>
              <div style="color: #64748b; margin-bottom: 6px;">${b.address?.addressText || ""}</div>
              <div style="display: flex; justify-content: space-between; font-weight: bold; margin-bottom: 8px;">
                <span>KES ${b.total.toLocaleString()}</span>
                <span style="color: ${markerColor}; text-transform: uppercase;">${b.status}</span>
              </div>
              <div style="display: flex; gap: 6px;">
                <a href="tel:${b.customerPhone}" style="flex: 1; background: #0284c7; color: white; padding: 5px 8px; border-radius: 6px; text-decoration: none; text-align: center; font-weight: bold; font-size: 11px;">📞 Call</a>
                <a href="https://wa.me/${cleanPhone}" target="_blank" style="flex: 1; background: #16a34a; color: white; padding: 5px 8px; border-radius: 6px; text-decoration: none; text-align: center; font-weight: bold; font-size: 11px;">💬 WhatsApp</a>
              </div>
            </div>
          `;

          const marker = L.marker([lat, lng], { icon: customIcon }).bindPopup(popupHtml);
          markersLayerRef.current.addLayer(marker);
        });

        if (validBookings.length > 0) {
          const group = L.featureGroup(
            validBookings.map((b) => L.marker([b.address!.lat, b.address!.lng]))
          );
          mapInstanceRef.current.fitBounds(group.getBounds().pad(0.2));
        }
      }
    }

    initMap();

    return () => {
      isMounted = false;
    };
  }, [bookings]);

  return (
    <div className="relative rounded-2xl overflow-hidden border border-white/15 shadow-xl">
      <div ref={mapContainerRef} className="w-full h-96 bg-slate-900 z-0" />
      <div className="absolute top-3 right-3 bg-slate-950/80 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10 text-xs text-slate-200 pointer-events-none flex items-center gap-1.5">
        <MapPin className="w-3.5 h-3.5 text-sky-400" />
        <span>{bookings.length} active pickup pins plotted</span>
      </div>
    </div>
  );
}
