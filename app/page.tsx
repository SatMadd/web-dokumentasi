"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  CheckSquare,
  Clock,
  CheckCircle2,
  XCircle,
  Plus,
  ArrowUpRight,
  FileText,
  Activity,
  Calendar,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Card, ProgressBar } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/context/auth-context";
import { createClient } from "@/lib/supabase/client";

interface StatData {
  total: number;
  pending: number;
  completed: number;
  rejected: number;
}

interface ActivityItem {
  id: string;
  title: string;
  description: string;
  time: string;
  type: "assigned" | "completed" | "izin";
}

export default function DashboardPage() {
  const { profile, isHead, role } = useAuth();
  const supabase = createClient();

  // Initial stats with realistic values
  const [stats, setStats] = useState<StatData>({
    total: 12,
    pending: 4,
    completed: 7,
    rejected: 1,
  });

  const [activities, setActivities] = useState<ActivityItem[]>([
    {
      id: "act-1",
      title: "Dokumentasi Rapat Koordinasi Wilayah diserahkan",
      description: "Budi Santoso telah mengunggah notulen dan 4 foto",
      time: "10 menit yang lalu",
      type: "completed",
    },
    {
      id: "act-2",
      title: "Penugasan baru: Sosialisasi Sistem Informasi",
      description: "Ditugaskan kepada Siti Rahma & Ahmad Fauzi",
      time: "1 jam yang lalu",
      type: "assigned",
    },
    {
      id: "act-3",
      title: "Laporan Evaluasi Bulanan selesai",
      description: "Hendra Wijaya memverifikasi kelengkapan dokumentasi",
      time: "3 jam yang lalu",
      type: "completed",
    },
    {
      id: "act-4",
      title: "Pengajuan izin diajukan",
      description: "Eko Prasetyo mengajukan izin cuti 2 hari",
      time: "Kemarin",
      type: "izin",
    },
  ]);

  // Supabase Realtime listener for live activity feed per logic.md section 8
  useEffect(() => {
    try {
      const channel = supabase
        .channel("realtime_dashboard_activity")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "notifications" },
          (payload) => {
            const newNotif = payload.new as any;
            setActivities((prev) => [
              {
                id: newNotif.id || Date.now().toString(),
                title: newNotif.message || "Aktivitas baru diterima",
                description: "Pembaruan langsung dari sistem",
                time: "Baru saja",
                type: "assigned",
              },
              ...prev.slice(0, 7),
            ]);
          }
        )
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "task_completions" },
          () => {
            setStats((prev) => ({
              ...prev,
              pending: Math.max(0, prev.pending - 1),
              completed: prev.completed + 1,
            }));
            setActivities((prev) => [
              {
                id: Date.now().toString(),
                title: "Laporan tugas baru telah dikirimkan",
                description: "Dokumentasi rapat telah selesai diunggah",
                time: "Baru saja",
                type: "completed",
              },
              ...prev.slice(0, 7),
            ]);
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    } catch {
      // Supabase realtime fallback
    }
  }, [supabase]);

  const totalCalculated = Math.max(1, stats.total);
  const pendingPct = Math.round((stats.pending / totalCalculated) * 100);
  const completedPct = Math.round((stats.completed / totalCalculated) * 100);
  const rejectedPct = Math.round((stats.rejected / totalCalculated) * 100);

  return (
    <AppShell>
      <div className="max-w-7xl mx-auto px-4 sm:px-8 py-6 space-y-6 sm:space-y-8">
        {/* Welcome Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold text-[var(--text-primary)]">
              Dashboard
            </h1>
            <p className="text-xs sm:text-sm text-[var(--text-secondary)] mt-1">
              Selamat datang kembali,{" "}
              <span className="text-[var(--text-primary)] font-medium">
                {profile?.full_name || "Pengguna"}
              </span>{" "}
              ({isHead ? "Kepala / Head" : "Anggota / Member"}) — {profile?.division || "Divisi Operasional"}
            </p>
          </div>

          {/* Quick Head Action */}
          {isHead && (
            <Link href="/tugas/baru">
              <Button
                variant="primary"
                size="md"
                icon={<Plus className="w-4 h-4" />}
                className="w-full sm:w-auto"
              >
                Buat Tugas Baru
              </Button>
            </Link>
          )}
        </div>

        {/* 4 Stat Cards Grid: 4-col on desktop, 2-col on mobile per design.md section 6 */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {/* Card 1: Total Tugas */}
          <Card className="flex flex-col justify-between">
            <div className="flex items-center justify-between text-[var(--text-secondary)]">
              <span className="text-xs font-medium uppercase tracking-wider">
                Total Tugas
              </span>
              <CheckSquare className="w-4 h-4 text-[var(--accent-blue)]" />
            </div>
            <div className="mt-3">
              <span className="text-xl sm:text-3xl font-semibold text-[var(--text-primary)] leading-none">
                {stats.total}
              </span>
              <p className="text-[11px] text-[var(--text-secondary)] mt-1 truncate">
                {isHead ? "Semua penugasan divisi" : "Tugas yang ditugaskan ke Anda"}
              </p>
            </div>
          </Card>

          {/* Card 2: Pending */}
          <Card className="flex flex-col justify-between">
            <div className="flex items-center justify-between text-[var(--text-secondary)]">
              <span className="text-xs font-medium uppercase tracking-wider">
                Pending
              </span>
              <Clock className="w-4 h-4 text-[var(--accent-orange)]" />
            </div>
            <div className="mt-3">
              <span className="text-xl sm:text-3xl font-semibold text-[var(--accent-orange)] leading-none">
                {stats.pending}
              </span>
              <p className="text-[11px] text-[var(--text-secondary)] mt-1 truncate">
                Menunggu dokumentasi
              </p>
            </div>
          </Card>

          {/* Card 3: Selesai */}
          <Card className="flex flex-col justify-between">
            <div className="flex items-center justify-between text-[var(--text-secondary)]">
              <span className="text-xs font-medium uppercase tracking-wider">
                Selesai
              </span>
              <CheckCircle2 className="w-4 h-4 text-[var(--status-success)]" />
            </div>
            <div className="mt-3">
              <span className="text-xl sm:text-3xl font-semibold text-[var(--status-success)] leading-none">
                {stats.completed}
              </span>
              <p className="text-[11px] text-[var(--text-secondary)] mt-1 truncate">
                Terdokumentasi lengkap
              </p>
            </div>
          </Card>

          {/* Card 4: Ditolak */}
          <Card className="flex flex-col justify-between">
            <div className="flex items-center justify-between text-[var(--text-secondary)]">
              <span className="text-xs font-medium uppercase tracking-wider">
                Ditolak
              </span>
              <XCircle className="w-4 h-4 text-[var(--accent-red)]" />
            </div>
            <div className="mt-3">
              <span className="text-xl sm:text-3xl font-semibold text-[var(--accent-red)] leading-none">
                {stats.rejected}
              </span>
              <p className="text-[11px] text-[var(--text-secondary)] mt-1 truncate">
                Izin tidak disetujui
              </p>
            </div>
          </Card>
        </div>

        {/* Panels: Status Breakdown + Recent Activity (Side-by-side desktop, stacked mobile per design.md) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Status Breakdown Widget (5 cols desktop) */}
          <Card className="lg:col-span-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-[var(--border)]">
                <div>
                  <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                    Distribusi Status Tugas
                  </h2>
                  <p className="text-xs text-[var(--text-secondary)]">
                    Ringkasan progres penugasan aktif
                  </p>
                </div>
                <Badge variant="blue">{stats.total} Total</Badge>
              </div>

              {/* Progress bars (6px per design.md section 5) */}
              <div className="space-y-4 py-2">
                <ProgressBar
                  label="Selesai (Terdokumentasi)"
                  countLabel={`${stats.completed} (${completedPct}%)`}
                  value={completedPct}
                  color="green"
                />

                <ProgressBar
                  label="Pending (Menunggu Dokumentasi)"
                  countLabel={`${stats.pending} (${pendingPct}%)`}
                  value={pendingPct}
                  color="orange"
                />

                <ProgressBar
                  label="Ditolak / Pembatalan"
                  countLabel={`${stats.rejected} (${rejectedPct}%)`}
                  value={rejectedPct}
                  color="red"
                />
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-[var(--border)] flex items-center justify-between">
              <span className="text-xs text-[var(--text-secondary)]">
                Lihat daftar penugasan lengkap
              </span>
              <Link
                href="/tugas"
                className="text-xs text-[var(--accent-blue)] font-medium hover:underline inline-flex items-center gap-1"
              >
                Buka Tugas <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </Card>

          {/* Recent Activity Feed (7 cols desktop) */}
          <Card className="lg:col-span-7 flex flex-col">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-[var(--border)]">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-[var(--accent-blue)]" />
                <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                  Aktivitas Terbaru
                </h2>
              </div>
              <span className="inline-flex items-center gap-1.5 text-[11px] text-[var(--status-success)]">
                <span className="w-2 h-2 rounded-full bg-[var(--status-success)] animate-pulse" />
                Realtime
              </span>
            </div>

            {/* Activity List */}
            <div className="divide-y divide-[var(--border)] flex-1 overflow-hidden">
              {activities.map((item) => (
                <div
                  key={item.id}
                  className="py-3 flex items-start gap-3 transition-colors hover:bg-[var(--surface-hover)]/30 px-2 rounded-[var(--radius-sm)]"
                >
                  <div className="mt-0.5 w-7 h-7 rounded-full bg-[var(--surface-hover)] border border-[var(--border)] flex items-center justify-center shrink-0">
                    {item.type === "completed" ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-[var(--status-success)]" />
                    ) : item.type === "izin" ? (
                      <Calendar className="w-3.5 h-3.5 text-[var(--accent-orange)]" />
                    ) : (
                      <FileText className="w-3.5 h-3.5 text-[var(--accent-blue)]" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-[var(--text-primary)] truncate">
                      {item.title}
                    </p>
                    <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 truncate">
                      {item.description}
                    </p>
                  </div>

                  <span className="text-[10px] text-[var(--text-secondary)] shrink-0 mt-0.5">
                    {item.time}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-4 pt-3 border-t border-[var(--border)] flex items-center justify-between">
              <span className="text-xs text-[var(--text-secondary)]">
                Mencakup dokumentasi, tugas, dan izin
              </span>
              <Link
                href="/riwayat"
                className="text-xs text-[var(--accent-blue)] font-medium hover:underline inline-flex items-center gap-1"
              >
                Riwayat Laporan <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
