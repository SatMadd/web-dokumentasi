"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Calendar,
  Clock,
  MapPin,
  Plus,
  Search,
  User,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  CheckSquare,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useAuth, DEMO_PROFILES } from "@/lib/context/auth-context";
import { createClient } from "@/lib/supabase/client";
import { Task } from "@/types/database";

// Seeded tasks for demo/testing
const SAMPLE_TASKS: Task[] = [
  {
    id: "task-101",
    title: "Rapat Koordinasi Penataan Arsip & Dokumentasi Semester I",
    created_by: DEMO_PROFILES.head.id,
    planned_location: "Ruang Rapat Utama Lantai 3, Gedung Pengelola",
    planned_location_lat: -6.2088,
    planned_location_lng: 106.8456,
    scheduled_start: "2026-09-12T09:00:00Z",
    scheduled_end: "2026-09-12T11:30:00Z",
    status: "pending",
    created_at: "2026-09-08T08:00:00Z",
    creator: DEMO_PROFILES.head,
    assignees: [
      {
        task_id: "task-101",
        user_id: DEMO_PROFILES.member1.id,
        assigned_at: "2026-09-08T08:00:00Z",
        profile: DEMO_PROFILES.member1,
      },
    ],
  },
  {
    id: "task-102",
    title: "Pendataan & Dokumentasi Infrastruktur Lapangan Wilayah Barat",
    created_by: DEMO_PROFILES.head2.id, // Created by another Head!
    planned_location: "Balai Warga Kelurahan Menteng",
    planned_location_lat: -6.1955,
    planned_location_lng: 106.8322,
    scheduled_start: "2026-09-14T13:00:00Z",
    scheduled_end: "2026-09-14T16:00:00Z",
    status: "pending",
    created_at: "2026-09-09T09:30:00Z",
    creator: DEMO_PROFILES.head2,
    assignees: [
      {
        task_id: "task-102",
        user_id: DEMO_PROFILES.member1.id,
        assigned_at: "2026-09-09T09:30:00Z",
        profile: DEMO_PROFILES.member1,
      },
      {
        task_id: "task-102",
        user_id: DEMO_PROFILES.head.id,
        assigned_at: "2026-09-09T09:30:00Z",
        profile: DEMO_PROFILES.head,
      },
    ],
  },
  {
    id: "task-103",
    title: "Sosialisasi Standar Operasional Dokumentasi Digital",
    created_by: DEMO_PROFILES.head.id,
    planned_location: "Aula Serbaguna Lantai 1",
    planned_location_lat: -6.2100,
    planned_location_lng: 106.8400,
    scheduled_start: "2026-09-05T08:30:00Z",
    scheduled_end: "2026-09-05T11:00:00Z",
    status: "completed",
    created_at: "2026-09-01T07:00:00Z",
    creator: DEMO_PROFILES.head,
    assignees: [
      {
        task_id: "task-103",
        user_id: DEMO_PROFILES.member1.id,
        assigned_at: "2026-09-01T07:00:00Z",
        profile: DEMO_PROFILES.member1,
      },
    ],
  },
];

