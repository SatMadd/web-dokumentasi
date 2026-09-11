"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  FileText,
  Clock,
  MapPin,
  Camera,
  User,
  Search,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/context/auth-context";
import { createClient } from "@/lib/supabase/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AssigneeRosterEntry {
  userId: string;
  fullName: string;
  role: string;
  hasSubmitted: boolean;
}

interface RiwayatCompletion {
  id: string;
  submitted_by: string;
  minutes_text: string | null;
  meeting_start_time: string | null;
  meeting_end_time: string | null;
  actual_location_address: string | null;
  created_at: string;
  submitter: { id: string; full_name: string; role: string } | null;
  photos: { id: string; storage_path: string }[];
}

interface RiwayatTask {
  id: string;
  title: string;
  scheduled_start: string;
  status: string;
  created_by: string;
  creator: { id: string; full_name: string } | null;
  assignees: {
    user_id: string;
    profile: { id: string; full_name: string; role: string } | null;
  }[];
  completions: RiwayatCompletion[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a per-assignee roster showing who has submitted and who hasn't.
 * Reconciles task_assignees (full list) against task_completions (submitted set).
 */
function buildRoster(task: RiwayatTask): AssigneeRosterEntry[] {
  return task.assignees.map((a) => ({
    userId: a.user_id,
    fullName: a.profile?.full_name ?? "Petugas",
    role: a.profile?.role ?? "member",
    hasSubmitted: task.completions.some((c) => c.submitted_by === a.user_id),
  }));
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatTime(iso: string | null) {
  if (!iso) return "-";
  return (
    new Date(iso).toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
    }) + " WIB"
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function RiwayatPage() {
  const { user, profile, isHead } = useAuth();
  const supabase = createClient();

  // Basic own-vs-all scoping per logic.md section 5
  const [headScopeTab, setHeadScopeTab] = useState<"own" | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [tasks, setTasks] = useState<RiwayatTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // ---------------------------------------------------------------------------
  // Fetch — anchored on tasks, not on task_completions
  //
  // Per logic.md section 5 update: Riwayat Laporan surfaces a task as soon as
  // at least one assignee has submitted. We fetch tasks + their completions +
  // assignees in one query, then filter client-side for completions.length > 0.
  //
  // RLS still enforces the actual security boundary:
  //   Heads see all task_completions rows;
  //   Members see only rows where submitted_by = auth.uid().
  // ---------------------------------------------------------------------------

  const fetchTasks = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);

    try {
      const { data, error } = await supabase
        .from("tasks")
        .select(`
          id, title, scheduled_start, status, created_by,
          creator:profiles!tasks_created_by_fkey(id, full_name),
          assignees:task_assignees(
            user_id,
            profile:profiles(id, full_name, role)
          ),
          completions:task_completions(
            id, submitted_by, minutes_text,
            meeting_start_time, meeting_end_time,
            actual_location_address, created_at,
            submitter:profiles!task_completions_submitted_by_fkey(id, full_name, role),
            photos:completion_photos(id, storage_path)
          )
        `)
        .order("scheduled_start", { ascending: false });

      if (!error && data) {
        setTasks(data as any);
      } else {
        if (error) console.warn("Fetch riwayat tasks error:", error.message);
        setTasks([]);
      }
    } catch (err) {
      console.warn("Exception fetching riwayat tasks:", err);
      setTasks([]);
    } finally {
      setIsLoading(false);
    }
  }, [user, supabase]);

  useEffect(() => {
    if (user) {
      fetchTasks();
    }
  }, [user, fetchTasks]);

  // ---------------------------------------------------------------------------
  // Filter logic
  //
  // Step 1: Only tasks that have at least one completion (surfaces partial submissions).
  // Step 2: Scope filter — "own" shows only tasks where I personally submitted;
  //         "all" (Head only) shows every task with any completion.
  // Step 3: Search filter across title, submitter names, location.
  // ---------------------------------------------------------------------------

