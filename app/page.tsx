"use client";

import React, { useEffect, useState, useCallback } from "react";
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
  const { user, profile, isHead, isLoading: isAuthLoading } = useAuth();
  const supabase = createClient();

  const [stats, setStats] = useState<StatData>({
    total: 0,
    pending: 0,
    completed: 0,
    rejected: 0,
  });

  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);

  // Fetch real stats and activities from Supabase
  const loadDashboardData = useCallback(async () => {
    if (!user) return;
    setIsLoadingData(true);

    try {
      // 1. Query real tasks counts
      // Supabase RLS automatically scopes tasks:
      // Heads see all tasks, Members see tasks assigned to them or created by them
      const { data: tasksData, error: tasksError } = await supabase
        .from("tasks")
        .select("id, status, title, created_at");

      let totalTasks = 0;
      let pendingTasks = 0;
      let completedTasks = 0;

      if (!tasksError && tasksData) {
        totalTasks = tasksData.length;
        pendingTasks = tasksData.filter((t) => t.status === "pending").length;
        completedTasks = tasksData.filter((t) => t.status === "completed").length;
      }

      // 2. Query real rejected izin count
      const { count: rejectedCount } = await supabase
        .from("pengajuan_izin")
        .select("*", { count: "exact", head: true })
        .eq("status", "rejected");

      setStats({
        total: totalTasks,
        pending: pendingTasks,
        completed: completedTasks,
        rejected: rejectedCount || 0,
      });

      // 3. Query real activities from notifications or recent tasks
      const { data: notifData } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(6);

      if (notifData && notifData.length > 0) {
        const mappedActivities: ActivityItem[] = notifData.map((n) => {
          const createdAt = new Date(n.created_at);
          const timeAgo = formatTimeAgo(createdAt);
          return {
            id: n.id,
            title: n.message,
            description:
              n.category === "task"
                ? "Penugasan baru"
                : n.detail === "approved"
                ? "Permohonan izin disetujui"
                : "Permohonan izin ditolak",
            time: timeAgo,
            type:
              n.category === "task"
                ? "assigned"
                : n.detail === "approved"
                ? "completed"
                : "izin",
          };
        });
        setActivities(mappedActivities);
      } else if (tasksData && tasksData.length > 0) {
        // Map recent tasks into activity feed if notifications are empty
        const recentTasks = [...tasksData]
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .slice(0, 5);

        const mapped: ActivityItem[] = recentTasks.map((t) => ({
          id: t.id,
          title: t.title,
          description: t.status === "completed" ? "Tugas telah selesai didokumentasikan" : "Tugas menunggu dokumentasi",
          time: formatTimeAgo(new Date(t.created_at)),
          type: t.status === "completed" ? "completed" : "assigned",
        }));
        setActivities(mapped);
      } else {
        setActivities([]);
      }
    } catch (err) {
      console.warn("Failed to load dashboard data from Supabase:", err);
    } finally {
      setIsLoadingData(false);
    }
  }, [user, supabase]);

  useEffect(() => {
    if (user) {
      loadDashboardData();
    }
  }, [user, loadDashboardData]);

  // Realtime subscription for live dashboard updates
  useEffect(() => {
    if (!user) return;

    try {
      const channel = supabase
        .channel("realtime_dashboard_activity")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "tasks" },
          () => {
            loadDashboardData();
          }
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "task_completions" },
          () => {
            loadDashboardData();
          }
        )
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "notifications" },
          () => {
            loadDashboardData();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    } catch {
      // ignore
    }
  }, [user, supabase, loadDashboardData]);

  const totalCalculated = stats.total > 0 ? stats.total : 1;
  const pendingPct = stats.total > 0 ? Math.round((stats.pending / totalCalculated) * 100) : 0;
  const completedPct = stats.total > 0 ? Math.round((stats.completed / totalCalculated) * 100) : 0;
  const rejectedPct = stats.total > 0 ? Math.round((stats.rejected / totalCalculated) * 100) : 0;

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
                {profile?.full_name || (isAuthLoading ? "Memuat..." : "Pengguna")}
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
                {isLoadingData ? "..." : stats.total}
              </span>
              <p className="text-[11px] text-[var(--text-secondary)] mt-1 truncate">
                {isHead ? "Semua penugasan organisasi" : "Tugas yang ditugaskan ke Anda"}
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
                {isLoadingData ? "..." : stats.pending}
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
                {isLoadingData ? "..." : stats.completed}
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
                {isLoadingData ? "..." : stats.rejected}
              </span>
              <p className="text-[11px] text-[var(--text-secondary)] mt-1 truncate">
                Izin tidak disetujui
              </p>
            </div>
          </Card>
        </div>

        {/* Panels: Status Breakdown + Recent Activity */}
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

              {/* Progress bars */}
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
            <div className="divide-y divide-[var(--border)] flex-1 overflow-hidden min-h-[160px]">
              {activities.length === 0 ? (
                <div className="py-12 text-center text-xs text-[var(--text-secondary)]">
                  Belum ada aktivitas terbaru yang tercatat di sistem.
                </div>
              ) : (
                activities.map((item) => (
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
                ))
              )}
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

function formatTimeAgo(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffMin < 1) return "Baru saja";
  if (diffMin < 60) return `${diffMin} menit yang lalu`;
  if (diffHour < 24) return `${diffHour} jam yang lalu`;
  if (diffDay === 1) return "Kemarin";
  return `${diffDay} hari yang lalu`;
}
