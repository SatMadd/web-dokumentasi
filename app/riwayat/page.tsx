"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  FileText,
  Calendar,
  Clock,
  MapPin,
  Camera,
  User,
  Search,
  ExternalLink,
  CheckCircle2,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useAuth, DEMO_PROFILES } from "@/lib/context/auth-context";
import { createClient } from "@/lib/supabase/client";

interface ReportItem {
  id: string;
  taskId: string;
  title: string;
  submitterName: string;
  submitterRole: "head" | "member";
  submitterDivision: string;
  submittedAt: string;
  meetingDate: string;
  location: string;
  minutesSnippet: string;
  photoCount: number;
}

const SAMPLE_REPORTS: ReportItem[] = [
  {
    id: "rep-1",
    taskId: "task-103",
    title: "Sosialisasi Standar Operasional Dokumentasi Digital",
    submitterName: DEMO_PROFILES.member1.full_name || "Budi Santoso",
    submitterRole: "member",
    submitterDivision: "Divisi Dokumentasi & Acara",
    submittedAt: "2026-09-05T12:00:00Z",
    meetingDate: "5 Sep 2026, 08:30 WIB",
    location: "Aula Serbaguna Lantai 1",
    minutesSnippet: "Sosialisasi SOP baru mengenai pengambilan foto rapat dan tata cara input lokasi digital telah dipaparkan kepada seluruh staf.",
    photoCount: 4,
  },
  {
    id: "rep-2",
    taskId: "task-99",
    title: "Rapat Pleno Sinkronisasi Data Kepegawaian",
    submitterName: DEMO_PROFILES.head.full_name || "Suprapto (Kepala)",
    submitterRole: "head",
    submitterDivision: "Bagian Operasional & Perencanaan",
    submittedAt: "2026-09-02T15:30:00Z",
    meetingDate: "2 Sep 2026, 10:00 WIB",
    location: "Ruang Komite Bersama",
    minutesSnippet: "Penyelarasan nomor induk dan integrasi database kepegawaian internal. Seluruh berkas fisik telah diarsipkan.",
    photoCount: 3,
  },
  {
    id: "rep-3",
    taskId: "task-98",
    title: "Koordinasi Teknis Jaringan & Server Cadangan",
    submitterName: "Hendra Wijaya (Kepala Divisi)",
    submitterRole: "head",
    submitterDivision: "Divisi TI & Infrastruktur",
    submittedAt: "2026-08-28T16:00:00Z",
    meetingDate: "28 Ags 2026, 13:30 WIB",
    location: "Pusat Data Lt. Dasar",
    minutesSnippet: "Pemeriksaan rutin UPS dan switch cadangan. Kapasitas penyimpanan aman untuk 6 bulan ke depan.",
    photoCount: 5,
  },
  {
    id: "rep-4",
    taskId: "task-97",
    title: "Monitoring Layanan Publik Terpadu",
    submitterName: DEMO_PROFILES.member2.full_name || "Siti Rahma",
    submitterRole: "member",
    submitterDivision: "Divisi Dokumentasi & Acara",
    submittedAt: "2026-08-20T11:00:00Z",
    meetingDate: "20 Ags 2026, 09:00 WIB",
    location: "Loket Pelayanan Publik",
    minutesSnippet: "Pencatatan waktu antrean dan respon kepuasan masyarakat. Indeks pelayanan mencapai skor 92%.",
    photoCount: 6,
  },
];

export default function RiwayatPage() {
  const { profile, isHead, role } = useAuth();
  const supabase = createClient();

  // Basic own-vs-all scoping per logic.md section 5:
  // Heads can toggle between "Riwayat Anda" and "Riwayat Anggota" (all). Members see own only.
  const [headScopeTab, setHeadScopeTab] = useState<"own" | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [reports, setReports] = useState<ReportItem[]>(SAMPLE_REPORTS);
  const [selectedReport, setSelectedReport] = useState<ReportItem | null>(null);

  // Filter reports
  const filteredReports = reports.filter((r) => {
    const matchesSearch =
      r.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.submitterName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.location.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    if (isHead) {
      if (headScopeTab === "own") {
        // "Riwayat Anda": submitted by Head themself
        return r.submitterRole === "head" && (r.submitterName.includes("Suprapto") || r.submitterName === profile?.full_name);
      } else {
        // "Riwayat Anggota": all completions across the team
        return true;
      }
    } else {
      // Member can ONLY see their own reports
      return r.submitterName === (profile?.full_name || "Budi Santoso");
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
        {filteredReports.length === 0 ? (
          <Card className="text-center py-16 text-[var(--text-secondary)]">
            <FileText className="w-12 h-12 opacity-20 mx-auto mb-3" />
            <p className="text-sm font-medium">Tidak ada riwayat laporan ditemukan</p>
            <p className="text-xs mt-1">
              {searchQuery
                ? "Coba kata kunci pencarian yang lain."
                : "Belum ada laporan yang diserahkan pada kategori ini."}
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredReports.map((report) => (
              <Card
                key={report.id}
                className="flex flex-col justify-between hover:border-[var(--accent-blue)]/50 transition-colors"
              >
                <div>
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-[var(--border)]">
                    <span className="text-[11px] text-[var(--text-secondary)]">
                      {new Date(report.submittedAt).toLocaleDateString("id-ID", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                    <Badge variant="green" size="sm">
                      Terdokumentasi
                    </Badge>
                  </div>

                  <h3 className="text-sm font-semibold text-[var(--text-primary)] line-clamp-2">
                    {report.title}
                  </h3>

                  {/* Metadata */}
                  <div className="mt-3 space-y-1.5 text-xs text-[var(--text-secondary)]">
                    <div className="flex items-center gap-2">
                      <User className="w-3.5 h-3.5 text-[var(--accent-blue)] shrink-0" />
                      <span className="truncate">
                        Diserahkan oleh: <strong className="text-[var(--text-primary)] font-medium">{report.submitterName}</strong>
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5 text-[var(--accent-blue)] shrink-0" />
                      <span>{report.meetingDate}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="w-3.5 h-3.5 text-[var(--accent-red)] shrink-0" />
                      <span className="truncate">{report.location}</span>
                    </div>
                  </div>

                  {/* Minutes Snippet */}
                  <p className="mt-3 text-xs text-[var(--text-secondary)] line-clamp-2 bg-[var(--surface-hover)]/60 p-2 rounded-[var(--radius-sm)] italic">
                    "{report.minutesSnippet}"
                  </p>
                </div>

                {/* Footer */}
                <div className="mt-4 pt-3 border-t border-[var(--border)] flex items-center justify-between">
                  <div className="flex items-center gap-1 text-xs text-[var(--text-secondary)]">
                    <Camera className="w-3.5 h-3.5" />
                    <span>{report.photoCount} Foto</span>
                  </div>

                  <Link href={`/tugas/${report.taskId}`}>
                    <Button variant="ghost" size="sm" className="text-xs">
                      Lihat Laporan Lengkap →
                    </Button>
                  </Link>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
