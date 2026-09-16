"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
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
  Download,
  AlertTriangle,
  CalendarDays,
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
// Export types
// ---------------------------------------------------------------------------

type ExportPreset = "minggu_ini" | "bulan_ini" | "bulan_lalu" | "3_bulan" | "custom";

interface ExportDateRange {
  start: string; // YYYY-MM-DD
  end: string;   // YYYY-MM-DD (inclusive calendar day)
}

interface ExportRow {
  nama: string;
  role: string;
  divisi: string;
  totalTugas: number;
  tugasSelesai: number;
  tugasBelum: number;
  izinDiajukan: number;
  izinDisetujui: number;
  izinDitolak: number;
}

// ---------------------------------------------------------------------------
// Export preset helpers
// ---------------------------------------------------------------------------

/**
 * Returns YYYY-MM-DD for a given Date object in local calendar.
 * We format in local time because date presets are user-facing calendar concepts.
 */
function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Compute start/end YYYY-MM-DD strings for each preset.
 *
 * Minggu Ini  : Monday of current ISO week → today
 * Bulan Ini   : 1st of current month → today
 * Bulan Lalu  : 1st of last month → last day of last month
 * 3 Bulan     : 1st of month 3 months ago → today  [added beyond spec — approved]
 * Custom      : caller-supplied
 */
