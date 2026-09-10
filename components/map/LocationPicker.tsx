"use client";

import React, { useState, useEffect, useRef } from "react";
import { MapPin, X, Search, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface LocationPickerProps {
  label?: string;
  value?: {
    address: string;
    lat?: number | null;
    lng?: number | null;
  };
  onChange?: (loc: { address: string; lat: number | null; lng: number | null }) => void;
  readOnly?: boolean;
}

export function LocationPicker({
  label,
  value = { address: "", lat: null, lng: null },
  onChange,
  readOnly = false,
}: LocationPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedLat, setSelectedLat] = useState<number>(value.lat || -6.2088); // Default Jakarta
  const [selectedLng, setSelectedLng] = useState<number>(value.lng || 106.8456);
  const [address, setAddress] = useState<string>(value.address || "");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [searchResults, setSearchResults] = useState<Array<{ display_name: string; lat: string; lon: string }>>([]);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerInstanceRef = useRef<any>(null);

  useEffect(() => {
    if (value.address) setAddress(value.address);
    if (value.lat) setSelectedLat(value.lat);
    if (value.lng) setSelectedLng(value.lng);
  }, [value]);

  // Reverse geocode lat/lng using Nominatim
  const reverseGeocode = async (lat: number, lng: number) => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`
      );
      if (res.ok) {
        const data = await res.json();
        if (data.display_name) {
          setAddress(data.display_name);
        }
      }
    } catch (err) {
      console.warn("Geocoding failed:", err);
    }
  };

  // Search address using Nominatim
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          searchQuery
        )}&limit=5`
      );
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data);
      }
    } catch (err) {
      console.warn("Search failed:", err);
    } finally {
      setIsSearching(false);
    }
  };

  const selectSearchResult = (item: { display_name: string; lat: string; lon: string }) => {
    const lat = parseFloat(item.lat);
    const lng = parseFloat(item.lon);
    setSelectedLat(lat);
    setSelectedLng(lng);
    setAddress(item.display_name);
    setSearchResults([]);
    setSearchQuery("");

    if (mapInstanceRef.current && markerInstanceRef.current) {
      mapInstanceRef.current.setView([lat, lng], 16);
      markerInstanceRef.current.setLatLng([lat, lng]);
    }
  };

  // Initialize Leaflet map on modal open
  useEffect(() => {
    if (!isOpen || !mapContainerRef.current) return;

    let isMounted = true;

    import("leaflet").then((L) => {
      if (!isMounted || !mapContainerRef.current) return;

      // Clean up previous instance if any
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }

      // Custom red pin marker icon
      const customIcon = L.divIcon({
        className: "custom-map-pin",
        html: `<div style="color: var(--accent-red); filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor" stroke="#fff" stroke-width="1.5">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
            <circle cx="12" cy="10" r="3" fill="#fff"></circle>
          </svg>
        </div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 32],
      });

      const map = L.map(mapContainerRef.current, {
        center: [selectedLat, selectedLng],
        zoom: 15,
        zoomControl: true,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      const marker = L.marker([selectedLat, selectedLng], {
        icon: customIcon,
        draggable: true,
      }).addTo(map);

      // Handle map click
      map.on("click", (e: any) => {
        const { lat, lng } = e.latlng;
        marker.setLatLng([lat, lng]);
        setSelectedLat(lat);
        setSelectedLng(lng);
        reverseGeocode(lat, lng);
      });

      // Handle marker drag
      marker.on("dragend", () => {
        const pos = marker.getLatLng();
        setSelectedLat(pos.lat);
        setSelectedLng(pos.lng);
        reverseGeocode(pos.lat, pos.lng);
      });

      mapInstanceRef.current = map;
      markerInstanceRef.current = marker;

      setTimeout(() => {
        map.invalidateSize();
      }, 250);
    });

    return () => {
      isMounted = false;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [isOpen]);

  const handleSave = () => {
    if (onChange) {
      onChange({
        address: address || "Lokasi terpilih di peta",
        lat: selectedLat,
        lng: selectedLng,
      });
    }
    setIsOpen(false);
  };

  return (
    <div className="flex flex-col gap-1.5 w-full">
      {label && (
        <span className="text-xs font-medium text-[var(--text-secondary)]">
          {label}
        </span>
      )}

      {/* Map Preview Strip (~70px height) per design.md section 5 */}
      <div
        onClick={() => !readOnly && setIsOpen(true)}
        className={`w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-hover)] p-2.5 flex flex-col justify-between min-h-[72px] transition-colors relative overflow-hidden group ${
          readOnly ? "cursor-default" : "cursor-pointer hover:border-[var(--accent-blue)]/60"
        }`}
      >
        {/* Subtle map grid background representation */}
        <div className="absolute inset-0 opacity-15 pointer-events-none bg-[radial-gradient(#3B82F6_1px,transparent_1px)] [background-size:12px_12px]" />

        <div className="flex items-center gap-2 relative z-10">
          <div className="w-7 h-7 rounded-full bg-[var(--accent-red)]/15 flex items-center justify-center text-[var(--accent-red)] shrink-0">
            <MapPin className="w-4 h-4" />
          </div>
          <span className="text-sm font-medium text-[var(--text-primary)] truncate">
            {address || (readOnly ? "Lokasi belum ditentukan" : "Belum memilih lokasi")}
          </span>
        </div>

        <div className="relative z-10 pl-9">
          <span className="text-xs text-[var(--text-secondary)] group-hover:text-[var(--accent-blue)] transition-colors">
            {readOnly ? "Koordinat tersimpan" : "Cari alamat atau pilih peta →"}
          </span>
        </div>
      </div>

      {/* Fullscreen Map Modal Takeover */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-[var(--bg)] animate-in fade-in duration-200">
          {/* Header Bar */}
          <div className="flex items-center justify-between p-3 sm:p-4 bg-[var(--surface)] border-b border-[var(--border)] shrink-0 gap-2">
            {/* Top-left X close control */}
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="p-2 rounded-[var(--radius-md)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label="Tutup"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Search Input */}
            <form onSubmit={handleSearch} className="flex-1 max-w-md relative">
              <input
                type="text"
                placeholder="Cari jalan, gedung, atau daerah..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[var(--surface-hover)] border border-[var(--border)] rounded-[var(--radius-md)] pl-9 pr-8 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-secondary)]/60 focus:outline-none focus:border-[var(--accent-blue)]"
              />
              <Search className="w-4 h-4 text-[var(--text-secondary)] absolute left-3 top-3" />
              {isSearching ? (
                <Loader2 className="w-4 h-4 text-[var(--accent-blue)] absolute right-2.5 top-3 animate-spin" />
              ) : null}

              {/* Search Suggestions Dropdown */}
              {searchResults.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] shadow-xl z-50 max-h-60 overflow-y-auto">
                  {searchResults.map((item, idx) => (
                    <div
                      key={idx}
                      onClick={() => selectSearchResult(item)}
                      className="p-2.5 text-xs text-[var(--text-primary)] hover:bg-[var(--surface-hover)] cursor-pointer border-b border-[var(--border)] last:border-b-0"
                    >
                      {item.display_name}
                    </div>
                  ))}
                </div>
              )}
            </form>

            {/* Confirm selection button */}
            <Button
              variant="primary"
              size="sm"
              onClick={handleSave}
              icon={<Check className="w-4 h-4" />}
            >
              Pilih Lokasi
            </Button>
          </div>

          {/* Map View */}
          <div className="flex-1 relative w-full h-full bg-[var(--surface)]">
            <div ref={mapContainerRef} className="w-full h-full" />

            {/* Address Banner Bottom overlay */}
            <div className="absolute bottom-4 left-4 right-4 z-10 bg-[var(--surface)]/95 backdrop-blur-xs border border-[var(--border)] p-3 rounded-[var(--radius-lg)] shadow-lg max-w-lg mx-auto flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 overflow-hidden">
                <MapPin className="w-4 h-4 text-[var(--accent-red)] shrink-0" />
                <span className="text-xs text-[var(--text-primary)] truncate font-medium">
                  {address || "Ketuk pada peta untuk menandai titik lokasi"}
                </span>
              </div>
              <Button size="sm" variant="primary" onClick={handleSave} className="shrink-0">
                Gunakan
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
