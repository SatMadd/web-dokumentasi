"use client";

import React, { useEffect } from "react";
import { Check } from "lucide-react";
import { useRouter } from "next/navigation";

interface SuccessPopupProps {
  isOpen: boolean;
  title?: string;
  subtitle?: string;
  redirectTo?: string;
  delayMs?: number;
  onClose?: () => void;
}

export function SuccessPopup({
  isOpen,
  title = "Laporan terkirim",
  subtitle = "Mengalihkan ke Riwayat Laporan...",
  redirectTo = "/riwayat",
  delayMs = 1500,
  onClose,
}: SuccessPopupProps) {
  const router = useRouter();

  useEffect(() => {
    if (!isOpen) return;

    const timer = setTimeout(() => {
      if (onClose) onClose();
      if (redirectTo) {
        router.push(redirectTo);
      }
    }, delayMs);

    return () => clearTimeout(timer);
  }, [isOpen, delayMs, redirectTo, router, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      {/* Light/white background even in dark mode per design.md section 5 */}
      <div
        className="w-full max-w-sm rounded-[var(--radius-lg)] bg-[#FFFFFF] text-[#111827] p-6 sm:p-8 flex flex-col items-center text-center shadow-2xl scale-in-95 duration-200"
        role="dialog"
        aria-modal="true"
      >
        {/* Blue filled circle with white checkmark */}
        <div className="w-14 h-14 rounded-full bg-[var(--accent-blue)] flex items-center justify-center text-white mb-4 shadow-sm">
          <Check className="w-7 h-7 stroke-[2.5]" />
        </div>

        {/* Bold short line */}
        <h3 className="text-lg font-medium text-[#111827] mb-1">
          {title}
        </h3>

        {/* Muted line describing redirect */}
        <p className="text-sm text-[#6B7280]">
          {subtitle}
        </p>
      </div>
    </div>
  );
}