  const filteredTasks = tasks
    .filter((t) => t.completions.length > 0)
    .filter((t) => {
      // Scope filter
      if (isHead && headScopeTab === "all") {
        return true;
      }
      // "own" tab (Head) or Member: only tasks where the current user has submitted
      return t.completions.some((c) => c.submitted_by === user?.id);
    })
    .filter((t) => {
      // Search filter — match title, any submitter name, or location from any completion
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const titleMatch = t.title.toLowerCase().includes(q);
      const submitterMatch = t.completions.some(
        (c) => c.submitter?.full_name?.toLowerCase().includes(q)
      );
      const locationMatch = t.completions.some(
        (c) => c.actual_location_address?.toLowerCase().includes(q)
      );
      return titleMatch || submitterMatch || locationMatch;
    });

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <AppShell>
      <div className="max-w-7xl mx-auto px-4 sm:px-8 py-6 space-y-6">

        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold text-[var(--text-primary)]">
              Riwayat Laporan &amp; Dokumentasi
            </h1>
            <p className="text-xs sm:text-sm text-[var(--text-secondary)] mt-1">
              {isHead
                ? "Arsip permanen dokumentasi rapat dan kegiatan yang telah diselesaikan."
                : "Daftar laporan dokumentasi yang pernah Anda serahkan."}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="green" size="md">
              <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
              Arsip Terkunci &amp; Sah
            </Badge>
          </div>
        </div>