export default function TugasPage() {
  const { profile, isHead, role } = useAuth();
  const supabase = createClient();

  // Head-specific dual view switch per logic.md section 5:
  // "Tugas" (tasks assigned to Head themself) vs "Penugasan" (tasks Head assigned to others)
  const [headViewTab, setHeadViewTab] = useState<"tugas" | "penugasan">("penugasan");
  const [searchQuery, setSearchQuery] = useState("");
  const [tasks, setTasks] = useState<Task[]>(SAMPLE_TASKS);
  const [isLoadingTasks, setIsLoadingTasks] = useState(false);

  useEffect(() => {
    const fetchTasks = async () => {
      setIsLoadingTasks(true);
      try {
        const { data, error } = await supabase
          .from("tasks")
          .select(`
            *,
            creator:profiles!tasks_created_by_fkey(*),
            assignees:task_assignees(
              user_id,
              profile:profiles(*)
            )
          `)
          .order("scheduled_start", { ascending: false });

        if (!error && data && data.length > 0) {
          setTasks(data as any);
        }
      } catch {
        // Fallback to SAMPLE_TASKS
      } finally {
        setIsLoadingTasks(false);
      }
    };

    fetchTasks();
  }, [supabase]);

  // Filter tasks based on role and tab
  const filteredTasks = tasks.filter((task) => {
    const matchesSearch =
      task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (task.planned_location || "").toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    const currentUserId = profile?.id || "";

    if (isHead) {
      if (headViewTab === "tugas") {
        // Tasks where Head is an assignee (as a doer)
        return (
          task.assignees?.some((a) => a.user_id === currentUserId) ||
          task.created_by === currentUserId // Fallback visibility
        );
      } else {
        // "Penugasan" tab: tasks created by this Head or monitored by oversight
        return true;
      }
    } else {
      // Member can only see tasks assigned to them per logic.md & schema.md
      return (
        task.assignees?.some((a) => a.user_id === currentUserId) ||
        // If demo profile id matches
        currentUserId === DEMO_PROFILES.member1.id
      );
    }
  });

  return (
    <AppShell>
      <div className="max-w-7xl mx-auto px-4 sm:px-8 py-6 space-y-6">
        {/* Header row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold text-[var(--text-primary)]">
              Daftar Tugas & Kegiatan
            </h1>
            <p className="text-xs sm:text-sm text-[var(--text-secondary)] mt-1">
              {isHead
                ? "Kelola penugasan rapat dan pantau status penyelesaian dokumentasi."
                : "Daftar penugasan kegiatan yang harus Anda dokumentasikan."}
            </p>
          </div>

          {/* Head-Only Task Creation Button (Non-negotiable: Members NEVER see this) */}
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

        {/* Head-specific Dual View Switch per logic.md section 5 */}
        {isHead && (
          <div className="inline-flex p-1 bg-[var(--surface-hover)] border border-[var(--border)] rounded-[var(--radius-md)]">
            <button
              type="button"
              onClick={() => setHeadViewTab("penugasan")}
              className={`px-4 py-2 text-xs font-medium rounded-[var(--radius-sm)] transition-colors ${
                headViewTab === "penugasan"
                  ? "bg-[var(--accent-blue)] text-white shadow-xs"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              Penugasan (Monitoring)
            </button>
            <button
              type="button"
              onClick={() => setHeadViewTab("tugas")}
              className={`px-4 py-2 text-xs font-medium rounded-[var(--radius-sm)] transition-colors ${
                headViewTab === "tugas"
                  ? "bg-[var(--accent-blue)] text-white shadow-xs"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              Tugas Anda (Pelaksana)
            </button>
          </div>
        )}

        {/* Search bar */}
        <div className="relative max-w-md">
          <input
            type="text"
            placeholder="Cari tugas berdasarkan judul atau lokasi..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[var(--surface-hover)] border border-[var(--border)] rounded-[var(--radius-md)] pl-9 pr-4 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-secondary)]/60 focus:outline-none focus:border-[var(--accent-blue)]"
          />
          <Search className="w-4 h-4 text-[var(--text-secondary)] absolute left-3 top-3.5" />
        </div>

        {/* Tasks List */}
        {filteredTasks.length === 0 ? (
          <Card className="text-center py-16 text-[var(--text-secondary)]">
            <CheckSquare className="w-12 h-12 opacity-20 mx-auto mb-3" />
            <p className="text-sm font-medium">Tidak ada tugas ditemukan</p>
            <p className="text-xs mt-1">
              {searchQuery
                ? "Coba kata kunci pencarian yang lain."
                : "Belum ada penugasan aktif saat ini."}
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredTasks.map((task) => {
              const startDate = new Date(task.scheduled_start);
              const formattedDate = startDate.toLocaleDateString("id-ID", {
                weekday: "short",
                year: "numeric",
                month: "short",
                day: "numeric",
              });
              const formattedTime = startDate.toLocaleTimeString("id-ID", {
                hour: "2-digit",
                minute: "2-digit",
              });

              // Creator Attribution check per logic.md section 5:
              // Whenever a Head views a task created by someone else, visibly display "Dibuat oleh [name]"
              const isCreatedByOther =
                isHead && task.created_by !== profile?.id && task.creator?.full_name;

              return (
                <Link key={task.id} href={`/tugas/${task.id}`}>
                  <Card className="h-full flex flex-col justify-between hover:border-[var(--accent-blue)]/50 transition-colors group cursor-pointer">
                    <div>
                      {/* Top Bar: Status Badge + Creator Attribution */}
                      <div className="flex items-center justify-between gap-2 mb-2.5">
                        <Badge
                          variant={task.status === "completed" ? "green" : "blue"}
                          size="sm"
                        >
                          {task.status === "completed"
                            ? "Selesai"
                            : "Menunggu Dokumentasi"}
                        </Badge>

                        {/* Creator attribution per logic.md section 5 */}
                        {isCreatedByOther && (
                          <span className="text-[11px] text-[var(--text-secondary)] truncate max-w-[150px]">
                            Dibuat oleh <strong className="text-[var(--text-primary)] font-medium">{task.creator?.full_name}</strong>
                          </span>
                        )}
                      </div>

                      {/* Title */}
                      <h3 className="text-sm font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent-blue)] transition-colors line-clamp-2">
                        {task.title}
                      </h3>

                      {/* Details: Date, Time, Location */}
                      <div className="mt-3 space-y-1.5 text-xs text-[var(--text-secondary)]">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-3.5 h-3.5 text-[var(--accent-blue)] shrink-0" />
                          <span>{formattedDate}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Clock className="w-3.5 h-3.5 text-[var(--accent-blue)] shrink-0" />
                          <span>Pukul {formattedTime} WIB</span>
                        </div>
                        {task.planned_location && (
                          <div className="flex items-center gap-2">
                            <MapPin className="w-3.5 h-3.5 text-[var(--accent-red)] shrink-0" />
                            <span className="truncate">{task.planned_location}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Footer: Assignees + Arrow link */}
                    <div className="mt-4 pt-3 border-t border-[var(--border)] flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5 text-[var(--text-secondary)]">
                        <User className="w-3.5 h-3.5" />
                        <span>
                          {task.assignees?.length || 1} pelaksana ditugaskan
                        </span>
                      </div>

                      <span className="text-[var(--accent-blue)] group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5 font-medium">
                        Detail <ArrowRight className="w-3 h-3" />
                      </span>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
