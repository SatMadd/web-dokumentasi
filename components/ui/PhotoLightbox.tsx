"use client";

import React, { useEffect, useCallback } from "react";
import { X, ChevronLeft, ChevronRight, Download, Camera } from "lucide-react";

export interface LightboxPhoto {
  id: string;
  storage_path: string;
  signedUrl?: string;
  name?: string;
}

interface PhotoLightboxProps {
  isOpen: boolean;
  photos: LightboxPhoto[];
  currentIndex: number;
  onClose: () => void;
  onNavigate?: (newIndex: number) => void;
}

export function PhotoLightbox({
  isOpen,
  photos,
  currentIndex,
  onClose,
  onNavigate,
}: PhotoLightboxProps) {
  const currentPhoto = photos[currentIndex];
  const totalPhotos = photos.length;
  const hasMultiple = totalPhotos > 1;

  const handlePrev = useCallback(() => {
    if (!onNavigate || totalPhotos <= 1) return;
    const prevIndex = (currentIndex - 1 + totalPhotos) % totalPhotos;
    onNavigate(prevIndex);
  }, [currentIndex, totalPhotos, onNavigate]);

  const handleNext = useCallback(() => {
    if (!onNavigate || totalPhotos <= 1) return;
    const nextIndex = (currentIndex + 1) % totalPhotos;
    onNavigate(nextIndex);
  }, [currentIndex, totalPhotos, onNavigate]);

  // Keyboard navigation: Escape, ArrowLeft, ArrowRight
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        handlePrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        handleNext();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    // Lock body scroll while lightbox is open
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, onClose, handlePrev, handleNext]);

  if (!isOpen || !currentPhoto) return null;

  const fileName =
    currentPhoto.name ||
    currentPhoto.storage_path.split("/").pop() ||
    "Foto Dokumentasi";

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col justify-between animate-in fade-in duration-200 select-none"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Tampilan foto dokumentasi layar penuh"
    >
      {/* Top bar with count, filename, and close button */}
      <div
        className="w-full flex items-center justify-between p-4 bg-gradient-to-b from-black/80 to-transparent z-20 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center shrink-0">
            <Camera className="w-4 h-4 text-[var(--accent-blue)]" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-semibold text-white truncate max-w-xs sm:max-w-md">
              {fileName}
            </span>
            {hasMultiple && (
              <span className="text-[11px] text-white/60">
                Foto {currentIndex + 1} dari {totalPhotos}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {currentPhoto.signedUrl && (
            <a
              href={currentPhoto.signedUrl}
              target="_blank"
              rel="noopener noreferrer"
              download={fileName}
              className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
              title="Buka / Unduh foto asli"
              aria-label="Unduh foto asli"
            >
              <Download className="w-4 h-4" />
            </a>
          )}
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            title="Tutup (Esc)"
            aria-label="Tutup tampilan foto"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Image View Area */}
      <div
        className="flex-1 relative flex items-center justify-center p-4 sm:p-8 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Previous Button */}
        {hasMultiple && (
          <button
            type="button"
            onClick={handlePrev}
            className="absolute left-2 sm:left-6 z-20 p-2.5 rounded-full bg-black/60 hover:bg-black/80 text-white/80 hover:text-white border border-white/10 backdrop-blur-sm transition-all min-h-[44px] min-w-[44px] flex items-center justify-center"
            title="Foto Sebelumnya (Panah Kiri)"
            aria-label="Foto Sebelumnya"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}

        {/* Image Display */}
        <div className="relative max-h-[82vh] max-w-[92vw] flex items-center justify-center">
          {currentPhoto.signedUrl ? (
            <img
              key={currentPhoto.id}
              src={currentPhoto.signedUrl}
              alt={fileName}
              className="max-h-[82vh] max-w-[92vw] object-contain rounded-[var(--radius-md)] shadow-2xl animate-in zoom-in-95 duration-150"
            />
          ) : (
            <div className="flex flex-col items-center justify-center text-white/60 p-8 text-center bg-white/5 rounded-[var(--radius-lg)] border border-white/10">
              <Camera className="w-10 h-10 opacity-40 mb-2 text-[var(--accent-blue)]" />
              <p className="text-sm font-medium">Foto sedang dimuat...</p>
              <p className="text-xs text-white/40 mt-1">{fileName}</p>
            </div>
          )}
        </div>

        {/* Next Button */}
        {hasMultiple && (
          <button
            type="button"
            onClick={handleNext}
            className="absolute right-2 sm:right-6 z-20 p-2.5 rounded-full bg-black/60 hover:bg-black/80 text-white/80 hover:text-white border border-white/10 backdrop-blur-sm transition-all min-h-[44px] min-w-[44px] flex items-center justify-center"
            title="Foto Selanjutnya (Panah Kanan)"
            aria-label="Foto Selanjutnya"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        )}
      </div>

      {/* Bottom Thumbnail Strip (if multiple photos) */}
      {hasMultiple && (
        <div
          className="w-full py-3 px-4 bg-gradient-to-t from-black/80 to-transparent z-20 flex items-center justify-center gap-2 overflow-x-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {photos.map((p, idx) => {
            const isSelected = idx === currentIndex;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onNavigate && onNavigate(idx)}
                className={`relative w-12 h-12 rounded-[var(--radius-sm)] overflow-hidden border-2 transition-all shrink-0 ${
                  isSelected
                    ? "border-[var(--accent-blue)] scale-105 shadow-md"
                    : "border-white/20 opacity-50 hover:opacity-100"
                }`}
                aria-label={`Lihat foto ${idx + 1}`}
              >
                {p.signedUrl ? (
                  <img
                    src={p.signedUrl}
                    alt={`Thumbnail ${idx + 1}`}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-white/10 flex items-center justify-center text-[10px] text-white">
                    {idx + 1}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