        {/* Head-Only Scope Switcher: "Riwayat Anda" vs "Riwayat Anggota" per logic.md section 5 */}
        {isHead && (
          <div className="inline-flex p-1 bg-[var(--surface-hover)] border border-[var(--border)] rounded-[var(--radius-md)]">
            <button
              type="button"
              onClick={() => setHeadScopeTab("all")}
              className={`px-4 py-2 text-xs font-medium rounded-[var(--radius-sm)] transition-colors ${
                headScopeTab === "all"
                  ? "bg-[var(--accent-blue)] text-white shadow-xs"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              Riwayat Anggota (Semua Laporan)
            </button>
            <button
              type="button"
              onClick={() => setHeadScopeTab("own")}
              className={`px-4 py-2 text-xs font-medium rounded-[var(--radius-sm)] transition-colors ${
                headScopeTab === "own"
                  ? "bg-[var(--accent-blue)] text-white shadow-xs"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              Riwayat Anda (Laporan Pribadi)
            </button>
          </div>
        )}

        {/* Search Bar */}
        <div className="relative max-w-md">
          <input
            type="text"
            placeholder="Cari arsip laporan berdasarkan judul, penyusun, atau lokasi..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[var(--surface-hover)] border border-[var(--border)] rounded-[var(--radius-md)] pl-9 pr-4 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-secondary)]/60 focus:outline-none focus:border-[var(--accent-blue)]"
          />
          <Search className="w-4 h-4 text-[var(--text-secondary)] absolute left-3 top-3.5" />
        </div>

        {/* Reports Grid */}
        {isLoading ? (
          <div className="py-16 text-center text-xs text-[var(--text-secondary)]">
            Memuat arsip laporan dari database...
          </div>
        ) : filteredTasks.length === 0 ? (
          <Card className="text-center py-16 text-[var(--text-secondary)]">
            <FileText className="w-12 h-12 opacity-20 mx-auto mb-3" />
            <p className="text-sm font-medium">Tidak ada riwayat laporan ditemukan</p>
            <p className="text-xs mt-1">
              {searchQuery
                ? "Coba kata kunci pencarian yang lain."
                : "Belum ada laporan penyelesaian yang tersimpan di sistem."}
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredTasks.map((task) => {
              const roster = buildRoster(task);
              const allDone = roster.every((r) => r.hasSubmitted);
              const totalPhotos = task.completions.reduce(
                (sum, c) => sum + (c.photos?.length ?? 0),
                0
              );

              // Representative completion for summary content — earliest submitted
              const repComp = task.completions[0];
              const repSubmitter = repComp?.submitter?.full_name ?? "Petugas";
              const scheduledDate = formatDate(task.scheduled_start);
              const meetingTime = formatTime(repComp?.meeting_start_time ?? null);

              return (
                <Card
                  key={task.id}
                  className="flex flex-col justify-between hover:border-[var(--accent-blue)]/50 transition-colors"
                >
                  <div>
                    {/* Card header */}
                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-[var(--border)]">
                      <span className="text-[11px] text-[var(--text-secondary)]">
                        {scheduledDate}
                      </span>
                      <Badge variant={allDone ? "green" : "blue"} size="sm">
                        {allDone ? "Selesai" : "Sebagian Terdokumentasi"}
                      </Badge>
                    </div>

                    {/* Task title */}
                    <h3 className="text-sm font-semibold text-[var(--text-primary)] line-clamp-2">
                      {task.title}
                    </h3>

                    {/* Representative metadata */}
                    <div className="mt-3 space-y-1.5 text-xs text-[var(--text-secondary)]">
                      {/* Show submitter count if multi-completion */}
                      <div className="flex items-center gap-2">
                        <User className="w-3.5 h-3.5 text-[var(--accent-blue)] shrink-0" />
                        <span className="truncate">
                          {task.completions.length > 1
                            ? `${task.completions.length} laporan diserahkan`
                            : (
                              <>
                                Diserahkan oleh:{" "}
                                <strong className="text-[var(--text-primary)] font-medium">
                                  {repSubmitter}
                                </strong>
                              </>
                            )}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock className="w-3.5 h-3.5 text-[var(--accent-blue)] shrink-0" />
                        <span>Pukul {meetingTime}</span>
                      </div>
                      {repComp?.actual_location_address && (
                        <div className="flex items-center gap-2">
                          <MapPin className="w-3.5 h-3.5 text-[var(--accent-red)] shrink-0" />
                          <span className="truncate">{repComp.actual_location_address}</span>
                        </div>
                      )}
                    </div>

                    {/* Minutes snippet — from representative completion */}
                    {repComp?.minutes_text && (
                      <p className="mt-3 text-xs text-[var(--text-secondary)] line-clamp-2 bg-[var(--surface-hover)]/60 p-2 rounded-[var(--radius-sm)] italic">
                        &ldquo;{repComp.minutes_text}&rdquo;
                      </p>
                    )}

                    {/* ── Per-assignee roster ──
                        Only shown for multi-assignee tasks OR always, to confirm status.
                        Single-entry roster ("Ahmad Fauzi — Selesai") is natural and minimal. */}
                    <div className="mt-3 pt-3 border-t border-[var(--border)] space-y-1.5">
                      <span className="text-[11px] font-medium text-[var(--text-secondary)] uppercase tracking-wide">
                        Status Dokumentasi Petugas
                      </span>
                      {roster.map((entry) => (
                        <div
                          key={entry.userId}
                          className="flex items-center gap-2 text-xs"
                        >
                          {entry.hasSubmitted ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-[var(--status-success)] shrink-0" />
                          ) : (
                            <AlertCircle className="w-3.5 h-3.5 text-[var(--accent-orange)] shrink-0" />
                          )}
                          <span
                            className={
                              entry.hasSubmitted
                                ? "text-[var(--text-primary)]"
                                : "text-[var(--text-secondary)]"
                            }
                          >
                            {entry.fullName}
                          </span>
                          <span
                            className={`text-[10px] ml-auto font-medium ${
                              entry.hasSubmitted
                                ? "text-[var(--status-success)]"
                                : "text-[var(--accent-orange)]"
                            }`}
                          >
                            {entry.hasSubmitted ? "Selesai" : "Menunggu Dokumentasi"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Card footer */}
                  <div className="mt-4 pt-3 border-t border-[var(--border)] flex items-center justify-between">
                    <div className="flex items-center gap-1 text-xs text-[var(--text-secondary)]">
                      <Camera className="w-3.5 h-3.5" />
                      <span>{totalPhotos} Foto</span>
                    </div>

                    <Link href={`/tugas/${task.id}`}>
                      <Button variant="ghost" size="sm" className="text-xs">
                        Lihat Laporan Lengkap →
                      </Button>
                    </Link>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