function getPresetRange(preset: ExportPreset, customStart?: string, customEnd?: string): ExportDateRange {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (preset === "custom") {
    return { start: customStart ?? toLocalDateStr(today), end: customEnd ?? toLocalDateStr(today) };
  }

  if (preset === "minggu_ini") {
    // ISO week starts on Monday. getDay() returns 0=Sun,1=Mon,...,6=Sat
    const dayOfWeek = today.getDay() === 0 ? 7 : today.getDay(); // convert Sun to 7
    const monday = new Date(today);
    monday.setDate(today.getDate() - (dayOfWeek - 1));
    return { start: toLocalDateStr(monday), end: toLocalDateStr(today) };
  }

  if (preset === "bulan_ini") {
    const first = new Date(today.getFullYear(), today.getMonth(), 1);
    return { start: toLocalDateStr(first), end: toLocalDateStr(today) };
  }

  if (preset === "bulan_lalu") {
    const firstOfLast = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const lastOfLast = new Date(today.getFullYear(), today.getMonth(), 0);
    return { start: toLocalDateStr(firstOfLast), end: toLocalDateStr(lastOfLast) };
  }

  if (preset === "3_bulan") {
    const firstOf3 = new Date(today.getFullYear(), today.getMonth() - 3, 1);
    return { start: toLocalDateStr(firstOf3), end: toLocalDateStr(today) };
  }

  return { start: toLocalDateStr(today), end: toLocalDateStr(today) };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Fallback helper to reconcile assignees vs completions if RPC is pending.
 */
function buildFallbackRoster(task: RiwayatTask): AssigneeRosterEntry[] {
  return (task.assignees ?? []).map((a) => ({
    userId: a.user_id,
    fullName: a.profile?.full_name ?? "Petugas",
    role: a.profile?.role ?? "member",
    hasSubmitted: (task.completions ?? []).some((c) => c.submitted_by === a.user_id),
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
  const supabase = useMemo(() => createClient(), []);

  // Basic own-vs-all scoping per logic.md section 5
  const [headScopeTab, setHeadScopeTab] = useState<"own" | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [tasks, setTasks] = useState<RiwayatTask[]>([]);
  const [taskRosters, setTaskRosters] = useState<Record<string, AssigneeRosterEntry[]>>({});
  const [isLoading, setIsLoading] = useState(true);

  // ---------------------------------------------------------------------------
  // Export state (Head-only)
  // ---------------------------------------------------------------------------
  const [exportPreset, setExportPreset] = useState<ExportPreset>("bulan_ini");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Fetch — anchored on tasks with RPC-backed status rosters
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
        const fetchedTasks = data as any as RiwayatTask[];
        setTasks(fetchedTasks);

        // Fetch per-assignee completion statuses via get_task_completion_status RPC
        const rosterMap: Record<string, AssigneeRosterEntry[]> = {};
        await Promise.allSettled(
          fetchedTasks.map(async (t) => {
            try {
              const { data: rpcData, error: rpcErr } = await supabase.rpc(
                "get_task_completion_status",
                { p_task_id: t.id }
              );
              if (!rpcErr && rpcData) {
                rosterMap[t.id] = (rpcData as any[]).map((r) => ({
                  userId: r.user_id,
                  fullName: r.full_name,
                  role: "member",
                  hasSubmitted: !!r.has_submitted,
                }));
              } else {
                rosterMap[t.id] = buildFallbackRoster(t);
              }
            } catch {
              rosterMap[t.id] = buildFallbackRoster(t);
            }
          })
        );
        setTaskRosters(rosterMap);
      } else {
        if (error) console.warn("Fetch riwayat tasks error:", error.message);
        setTasks([]);
        setTaskRosters({});
      }
    } catch (err) {
      console.warn("Exception fetching riwayat tasks:", err);
      setTasks([]);
      setTaskRosters({});
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
  // Export — data aggregation + xlsx generation (Head-only)
  // ---------------------------------------------------------------------------

  /**
   * Fetches all profiles plus task-attendance and leave counts for the given
   * date range, then builds one ExportRow per person.
   *
   * Date anchoring (per logic.md / schema.md):
   *   - tasks:  tasks.created_at (timestamptz) — end bound uses T23:59:59.999Z
   *             to capture records created late in the day (avoids midnight cutoff bug).
   *   - izin:   pengajuan_izin.start_date (plain date column) — plain YYYY-MM-DD
   *             comparison is exact; no time-of-day adjustment needed.
   */
  const fetchExportData = useCallback(
    async (range: ExportDateRange): Promise<ExportRow[]> => {
      // End-of-day suffix for timestamptz comparisons (tasks.created_at)
      const endOfDay = `${range.end}T23:59:59.999Z`;
      const startOfDay = `${range.start}T00:00:00.000Z`;

      // ── 1. All profiles ────────────────────────────────────────────────
      const { data: profilesData, error: profilesErr } = await supabase
        .from("profiles")
        .select("id, full_name, role, division")
        .order("full_name");

      if (profilesErr || !profilesData) {
        throw new Error(`Gagal mengambil data profil: ${profilesErr?.message ?? "unknown"}`);
      }

      // ── 2. Task assignees in range (tasks.created_at filter) ───────────
      // Query 1: task_assignees joined/embedded with tasks
      const { data: allAssigneeRows, error: assigneeErr } = await supabase
        .from("task_assignees")
        .select(
          `user_id,
           task_id,
           tasks(id, created_at)`
        );

      if (assigneeErr || !allAssigneeRows) {
        throw new Error(`Gagal mengambil data tugas: ${assigneeErr?.message ?? "unknown"}`);
      }

      // Client-side filter: tasks.created_at within [startOfDay, endOfDay]
      const rangeStart = new Date(startOfDay).getTime();
      const rangeEnd = new Date(endOfDay).getTime();

      const filteredAssigneeRows = (allAssigneeRows as any[]).filter((row) => {
        const taskCreatedAt = Array.isArray(row.tasks) ? row.tasks[0]?.created_at : row.tasks?.created_at;
        if (!taskCreatedAt) return false;
        const t = new Date(taskCreatedAt).getTime();
        return t >= rangeStart && t <= rangeEnd;
      });

      // Query 2: task_completions fetched independently — no cross-table embed
      const { data: completionRows, error: completionErr } = await supabase
        .from("task_completions")
        .select("id, task_id, submitted_by");

      if (completionErr || !completionRows) {
        throw new Error(`Gagal mengambil data penyelesaian tugas: ${completionErr?.message ?? "unknown"}`);
      }

      // Build lookup set of completed (task_id:submitted_by) pairs
      const completedPairs = new Set<string>();
      for (const c of completionRows as any[]) {
        if (c.task_id && c.submitted_by) {
          completedPairs.add(`${c.task_id}:${c.submitted_by}`);
        }
      }

      // Build per-user task counters
      const taskCountMap: Record<string, { total: number; selesai: number }> = {};
      for (const row of filteredAssigneeRows) {
        const uid = row.user_id as string;
        if (!taskCountMap[uid]) taskCountMap[uid] = { total: 0, selesai: 0 };
        taskCountMap[uid].total += 1;
        // Check if this person has submitted a completion for this task
        if (completedPairs.has(`${row.task_id}:${uid}`)) {
          taskCountMap[uid].selesai += 1;
        }
      }

      // ── 3. Leave requests in range (start_date filter — plain date column) ─
      // start_date is a date column (no time component) — plain YYYY-MM-DD comparison is exact.
      const { data: izinRows, error: izinErr } = await supabase
        .from("pengajuan_izin")
        .select("user_id, status, start_date")
        .gte("start_date", range.start)
        .lte("start_date", range.end);

      if (izinErr || !izinRows) {
        throw new Error(`Gagal mengambil data izin: ${izinErr?.message ?? "unknown"}`);
      }

      // Build per-user izin counters
      const izinCountMap: Record<string, { diajukan: number; disetujui: number; ditolak: number }> = {};
      for (const row of izinRows as any[]) {
        const uid = row.user_id as string;
        if (!izinCountMap[uid]) izinCountMap[uid] = { diajukan: 0, disetujui: 0, ditolak: 0 };
        izinCountMap[uid].diajukan += 1;
        if (row.status === "approved") izinCountMap[uid].disetujui += 1;
        if (row.status === "rejected") izinCountMap[uid].ditolak += 1;
      }

      // ── 4. Assemble one row per profile (all profiles, including zero-activity) ─
      return (profilesData as any[]).map((p) => {
        const tc = taskCountMap[p.id] ?? { total: 0, selesai: 0 };
        const iz = izinCountMap[p.id] ?? { diajukan: 0, disetujui: 0, ditolak: 0 };
        return {
          nama: p.full_name ?? "",
          role: p.role === "head" ? "Kepala" : "Anggota",
          divisi: p.division ?? "",
          totalTugas: tc.total,
          tugasSelesai: tc.selesai,
          tugasBelum: tc.total - tc.selesai,
          izinDiajukan: iz.diajukan,
          izinDisetujui: iz.disetujui,
          izinDitolak: iz.ditolak,
        } satisfies ExportRow;
      });
    },
    [supabase]
  );

  /**
   * Build and immediately trigger a browser download of a .xlsx file.
   * xlsx is dynamically imported to keep it out of the main bundle.
   */
  const buildAndDownloadXlsx = useCallback(
    async (rows: ExportRow[], range: ExportDateRange) => {
      const XLSX = await import("xlsx");

      const sheetData = [
        [
          "Nama",
          "Role",
          "Divisi",
          "Total Tugas",
          "Tugas Selesai",
          "Tugas Belum",
          "Izin Diajukan",
          "Izin Disetujui",
          "Izin Ditolak",
        ],
        ...rows.map((r) => [
          r.nama,
          r.role,
          r.divisi,
          r.totalTugas,
          r.tugasSelesai,
          r.tugasBelum,
          r.izinDiajukan,
          r.izinDisetujui,
          r.izinDitolak,
        ]),
      ];

      const ws = XLSX.utils.aoa_to_sheet(sheetData);

      // Auto-fit column widths based on content
      const colWidths = sheetData[0].map((_, ci) =>
        Math.max(...sheetData.map((row) => String(row[ci] ?? "").length), 10)
      );
      ws["!cols"] = colWidths.map((w) => ({ wch: Math.min(w + 2, 40) }));

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Rekap DOOR");

      const filename = `laporan-door-${range.start}_${range.end}.xlsx`;

      // Generate binary excel buffer
      const excelBuffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });

      // Create Blob with explicit XLSX MIME type
      const blob = new Blob([excelBuffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();

      // Defer removal and URL revocation to ensure browser download pipeline
      // finishes reading the 'download' attribute and blob stream before cleanup
      setTimeout(() => {
        if (a.parentNode) {
          document.body.removeChild(a);
        }
        URL.revokeObjectURL(url);
      }, 2000);
    },
    []
  );

  /** Orchestrates fetch → build → download, with loading + error state. */
  const handleExport = useCallback(async () => {
    if (!isHead) return; // Belt-and-suspenders: UI already hides the button
    setExportError(null);
    setIsExporting(true);
    try {
      const range = getPresetRange(exportPreset, customStart, customEnd);
      // Validate custom range
      if (exportPreset === "custom") {
        if (!customStart || !customEnd) {
          setExportError("Pilih tanggal mulai dan tanggal akhir untuk rentang kustom.");
          return;
        }
        if (customStart > customEnd) {
          setExportError("Tanggal mulai tidak boleh lebih akhir dari tanggal selesai.");
          return;
        }
      }
      const rows = await fetchExportData(range);
      await buildAndDownloadXlsx(rows, range);
    } catch (err: any) {
      console.error("Export error:", err);
      setExportError(err?.message ?? "Terjadi kesalahan saat membuat file ekspor.");
    } finally {
      setIsExporting(false);
    }
  }, [isHead, exportPreset, customStart, customEnd, fetchExportData, buildAndDownloadXlsx]);

  // ---------------------------------------------------------------------------
  // Filter logic
  // ---------------------------------------------------------------------------

  const filteredTasks = tasks
    .filter((t) => {
      const roster = taskRosters[t.id] || buildFallbackRoster(t);
      const hasAnySubmission = roster.some((r) => r.hasSubmitted) || (t.completions?.length ?? 0) > 0;
      return hasAnySubmission;
    })
    .filter((t) => {
      const roster = taskRosters[t.id] || buildFallbackRoster(t);

      // Scope filter:
      if (isHead && headScopeTab === "all") {
        return true;
      }
      // "own" tab (Head) or Member: only tasks where the current user has submitted
      const currentUserSubmitted =
        roster.some((r) => r.userId === user?.id && r.hasSubmitted) ||
        (t.completions ?? []).some((c) => c.submitted_by === user?.id);

      return currentUserSubmitted;
    })
    .filter((t) => {
      // Search filter
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const titleMatch = t.title.toLowerCase().includes(q);
      const submitterMatch = (t.completions ?? []).some((c) =>
        c.submitter?.full_name?.toLowerCase().includes(q)
      );
      const roster = taskRosters[t.id] || buildFallbackRoster(t);
      const rosterMatch = roster.some((r) => r.fullName.toLowerCase().includes(q));
      const locationMatch = (t.completions ?? []).some((c) =>
        c.actual_location_address?.toLowerCase().includes(q)
      );
      return titleMatch || submitterMatch || rosterMatch || locationMatch;
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

        {/* Head-Only Scope Switcher: "Riwayat Anda" vs "Riwayat Anggota" */}
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

        {/* Head-Only Export Panel */}
        {isHead && (
          <div className="p-4 bg-[var(--surface-hover)] border border-[var(--border)] rounded-[var(--radius-lg)] space-y-3">
            <div className="flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-[var(--accent-blue)] shrink-0" />
              <span className="text-xs font-semibold text-[var(--text-primary)]">Export Rekap ke Excel</span>
              <span className="text-[11px] text-[var(--text-secondary)] ml-auto">Hanya dapat diakses oleh Kepala</span>
            </div>

            {/* Preset pills */}
            <div className="flex flex-wrap gap-1.5">
              {([
                { value: "minggu_ini" as ExportPreset, label: "Minggu Ini" },
                { value: "bulan_ini"  as ExportPreset, label: "Bulan Ini" },
                { value: "bulan_lalu" as ExportPreset, label: "Bulan Lalu" },
                { value: "3_bulan"    as ExportPreset, label: "3 Bulan Terakhir" },
                { value: "custom"     as ExportPreset, label: "Kustom" },
              ] as const).map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  id={`export-preset-${value}`}
                  onClick={() => { setExportPreset(value); setExportError(null); }}
                  className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                    exportPreset === value
                      ? "bg-[var(--accent-blue)] border-[var(--accent-blue)] text-white shadow-sm"
                      : "bg-[var(--surface)] border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent-blue)]/50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Custom date inputs — only shown when Custom preset is active */}
            {exportPreset === "custom" && (
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <label className="text-[11px] text-[var(--text-secondary)] shrink-0" htmlFor="export-start">
                    Dari
                  </label>
                  <input
                    id="export-start"
                    type="date"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                    className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-sm)] px-2 py-1 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-blue)]"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-[11px] text-[var(--text-secondary)] shrink-0" htmlFor="export-end">
                    Sampai
                  </label>
                  <input
                    id="export-end"
                    type="date"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-sm)] px-2 py-1 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-blue)]"
                  />
                </div>
              </div>
            )}

            {/* Error banner */}
            {exportError && (
              <div className="flex items-center gap-2 p-2.5 bg-[var(--accent-red)]/10 border border-[var(--accent-red)]/30 rounded-[var(--radius-md)] text-xs text-[var(--accent-red)]">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>{exportError}</span>
              </div>
            )}

            {/* Export button + range preview */}
            <div className="flex items-center gap-3 pt-1">
              <Button
                id="export-excel-btn"
                variant="primary"
                size="sm"
                onClick={handleExport}
                isLoading={isExporting}
                className="gap-1.5"
              >
                {!isExporting && <Download className="w-3.5 h-3.5" />}
                {isExporting ? "Menyiapkan file..." : "Unduh Rekap .xlsx"}
              </Button>
              {!isExporting && exportPreset !== "custom" && (() => {
                const r = getPresetRange(exportPreset);
                return (
                  <span className="text-[11px] text-[var(--text-secondary)]">
                    {r.start} — {r.end}
                  </span>
                );
              })()}
            </div>
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
              const roster = taskRosters[task.id] || buildFallbackRoster(task);
              const allDone = roster.length > 0 && roster.every((r) => r.hasSubmitted);
              const totalPhotos = (task.completions ?? []).reduce(
                (sum, c) => sum + (c.photos?.length ?? 0),
                0
              );

              // Representative completion for summary content (if visible under RLS)
              const repComp = task.completions?.[0];
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

                    {/* Representative metadata (shown when completions are available) */}
                    <div className="mt-3 space-y-1.5 text-xs text-[var(--text-secondary)]">
                      {task.completions && task.completions.length > 0 ? (
                        <>
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
                        </>
                      ) : (
                        <div className="flex items-center gap-2 text-[var(--text-secondary)] italic">
                          <Clock className="w-3.5 h-3.5 text-[var(--accent-blue)] shrink-0" />
                          <span>Dokumentasi rekan terkunci hingga seluruh tugas selesai</span>
                        </div>
                      )}
                    </div>

                    {/* Minutes snippet — from representative completion */}
                    {repComp?.minutes_text && (
                      <p className="mt-3 text-xs text-[var(--text-secondary)] line-clamp-2 bg-[var(--surface-hover)]/60 p-2 rounded-[var(--radius-sm)] italic">
                        &ldquo;{repComp.minutes_text}&rdquo;
                      </p>
                    )}

                    {/* ── Per-assignee roster (powered by get_task_completion_status RPC) ── */}
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
