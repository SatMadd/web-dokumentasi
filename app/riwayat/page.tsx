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
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/context/auth-context";
import { createClient } from "@/lib/supabase/client";

interface FullCompletion {
  id: string;
  task_id: string;
  submitted_by: string;
  minutes_text: string | null;
  meeting_start_time: string | null;
  meeting_end_time: string | null;
  actual_location_lat: number | null;
  actual_location_lng: number | null;
  actual_location_address: string | null;
  created_at: string;
  task?: {
    id: string;
    title: string;
    scheduled_start: string;
  } | null;
  submitter?: {
    id: string;
    full_name: string | null;
    role: string;
    division: string | null;
  } | null;
  photos?: {
    id: string;
    storage_path: string;
  }[];
}

export default function RiwayatPage() {
  const { user, profile, isHead } = useAuth();
  const supabase = createClient();

  // Basic own-vs-all scoping per logic.md section 5:
  // Heads can toggle between "Riwayat Anda" and "Riwayat Anggota" (all). Members see own only.
  const [headScopeTab, setHeadScopeTab] = useState<"own" | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [completions, setCompletions] = useState<FullCompletion[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchCompletions = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);

    try {
      const { data, error } = await supabase
        .from("task_completions")
        .select(`
          *,
          task:tasks(id, title, scheduled_start),
          submitter:profiles!task_completions_submitted_by_fkey(id, full_name, role, division),
          photos:completion_photos(id, storage_path)
        `)
        .order("created_at", { ascending: false });

      if (!error && data) {
        setCompletions(data as any);
      } else {
        if (error) console.warn("Fetch completions error:", error.message);
        setCompletions([]);
      }
    } catch (err) {
      console.warn("Exception fetching completions:", err);
      setCompletions([]);
    } finally {
      setIsLoading(false);
    }
  }, [user, supabase]);

  useEffect(() => {
    if (user) {
      fetchCompletions();
    }
  }, [user, fetchCompletions]);

  // Filter completions based on role and tab
  const filteredCompletions = completions.filter((item) => {
    const title = item.task?.title || "Tugas Tanpa Judul";
    const submitterName = item.submitter?.full_name || "Petugas";
    const location = item.actual_location_address || "";

    const matchesSearch =
      title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      submitterName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      location.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    if (isHead) {
      if (headScopeTab === "own") {
        return item.submitted_by === user?.id;
      } else {
        return true;
      }
    } else {
      // Member can only see their own completions (RLS also guarantees this)
      return item.submitted_by === user?.id;
    }
  });

  return (
    <AppShell>
      <div className="max-w-7xl mx-auto px-4 sm:px-8 py-6 space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold text-[var(--text-primary)]">
              Riwayat Laporan & Dokumentasi
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
              Arsip Terkunci & Sah
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
            placeholder="Cari arsip laporan berdasarkan judul atau penyusun..."
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
        ) : filteredCompletions.length === 0 ? (
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
            {filteredCompletions.map((comp) => {
              const taskTitle = comp.task?.title || "Penugasan Dokumentasi";
              const submitterName = comp.submitter?.full_name || "Petugas";
              const submittedDate = new Date(comp.created_at).toLocaleDateString("id-ID", {
                day: "numeric",
                month: "short",
                year: "numeric",
              });
              const meetingTime = comp.meeting_start_time
                ? new Date(comp.meeting_start_time).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) + " WIB"
                : "-";

              return (
                <Card
                  key={comp.id}
                  className="flex flex-col justify-between hover:border-[var(--accent-blue)]/50 transition-colors"
                >
                  <div>
                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-[var(--border)]">
                      <span className="text-[11px] text-[var(--text-secondary)]">
                        {submittedDate}
                      </span>
                      <Badge variant="green" size="sm">
                        Terdokumentasi
                      </Badge>
                    </div>

                    <h3 className="text-sm font-semibold text-[var(--text-primary)] line-clamp-2">
                      {taskTitle}
                    </h3>

                    {/* Metadata */}
                    <div className="mt-3 space-y-1.5 text-xs text-[var(--text-secondary)]">
                      <div className="flex items-center gap-2">
                        <User className="w-3.5 h-3.5 text-[var(--accent-blue)] shrink-0" />
                        <span className="truncate">
                          Diserahkan oleh: <strong className="text-[var(--text-primary)] font-medium">{submitterName}</strong>
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock className="w-3.5 h-3.5 text-[var(--accent-blue)] shrink-0" />
                        <span>Pukul {meetingTime}</span>
                      </div>
                      {comp.actual_location_address && (
                        <div className="flex items-center gap-2">
                          <MapPin className="w-3.5 h-3.5 text-[var(--accent-red)] shrink-0" />
                          <span className="truncate">{comp.actual_location_address}</span>
                        </div>
                      )}
                    </div>

                    {/* Minutes Snippet */}
                    {comp.minutes_text && (
                      <p className="mt-3 text-xs text-[var(--text-secondary)] line-clamp-2 bg-[var(--surface-hover)]/60 p-2 rounded-[var(--radius-sm)] italic">
                        "{comp.minutes_text}"
                      </p>
                    )}
                  </div>

                  {/* Footer */}
                  <div className="mt-4 pt-3 border-t border-[var(--border)] flex items-center justify-between">
                    <div className="flex items-center gap-1 text-xs text-[var(--text-secondary)]">
                      <Camera className="w-3.5 h-3.5" />
                      <span>{comp.photos?.length || 0} Foto</span>
                    </div>

                    <Link href={`/tugas/${comp.task_id}`}>
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
