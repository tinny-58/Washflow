"use client";

import React, { useEffect, useState, useRef } from "react";
import { MapPin, Navigation, Compass, Building, Home, CheckCircle2 } from "lucide-react";

export interface SelectedLocation {
  lat: number;
  lng: number;
  addressText: string;
  landmark: string;
  label: string;
}

interface LocationPickerProps {
  initialLocation?: Partial<SelectedLocation>;
  onLocationChange: (loc: SelectedLocation) => void;
}

export function LocationPicker({
  initialLocation,
  onLocationChange,
}: LocationPickerProps) {
  // Default to Nairobi Center (-1.286389, 36.817223)
  const [lat, setLat] = useState<number>(initialLocation?.lat || -1.286389);
  const [lng, setLng] = useState<number>(initialLocation?.lng || 36.817223);
  const [addressText, setAddressText] = useState<string>(initialLocation?.addressText || "");
  const [landmark, setLandmark] = useState<string>(initialLocation?.landmark || "");
  const [label, setLabel] = useState<string>(initialLocation?.label || "Home");
  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerInstanceRef = useRef<any>(null);

  // Sync state to parent
  useEffect(() => {
    onLocationChange({
      lat,
      lng,
      addressText,
      landmark,
      label,
    });
  }, [lat, lng, addressText, landmark, label]);

  // Initialize Leaflet Map (client-only)
  useEffect(() => {
    if (typeof window === "undefined" || !mapContainerRef.current) return;

    let isMounted = true;

    async function initLeaflet() {
      // Import leaflet dynamically
      const L = (await import("leaflet")).default;

      // Ensure leaflet styles are present
      if (!document.getElementById("leaflet-css")) {
        const link = document.createElement("link");
        link.id = "leaflet-css";
        link.rel = "stylesheet";
        link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        document.head.appendChild(link);
      }

      if (!isMounted || !mapContainerRef.current) return;

      // Fix Leaflet's default marker icon path in bundled setups
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
          center: [lat, lng],
          zoom: 15,
          zoomControl: false,
        });

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          maxZoom: 19,
        }).addTo(map);

        const marker = L.marker([lat, lng], { draggable: true }).addTo(map);

        marker.on("dragend", (e: any) => {
          const position = e.target.getLatLng();
          setLat(Number(position.lat.toFixed(6)));
          setLng(Number(position.lng.toFixed(6)));
        });

        map.on("click", (e: any) => {
          marker.setLatLng(e.latlng);
          setLat(Number(e.latlng.lat.toFixed(6)));
          setLng(Number(e.latlng.lng.toFixed(6)));
        });

        mapInstanceRef.current = map;
        markerInstanceRef.current = marker;
      }
    }

    initLeaflet();

    return () => {
      isMounted = false;
    };
  }, []);

  // Update marker position when lat/lng change from external trigger
  useEffect(() => {
    if (mapInstanceRef.current && markerInstanceRef.current) {
      markerInstanceRef.current.setLatLng([lat, lng]);
      mapInstanceRef.current.setView([lat, lng], 15);
    }
  }, [lat, lng]);

  // Geolocation trigger
  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      setGeoError("Geolocation is not supported by your browser.");
      return;
    }

    setIsLocating(true);
    setGeoError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const userLat = Number(position.coords.latitude.toFixed(6));
        const userLng = Number(position.coords.longitude.toFixed(6));
        setLat(userLat);
        setLng(userLng);
        setIsLocating(false);

        // Reverse geocoding attempt (best-effort, non-blocking)
        fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${userLat}&lon=${userLng}`
        )
          .then((res) => res.json())
          .then((data) => {
            if (data?.display_name && !addressText) {
              setAddressText(data.display_name.split(",").slice(0, 3).join(",").trim());
            }
          })
          .catch(() => {});
      },
      (error) => {
        setIsLocating(false);
        setGeoError(
          error.code === 1
            ? "Location permission denied. You can enter your address manually below."
            : "Unable to retrieve your current location. Please enter manually."
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="text-sm font-semibold text-slate-200 flex items-center gap-1.5">
          <MapPin className="w-4 h-4 text-sky-400" />
          Pickup & Delivery Location
        </label>
        <button
          type="button"
          onClick={handleUseMyLocation}
          disabled={isLocating}
          className="px-3 py-1.5 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/40 text-sky-300 text-xs font-medium transition flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
        >
          <Navigation className={`w-3.5 h-3.5 ${isLocating ? "animate-spin" : ""}`} />
          {isLocating ? "Locating..." : "Use My Location"}
        </button>
      </div>

      {geoError && (
        <div className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-xl p-2.5">
          {geoError}
        </div>
      )}

      {/* Interactive Map Box */}
      <div className="relative rounded-2xl overflow-hidden border border-white/15 shadow-inner">
        <div ref={mapContainerRef} className="w-full h-48 bg-slate-900 z-0" />
        <div className="absolute bottom-2 left-2 bg-slate-950/80 backdrop-blur-md px-2.5 py-1 rounded-lg border border-white/10 text-[11px] text-slate-300 pointer-events-none flex items-center gap-1">
          <Compass className="w-3 h-3 text-sky-400" />
          <span>Tap map or drag pin to fine-tune</span>
        </div>
      </div>

      {/* Address Form Inputs */}
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1">
            Apartment / House / Street Name <span className="text-rose-400">*</span>
          </label>
          <input
            type="text"
            required
            value={addressText}
            onChange={(e) => setAddressText(e.target.value)}
            placeholder="e.g. Royal Palms Apts, Flat 3B, Wood Avenue"
            className="w-full px-3.5 py-2.5 rounded-xl glass-input text-sm text-white placeholder-slate-400"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1">
            Nearby Landmark (helps driver find you quickly)
          </label>
          <input
            type="text"
            value={landmark}
            onChange={(e) => setLandmark(e.target.value)}
            placeholder="e.g. Opposite QuickMart Supermarket / Next to Total Energies"
            className="w-full px-3.5 py-2.5 rounded-xl glass-input text-sm text-white placeholder-slate-400"
          />
        </div>

        {/* Address Label Selector */}
        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1.5">
            Save Address As
          </label>
          <div className="flex gap-2">
            {[
              { id: "Home", icon: Home },
              { id: "Office", icon: Building },
              { id: "Other", icon: MapPin },
            ].map(({ id, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setLabel(id)}
                className={`flex-1 py-2 px-3 rounded-xl border text-xs font-medium flex items-center justify-center gap-1.5 transition ${
                  label === id
                    ? "bg-sky-500/25 border-sky-400 text-sky-200 shadow-sm"
                    : "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {id}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
