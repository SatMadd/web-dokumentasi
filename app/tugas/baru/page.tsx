"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Plus, X, ShieldAlert } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Card, Input } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { LocationPicker } from "@/components/map/LocationPicker";
import { AssigneeSearchModal } from "@/components/tugas/AssigneeSearchModal";
import { useAuth } from "@/lib/context/auth-context";
import { createClient } from "@/lib/supabase/client";
import { Profile } from "@/types/database";

interface AssigneeRow {
  id: string; // unique row tracking id
  user: Profile | null;
}

export default function CreateTaskPage() {
  const router = useRouter();
  const { user, profile, isHead, isLoading } = useAuth();
  const supabase = createClient();

  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endDate, setEndDate] = useState("");
  const [endTime, setEndTime] = useState("");
  const [location, setLocation] = useState<{
    address: string;
    lat: number | null;
    lng: number | null;
  }>({
    address: "",
    lat: null,
    lng: null,
  });

  // Stacked independent assignee text fields per design.md & logic.md section 4
  const [assigneeRows, setAssigneeRows] = useState<AssigneeRow[]>([
    { id: "row-1", user: null },
  ]);

  const [activeRowIdForSearch, setActiveRowIdForSearch] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Enforce Head-Only access per agents.md Rule 2
  useEffect(() => {
    if (!isLoading && !isHead) {
      router.replace("/tugas");
    }
  }, [isHead, isLoading, router]);

  if (!isLoading && !isHead) {
    return (
      <AppShell>
        <div className="max-w-md mx-auto my-16 p-6 text-center">
          <ShieldAlert className="w-12 h-12 text-[var(--accent-red)] mx-auto mb-3" />
          <h2 className="text-lg font-medium text-[var(--text-primary)]">
            Akses Dibatasi
          </h2>
          <p className="text-xs text-[var(--text-secondary)] mt-1 mb-4">
            Hanya pengguna dengan peran Kepala (Head) yang berwenang membuat tugas baru.
          </p>
          <Link href="/tugas">
            <Button variant="secondary" size="sm">
              Kembali ke Daftar Tugas
            </Button>
          </Link>
        </div>
      </AppShell>
    );
  }

  // Append new blank assignee field
  const handleAddAssigneeRow = () => {
    setAssigneeRows((prev) => [
      ...prev,
      { id: `row-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`, user: null },
    ]);
  };

  // Remove assignee row
  const handleRemoveAssigneeRow = (rowId: string) => {
    if (assigneeRows.length === 1) {
      // If it's the last row, just clear the user
      setAssigneeRows([{ id: rowId, user: null }]);
    } else {
      setAssigneeRows((prev) => prev.filter((r) => r.id !== rowId));
    }
  };

  // Assign user to specific row
  const handleSelectAssignee = (selectedUser: Profile) => {
    if (!activeRowIdForSearch) return;
    setAssigneeRows((prev) =>
      prev.map((r) => (r.id === activeRowIdForSearch ? { ...r, user: selectedUser } : r))
    );
    setActiveRowIdForSearch(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!user) {
      setErrorMsg("Sesi login Anda tidak valid. Silakan login kembali.");
      return;
    }

    if (!title.trim()) {
      setErrorMsg("Nama / judul tugas wajib diisi");
      return;
    }

    if (!startDate || !startTime) {
      setErrorMsg("Tanggal dan waktu mulai wajib ditentukan");
      return;
    }

    const scheduledStart = new Date(`${startDate}T${startTime}`).toISOString();
    const scheduledEnd =
      endDate && endTime
        ? new Date(`${endDate}T${endTime}`).toISOString()
        : null;

    const validAssignees = assigneeRows
      .map((r) => r.user)
      .filter((u): u is Profile => u !== null);

    if (validAssignees.length === 0) {
      setErrorMsg("Mohon tentukan minimal satu penerima penugasan (anggota / kepala)");
      return;
    }

    setIsSubmitting(true);

    try {
      // 1. Insert into tasks table
      const { data: taskData, error: taskError } = await supabase
        .from("tasks")
        .insert({
          title: title.trim(),
          created_by: user.id,
          planned_location: location.address || null,
          planned_location_lat: location.lat,
          planned_location_lng: location.lng,
          scheduled_start: scheduledStart,
          scheduled_end: scheduledEnd,
          status: "pending",
        })
        .select()
        .single();

      if (taskError) {
        console.error("Task insert error:", taskError);
        setErrorMsg(`Gagal menyimpan tugas: ${taskError.message}`);
        setIsSubmitting(false);
        return;
      }

      const createdTaskId = taskData.id;

      // 2. Insert into task_assignees
      const assigneeInserts = validAssignees.map((a) => ({
        task_id: createdTaskId,
        user_id: a.id,
      }));

      const { error: assigneeError } = await supabase
        .from("task_assignees")
        .insert(assigneeInserts);

      if (assigneeError) {
        console.error("Assignee insert error:", assigneeError);
        setErrorMsg(`Tugas tersimpan tetapi gagal menghubungkan pelaksana: ${assigneeError.message}`);
        setIsSubmitting(false);
        return;
      }

      // 3. Trigger notification for each assignee
      const notifInserts = validAssignees.map((a) => ({
        user_id: a.id,
        type: "task_assigned",
        reference_id: createdTaskId,
        message: `Anda telah ditugaskan ke: ${title.trim()}`,
        is_read: false,
      }));

      await supabase.from("notifications").insert(notifInserts);

      // Successfully saved! Redirect to Tugas list
      router.push("/tugas");
    } catch (err: any) {
      console.error("Submit exception:", err);
      setErrorMsg(err?.message || "Terjadi kesalahan saat memproses data ke database");
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedUserIds = assigneeRows
    .map((r) => r.user?.id)
    .filter((id): id is string => !!id);

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* Back Link */}
        <div className="mb-4">
          <Link
            href="/tugas"
            className="inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Kembali ke Tugas</span>
          </Link>
        </div>

        {/* Page Title */}
        <div className="mb-6">
          <h1 className="text-xl sm:text-2xl font-semibold text-[var(--text-primary)]">
            Buat Penugasan Baru
          </h1>
          <p className="text-xs sm:text-sm text-[var(--text-secondary)] mt-1">
            Penugasan yang dibuat akan diteruskan ke penerima tugas terpilih dan disimpan ke database.
          </p>
        </div>

        {errorMsg && (
          <div className="mb-6 p-3.5 bg-[var(--accent-red)]/15 border border-[var(--accent-red)]/30 rounded-[var(--radius-md)] text-xs text-[var(--accent-red)] flex items-center justify-between">
            <span>{errorMsg}</span>
            <button
              type="button"
              onClick={() => setErrorMsg(null)}
              className="text-[var(--accent-red)] hover:opacity-80"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <Card>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Title */}
            <Input
              label="Judul / Nama Tugas / Rapat *"
              placeholder="Contoh: Rapat Koordinasi Penataan Arsip"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />

            {/* Date and Time: Start & End */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Tanggal Pelaksanaan *"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />

              <Input
                label="Waktu Mulai *"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
              />

              <Input
                label="Tanggal Selesai (Opsional)"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />

              <Input
                label="Waktu Selesai (Opsional)"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>

            {/* Location (Shared Leaflet Map Thumbnail Component) */}
            <div>
              <LocationPicker
                label="Rencana Lokasi Kegiatan"
                value={location}
                onChange={(loc) => setLocation(loc)}
              />
            </div>

            {/* Stacked Assignee Text Fields per logic.md section 4 & design.md section 5 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-[var(--text-secondary)]">
                  Ditugaskan ke (Penerima Penugasan) *
                </label>
                <span className="text-[11px] text-[var(--text-secondary)]">
                  {selectedUserIds.length} penerima dipilih
                </span>
              </div>

              {/* Rows */}
              <div className="space-y-2.5">
                {assigneeRows.map((row) => {
                  const hasUser = row.user !== null;

                  return (
                    <div key={row.id} className="relative flex items-center gap-2">
                      {hasUser ? (
                        /* Filled field: shows person's name with X control on right to remove row */
                        <div className="flex-1 flex items-center justify-between bg-[var(--surface-hover)] border border-[var(--border)] rounded-[var(--radius-md)] px-3.5 py-2.5 min-h-[44px]">
                          <div className="flex items-center gap-2.5 overflow-hidden">
                            <div className="w-6 h-6 rounded-full bg-[var(--accent-blue-strong)] text-[var(--accent-blue-soft)] flex items-center justify-center text-[11px] font-semibold shrink-0">
                              {(row.user?.full_name || "A").charAt(0).toUpperCase()}
                            </div>
                            <div className="flex flex-col overflow-hidden">
                              <span className="text-sm font-medium text-[var(--text-primary)] truncate">
                                {row.user?.full_name}
                              </span>
                              <span className="text-[10px] text-[var(--text-secondary)] truncate">
                                {row.user?.division || "Umum"} • {row.user?.role === "head" ? "Kepala" : "Anggota"}
                              </span>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleRemoveAssigneeRow(row.id)}
                            className="p-1 text-[var(--text-secondary)] hover:text-[var(--accent-red)] rounded-[var(--radius-sm)] transition-colors min-h-[32px] min-w-[32px] flex items-center justify-center"
                            title="Hapus baris penerima ini"
                            aria-label="Hapus baris ini"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        /* Unfilled field: dashed border with placeholder text, tapping opens search page */
                        <button
                          type="button"
                          onClick={() => setActiveRowIdForSearch(row.id)}
                          className="flex-1 flex items-center justify-between border-2 border-dashed border-[var(--border)] hover:border-[var(--accent-blue)]/70 bg-[var(--surface)] hover:bg-[var(--surface-hover)] rounded-[var(--radius-md)] px-3.5 py-2.5 min-h-[44px] text-left transition-colors group"
                        >
                          <span className="text-sm text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]">
                            Cari nama anggota atau kepala...
                          </span>
                          <span className="text-xs text-[var(--accent-blue)] group-hover:underline">
                            Pilih Nama →
                          </span>
                        </button>
                      )}

                      {/* Remove button for unfilled row if more than 1 row exists */}
                      {!hasUser && assigneeRows.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveAssigneeRow(row.id)}
                          className="p-2 text-[var(--text-secondary)] hover:text-[var(--accent-red)]"
                          title="Hapus baris kosong"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* "Tambah" link to add new independent blank assignee row with no upper limit */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleAddAssigneeRow}
                  className="inline-flex items-center gap-1.5 text-xs text-[var(--accent-blue)] font-medium hover:underline py-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Tambah penerima penugasan</span>
                </button>
              </div>
            </div>

            {/* Submit Action */}
            <div className="pt-4 border-t border-[var(--border)] flex items-center justify-end gap-3">
              <Link href="/tugas">
                <Button type="button" variant="secondary">
                  Batal
                </Button>
              </Link>

              <Button
                type="submit"
                variant="primary"
                isLoading={isSubmitting}
              >
                Simpan & Tugaskan
              </Button>
            </div>
          </form>
        </Card>
      </div>

      {/* Dedicated Assignee Search Modal / Takeover */}
      <AssigneeSearchModal
        isOpen={activeRowIdForSearch !== null}
        onClose={() => setActiveRowIdForSearch(null)}
        onSelect={handleSelectAssignee}
        selectedIds={selectedUserIds}
      />
    </AppShell>
  );
}
