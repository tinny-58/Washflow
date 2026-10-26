"use client";

import React, { useEffect, useState, useRef } from "react";
import {
  MapPin,
  Navigation,
  Compass,
  Send,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  RefreshCw,
  Clock,
  Sparkles,
} from "lucide-react";
import { GlassCard } from "@/components/shared/glass-card";

interface RiderLocationPingProps {
  bookingId?: string;
  initialLat?: number | null;
  initialLng?: number | null;
  initialAddress?: string | null;
  lastPingedAt?: string | null;
  onPingSuccess?: (data: any) => void;
}

export function RiderLocationPing({
  bookingId,
  initialLat,
  initialLng,
  initialAddress,
  lastPingedAt,
  onPingSuccess,
}: RiderLocationPingProps) {
  const [lat, setLat] = useState<number | null>(initialLat || null);
  const [lng, setLng] = useState<number | null>(initialLng || null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [generatedAddress, setGeneratedAddress] = useState<string>(initialAddress || "");
  const [landmark, setLandmark] = useState<string>("");
  const [riderNotes, setRiderNotes] = useState<string>("");
  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [isReverseGeocoding, setIsReverseGeocoding] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [successTimestamp, setSuccessTimestamp] = useState<string | null>(lastPingedAt || null);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerInstanceRef = useRef<any>(null);

  // Initialize or update Leaflet map when coordinates are available
  useEffect(() => {
    if (typeof window === "undefined" || !mapContainerRef.current) return;
    if (lat === null || lng === null) return;
    const currentLat = lat;
    const currentLng = lng;

    let isMounted = true;

    async function setupMap() {
      const L = (await import("leaflet")).default;

      // Ensure leaflet stylesheet is loaded
      if (!document.getElementById("leaflet-cdn-css")) {
        const link = document.createElement("link");
        link.id = "leaflet-cdn-css";
        link.rel = "stylesheet";
        link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        document.head.appendChild(link);
      }

      if (!isMounted || !mapContainerRef.current) return;

      const DefaultIcon = L.icon({
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41],
      });
      L.Marker.prototype.options.icon = DefaultIcon;

      if (!mapInstanceRef.current) {
        const map = L.map(mapContainerRef.current, {
          center: [currentLat, currentLng],
          zoom: 16,
          zoomControl: false,
        });

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          maxZoom: 19,
        }).addTo(map);

        const marker = L.marker([currentLat, currentLng], { draggable: true }).addTo(map);

        marker.on("dragend", (e: any) => {
          const pos = e.target.getLatLng();
          handlePositionUpdate(Number(pos.lat.toFixed(6)), Number(pos.lng.toFixed(6)));
        });

        map.on("click", (e: any) => {
          marker.setLatLng(e.latlng);
          handlePositionUpdate(Number(e.latlng.lat.toFixed(6)), Number(e.latlng.lng.toFixed(6)));
        });

        mapInstanceRef.current = map;
        markerInstanceRef.current = marker;
      } else {
        mapInstanceRef.current.setView([currentLat, currentLng], 16);
        if (markerInstanceRef.current) {
          markerInstanceRef.current.setLatLng([currentLat, currentLng]);
        }
      }
    }

    setupMap();

    return () => {
      isMounted = false;
    };
  }, [lat, lng]);

  // Reverse geocode whenever coordinates change
  const handlePositionUpdate = async (newLat: number, newLng: number) => {
    setLat(newLat);
    setLng(newLng);
    setIsReverseGeocoding(true);

    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${newLat}&lon=${newLng}`
      );
      const data = await res.json();
      if (data?.display_name) {
        const parts = data.display_name.split(",").slice(0, 4).join(",").trim();
        setGeneratedAddress(parts);
      }
    } catch {
      // Fallback description
      if (!generatedAddress) {
        setGeneratedAddress(`GPS Coordinates (${newLat.toFixed(5)}, ${newLng.toFixed(5)})`);
      }
    } finally {
      setIsReverseGeocoding(false);
    }
  };

  // Turn on GPS and pin exact user position
  const handleTurnOnLocation = () => {
    if (!navigator.geolocation) {
      setGeoError("Geolocation is not supported by your browser or device.");
      return;
    }

    setIsLocating(true);
    setGeoError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const currentLat = Number(position.coords.latitude.toFixed(6));
        const currentLng = Number(position.coords.longitude.toFixed(6));
        const acc = position.coords.accuracy ? Number(position.coords.accuracy.toFixed(1)) : null;

        setAccuracy(acc);
        setIsLocating(false);
        handlePositionUpdate(currentLat, currentLng);
      },
      (err) => {
        setIsLocating(false);
        if (err.code === 1) {
          setGeoError("Location access was denied. Please allow location permissions in your browser to ping the rider.");
        } else {
          setGeoError("Unable to retrieve GPS satellite location. You can tap on the map or enter coordinates.");
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 30000,
      }
    );
  };

  // Confirm and Send location to rider
  const handleConfirmAndSend = async () => {
    if (lat === null || lng === null) {
      setGeoError("Please turn on location to pin your area first.");
      return;
    }

    setIsSubmitting(true);
    setGeoError(null);

    try {
      const endpoint = bookingId
        ? `/api/bookings/${bookingId}/ping-location`
        : "/api/client/ping-location";

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingId,
          lat,
          lng,
          addressText: generatedAddress || `Coordinates (${lat}, ${lng})`,
          landmark: landmark || undefined,
          notes: riderNotes || undefined,
          accuracy: accuracy || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setGeoError(data.error || "Failed to dispatch location to rider.");
      } else {
        const nowIso = new Date().toISOString();
        setSuccessTimestamp(nowIso);
        if (onPingSuccess) {
          onPingSuccess(data);
        }
      }
    } catch {
      setGeoError("Network error while sending location. Please check connection.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <GlassCard className="p-6 sm:p-7 border-white/15 space-y-5">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-4 border-b border-white/10">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
              <MapPin className="w-5 h-5 text-sky-400" />
              <span>Live GPS Courier Dispatch & Location Ping</span>
            </h3>
          </div>
          <p className="text-xs text-slate-300 mt-1 max-w-2xl">
            Turn on location to pin your exact area. The system generates your live location details for honesty and precision before you send to the rider.
          </p>
        </div>

        {/* Turn on Location Button */}
        <button
          type="button"
          onClick={handleTurnOnLocation}
          disabled={isLocating}
          className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white font-bold text-xs shadow-lg shadow-sky-500/20 transition flex items-center gap-2 active:scale-95 disabled:opacity-60 shrink-0"
        >
          <Navigation className={`w-4 h-4 ${isLocating ? "animate-spin text-white" : "text-sky-200"}`} />
          <span>{isLocating ? "Acquiring GPS Fix..." : lat ? "Re-detect GPS Location" : "Turn On Location"}</span>
        </button>
      </div>

      {geoError && (
        <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{geoError}</span>
        </div>
      )}

      {/* DISPATCH CONFIRMED BANNER */}
      {successTimestamp && (
        <div className="p-4 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-200 text-xs space-y-1">
          <div className="flex items-center gap-2 font-bold text-emerald-300 text-sm">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <span>Verified Location Dispatched to Rider!</span>
          </div>
          <p className="text-xs text-emerald-200/90">
            Coordinates: ({lat?.toFixed(5)}, {lng?.toFixed(5)}) {accuracy ? `• GPS Accuracy: ±${Math.round(accuracy)}m` : ""} • Confirmed at{" "}
            {new Date(successTimestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.
          </p>
        </div>
      )}

      {/* MAP VIEW */}
      {lat !== null && lng !== null ? (
        <div className="space-y-4">
          <div className="relative rounded-2xl overflow-hidden border border-white/20 shadow-xl">
            <div ref={mapContainerRef} className="w-full h-56 sm:h-64 bg-slate-900 z-0" />
            <div className="absolute bottom-3 left-3 bg-slate-950/85 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10 text-xs text-slate-200 flex items-center gap-2 pointer-events-none shadow-md">
              <Compass className="w-4 h-4 text-sky-400" />
              <span>Drag the pin or tap the map to fine-tune your gate</span>
            </div>
          </div>

          {/* GENERATED LOCATION DETAILS CARD */}
          <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-sky-400 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" />
                Generated Verified Details
              </span>
              {accuracy && (
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-[10px] font-bold">
                  Satellite GPS: ±{Math.round(accuracy)}m
                </span>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-200 mb-1">
                Detected Address & Area Details
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={generatedAddress}
                  onChange={(e) => setGeneratedAddress(e.target.value)}
                  placeholder={isReverseGeocoding ? "Resolving street details..." : "e.g. Chania Avenue, Kilimani"}
                  className="w-full px-3.5 py-2.5 rounded-xl glass-input text-xs text-white placeholder-slate-400 font-medium"
                />
                {isReverseGeocoding && (
                  <RefreshCw className="absolute right-3.5 top-3 w-3.5 h-3.5 text-sky-400 animate-spin" />
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-200 mb-1">
                  Nearby Landmark / Gate
                </label>
                <input
                  type="text"
                  value={landmark}
                  onChange={(e) => setLandmark(e.target.value)}
                  placeholder="e.g. Opposite QuickMart / Blue gate #3"
                  className="w-full px-3.5 py-2 rounded-xl glass-input text-xs text-white placeholder-slate-400"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-200 mb-1">
                  Instructions for Rider
                </label>
                <input
                  type="text"
                  value={riderNotes}
                  onChange={(e) => setRiderNotes(e.target.value)}
                  placeholder="e.g. Ring intercom bell flat 4B"
                  className="w-full px-3.5 py-2 rounded-xl glass-input text-xs text-white placeholder-slate-400"
                />
              </div>
            </div>

            {/* CONFIRM AND SEND BUTTON */}
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3">
              <p className="text-[11px] text-slate-400">
                Clicking confirm sends verified GPS coordinates directly to your assigned delivery rider.
              </p>
              <button
                type="button"
                onClick={handleConfirmAndSend}
                disabled={isSubmitting || !generatedAddress}
                className="w-full sm:w-auto px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-600 to-sky-600 hover:from-emerald-400 hover:to-sky-500 text-white font-bold text-xs shadow-xl shadow-emerald-500/25 flex items-center justify-center gap-2 transition active:scale-95 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Transmitting to Rider...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Confirm & Send Location to Rider</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Empty State before location is turned on */
        <div className="py-8 px-4 rounded-2xl bg-white/5 border border-dashed border-white/15 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-sky-500/20 text-sky-400 flex items-center justify-center mx-auto shadow-inner">
            <Navigation className="w-6 h-6 animate-pulse" />
          </div>
          <div className="max-w-md mx-auto space-y-1">
            <h4 className="text-sm font-bold text-white">Location Pin Not Yet Active</h4>
            <p className="text-xs text-slate-300">
              Click &quot;Turn On Location&quot; above to drop your live GPS pin on the map, generate address details, and dispatch accurate coordinates to the courier.
            </p>
          </div>
          <button
            type="button"
            onClick={handleTurnOnLocation}
            className="px-5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-bold text-xs shadow-md transition inline-flex items-center gap-2 active:scale-95"
          >
            <Navigation className="w-3.5 h-3.5" />
            <span>Turn On GPS Location</span>
          </button>
        </div>
      )}
    </GlassCard>
  );
}
