"use client";

import React, { useState } from "react";
import { Bell, CheckSquare, CalendarCheck, Check, Clock } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

interface NotificationItem {
  id: string;
  type: "task" | "izin" | "system";
  title: string;
  message: string;
  time: string;
  isRead: boolean;
}

export default function NotifikasiPage() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([
    {
      id: "n-1",
      type: "task",
      title: "Penugasan Baru",
      message: "Anda telah ditugaskan ke: Rapat Koordinasi Penataan Arsip & Dokumentasi",
      time: "25 menit yang lalu",
      isRead: false,
    },
    {
      id: "n-2",
      type: "izin",
      title: "Persetujuan Izin",
      message: "Permohonan izin cuti Anda untuk tanggal 10 Sep 2026 telah disetujui oleh Kepala Bagian.",
      time: "2 jam yang lalu",
      isRead: false,
    },
    {
      id: "n-3",
      type: "task",
      title: "Dokumentasi Diterima",
      message: "Laporan tugas Sosialisasi SOP Dokumentasi Digital telah tersimpan di sistem arsip.",
      time: "1 hari yang lalu",
      isRead: true,
    },
  ]);

  const markAllAsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  };

  return (
    <AppShell>
      <div className="max-w-3xl mx-auto px-4 sm:px-8 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold text-[var(--text-primary)]">
              Notifikasi
            </h1>
            <p className="text-xs sm:text-sm text-[var(--text-secondary)] mt-1">
              Pemberitahuan penugasan tugas dan status permohonan Anda.
            </p>
          </div>

          <Button
            variant="secondary"
            size="sm"
            onClick={markAllAsRead}
            icon={<Check className="w-3.5 h-3.5" />}
          >
            Tandai Semua Dibaca
          </Button>
        </div>

        <div className="space-y-3">
          {notifications.map((n) => (
            <Card
              key={n.id}
              className={`flex items-start gap-3.5 transition-colors ${
                !n.isRead ? "border-l-4 border-l-[var(--accent-blue)] bg-[var(--surface)]" : "opacity-80"
              }`}
            >
              <div className="mt-0.5 w-8 h-8 rounded-full bg-[var(--surface-hover)] border border-[var(--border)] flex items-center justify-center shrink-0">
                {n.type === "task" ? (
                  <CheckSquare className="w-4 h-4 text-[var(--accent-blue)]" />
                ) : (
                  <CalendarCheck className="w-4 h-4 text-[var(--accent-orange)]" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs font-semibold text-[var(--text-primary)]">
                    {n.title}
                  </h3>
                  <span className="text-[10px] text-[var(--text-secondary)] shrink-0 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {n.time}
                  </span>
                </div>
                <p className="text-xs text-[var(--text-secondary)] mt-1">
                  {n.message}
                </p>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
