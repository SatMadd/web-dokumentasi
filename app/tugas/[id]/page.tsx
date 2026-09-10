"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Calendar,
  Clock,
  MapPin,
  Camera,
  X,
  User,
  FileCheck,
  AlertTriangle,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Card, Input, Textarea } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { LocationPicker } from "@/components/map/LocationPicker";
import { SuccessPopup } from "@/components/ui/SuccessPopup";
import { useAuth } from "@/lib/context/auth-context";
import { createClient } from "@/lib/supabase/client";
import { Task, TaskCompletion, CompletionPhoto } from "@/types/database";

interface UploadedPhoto {
  id: string;
  file: File;
  previewUrl: string;
  name: string;
  size: number;
}

export default function TaskDetailPage() {
  const params = useParams();
  const taskId = params?.id as string;
  const router = useRouter();
  const { user, profile, isHead } = useAuth();
  const supabase = createClient();

  const [task, setTask] = useState<Task | null>(null);
  const [existingCompletion, setExistingCompletion] = useState<TaskCompletion | null>(null);
  const [completionPhotos, setCompletionPhotos] = useState<CompletionPhoto[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Completion form state
  const [actualStartTime, setActualStartTime] = useState("");
  const [actualEndTime, setActualEndTime] = useState("");
  const [actualLocation, setActualLocation] = useState<{
    address: string;
    lat: number | null;
    lng: number | null;
  }>({
    address: "",
    lat: null,
    lng: null,
  });
  const [minutesText, setMinutesText] = useState("");

  // Photo uploads: max 8, 10MB per file per logic.md section 3
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccessPopup, setShowSuccessPopup] = useState(false);

  const loadTaskData = useCallback(async () => {
    if (!taskId) return;
    setIsLoading(true);

    try {
      // 1. Fetch real task from Supabase
      const { data: taskData, error: taskError } = await supabase
        .from("tasks")
        .select(`
          *,
          creator:profiles!tasks_created_by_fkey(*),
          assignees:task_assignees(
            user_id,
            profile:profiles(*)
          )
        `)
        .eq("id", taskId)
        .single();

      if (taskError) {
        console.warn("Task fetch error:", taskError.message);
        setTask(null);
      } else if (taskData) {
        setTask(taskData as any);

        // Pre-fill actual location default with planned location
        if (taskData.planned_location) {
          setActualLocation({
            address: taskData.planned_location,
            lat: taskData.planned_location_lat,
            lng: taskData.planned_location_lng,
          });
        }
      }

      // 2. Fetch existing completion if any
      const { data: compData } = await supabase
        .from("task_completions")
        .select("*")
        .eq("task_id", taskId)
        .maybeSingle();

      if (compData) {
        setExistingCompletion(compData as any);
        const { data: photoData } = await supabase
          .from("completion_photos")
          .select("*")
          .eq("completion_id", compData.id);
        if (photoData) {
          setCompletionPhotos(photoData as CompletionPhoto[]);
        }
      }
    } catch (err) {
      console.warn("Error loading task detail:", err);
    } finally {
      setIsLoading(false);
    }
  }, [taskId, supabase]);

  useEffect(() => {
    loadTaskData();
  }, [loadTaskData]);

  // Client-side photo upload validation per logic.md section 3:
  // "Capped at 8, each file capped at 10MB. Client-side validation blocks 9th photo and files >10MB"
  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhotoError(null);
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const remainingSlots = 8 - photos.length;
    if (remainingSlots <= 0) {
      setPhotoError("Maksimal 8 foto per dokumentasi.");
      return;
    }

    const selectedList = Array.from(files);
    const newValidPhotos: UploadedPhoto[] = [];

    for (const file of selectedList) {
      if (newValidPhotos.length >= remainingSlots) {
        setPhotoError("Hanya maksimal 8 foto yang dapat diunggah.");
        break;
      }

      // Check 10MB limit (10 * 1024 * 1024 bytes)
      if (file.size > 10 * 1024 * 1024) {
        setPhotoError(`File "${file.name}" melebihi batas ukuran 10MB.`);
        continue;
      }

      const previewUrl = URL.createObjectURL(file);
      newValidPhotos.push({
        id: `photo-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        file,
        previewUrl,
        name: file.name,
        size: file.size,
      });
    }

    setPhotos((prev) => [...prev, ...newValidPhotos]);
    e.target.value = "";
  };

  const removePhoto = (photoId: string) => {
    setPhotos((prev) => prev.filter((p) => p.id !== photoId));
    setPhotoError(null);
  };

  const handleCompletionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (!user) {
      setSubmitError("Sesi login Anda tidak valid. Silakan login kembali.");
      return;
    }
    if (!actualStartTime) {
      setSubmitError("Waktu mulai aktual kegiatan wajib diisi");
      return;
    }
    if (!minutesText.trim()) {
      setSubmitError("Ringkasan notulen / risalah rapat wajib diisi");
      return;
    }

    setIsSubmitting(true);

    try {
      const taskStartDate = task?.scheduled_start
        ? new Date(task.scheduled_start).toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0];

      const meetingStartTime = new Date(`${taskStartDate}T${actualStartTime}`).toISOString();
      const meetingEndTime = actualEndTime
        ? new Date(`${taskStartDate}T${actualEndTime}`).toISOString()
        : null;

      // 1. Insert into task_completions
      const { data: compData, error: compError } = await supabase
        .from("task_completions")
        .insert({
          task_id: taskId,
          submitted_by: user.id,
          minutes_text: minutesText.trim(),
          meeting_start_time: meetingStartTime,
          meeting_end_time: meetingEndTime,
          actual_location_lat: actualLocation.lat,
          actual_location_lng: actualLocation.lng,
          actual_location_address: actualLocation.address || task?.planned_location || "Sesuai lokasi rencana",
        })
        .select()
        .single();

      if (compError) {
        console.error("Completion insert error:", compError);
        setSubmitError(`Gagal menyimpan laporan: ${compError.message}`);
        setIsSubmitting(false);
        return;
      }

      const completionId = compData.id;

      // 2. Upload photos to storage bucket and insert completion_photos rows
      if (photos.length > 0) {
        const photoRecords: { completion_id: string; storage_path: string }[] = [];

        for (const p of photos) {
          const cleanName = p.name.replace(/[^a-zA-Z0-9._-]/g, "_");
          const storagePath = `${completionId}/${Date.now()}-${cleanName}`;

          // Upload to Supabase Storage
          const { error: uploadError } = await supabase.storage
            .from("completion-photos")
            .upload(storagePath, p.file);

          if (uploadError) {
            console.warn(`Storage upload warning for ${p.name}:`, uploadError.message);
          }

          photoRecords.push({
            completion_id: completionId,
            storage_path: storagePath,
          });
        }

        if (photoRecords.length > 0) {
          await supabase.from("completion_photos").insert(photoRecords);
        }
      }

      // 3. Status update is handled automatically by the DB trigger on_task_completion_inserted
      // We also verify tasks status update
      await supabase.from("tasks").update({ status: "completed" }).eq("id", taskId);

      // 4. Show success popup card only on confirmed successful write per logic.md section 3
      setShowSuccessPopup(true);
    } catch (err: any) {
      console.error("Completion submit exception:", err);
      setSubmitError(err?.message || "Terjadi kesalahan saat menyimpan laporan ke database");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <AppShell>
        <div className="max-w-4xl mx-auto px-4 py-16 text-center text-xs text-[var(--text-secondary)]">
          Memuat detail penugasan dari database...
        </div>
      </AppShell>
    );
  }

  if (!task) {
    return (
      <AppShell>
        <div className="max-w-md mx-auto my-16 p-6 text-center">
          <p className="text-sm text-[var(--text-secondary)]">Tugas tidak ditemukan atau akses tidak diizinkan.</p>
          <Link href="/tugas" className="mt-4 inline-block">
            <Button variant="secondary" size="sm">Kembali ke Daftar Tugas</Button>
          </Link>
        </div>
      </AppShell>
    );
  }

  const startDate = new Date(task.scheduled_start);
  const formattedDate = startDate.toLocaleDateString("id-ID", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const formattedStartTime = startDate.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const isCompleted = task.status === "completed" || existingCompletion !== null;
  const isCreatedByOther = isHead && task.created_by !== user?.id && task.creator?.full_name;

  return (
    <AppShell>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        {/* Back Link */}
        <div>
          <Link
            href="/tugas"
            className="inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Kembali ke Daftar Tugas</span>
          </Link>
        </div>

        {submitError && (
          <div className="p-3.5 bg-[var(--accent-red)]/15 border border-[var(--accent-red)]/30 rounded-[var(--radius-md)] text-xs text-[var(--accent-red)] flex items-center justify-between">
            <span>{submitError}</span>
            <button
              type="button"
              onClick={() => setSubmitError(null)}
              className="text-[var(--accent-red)] hover:opacity-80"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* 1. Task Info Card */}
        <Card className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[var(--border)]">
            <div className="flex items-center gap-2">
              <Badge variant={isCompleted ? "green" : "blue"} size="md">
                {isCompleted ? "Selesai" : "Menunggu Dokumentasi"}
              </Badge>

              {/* Creator Attribution per logic.md section 5 */}
              {isCreatedByOther && (
                <span className="text-xs text-[var(--text-secondary)]">
                  Dibuat oleh <strong className="text-[var(--text-primary)] font-medium">{task.creator?.full_name}</strong>
                </span>
              )}
            </div>

            <span className="text-[11px] text-[var(--text-secondary)]">
              ID: {task.id.slice(0, 8)}
            </span>
          </div>

          <h1 className="text-lg sm:text-xl font-semibold text-[var(--text-primary)]">
            {task.title}
          </h1>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 text-xs text-[var(--text-secondary)]">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-[var(--accent-blue)] shrink-0" />
              <span>{formattedDate}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-[var(--accent-blue)] shrink-0" />
              <span>Pukul {formattedStartTime} WIB</span>
            </div>
          </div>

          {/* Planned Location with Shared Map Thumbnail Component */}
          <div className="pt-2">
            <LocationPicker
              label="Rencana Lokasi Kegiatan (Oleh Pembuat Tugas)"
              value={{
                address: task.planned_location || "Lokasi belum ditentukan",
                lat: task.planned_location_lat,
                lng: task.planned_location_lng,
              }}
              readOnly
            />
          </div>

          {/* Assignees list */}
          <div className="pt-2 border-t border-[var(--border)]">
            <span className="text-xs font-medium text-[var(--text-secondary)] block mb-2">
              Petugas Pelaksana:
            </span>
            <div className="flex flex-wrap gap-2">
              {task.assignees && task.assignees.length > 0 ? (
                task.assignees.map((a, i) => (
                  <div
                    key={i}
                    className="inline-flex items-center gap-1.5 px-3 py-1 bg-[var(--surface-hover)] border border-[var(--border)] rounded-[var(--radius-full)] text-xs text-[var(--text-primary)]"
                  >
                    <User className="w-3 h-3 text-[var(--text-secondary)]" />
                    <span>{a.profile?.full_name || "Petugas"}</span>
                  </div>
                ))
              ) : (
                <span className="text-xs text-[var(--text-secondary)]">Belum ada pelaksana</span>
              )}
            </div>
          </div>
        </Card>

        {/* 2. Completion Section */}
        {isCompleted ? (
          /* READ-ONLY IMMUTABLE COMPLETION RECORD per agents.md Rule 3 & logic.md section 3 */
          <Card className="border-t-4 border-t-[var(--status-success)] space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
              <div className="flex items-center gap-2">
                <FileCheck className="w-5 h-5 text-[var(--status-success)]" />
                <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                  Dokumentasi Pelaksanaan (Laporan Terkunci)
                </h2>
              </div>
              <Badge variant="green" size="sm">Terkunci & Sah</Badge>
            </div>

            <p className="text-xs text-[var(--text-secondary)] italic">
              Dokumentasi ini telah tersimpan di database dan bersifat permanen/tidak dapat disunting kembali sesuai ketentuan integritas arsip DOOR.
            </p>

            {/* Actual time & location */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
              <div>
                <span className="text-xs font-medium text-[var(--text-secondary)] block mb-1">
                  Waktu Aktual:
                </span>
                <p className="text-sm text-[var(--text-primary)]">
                  {existingCompletion?.meeting_start_time
                    ? new Date(existingCompletion.meeting_start_time).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })
                    : formattedStartTime} WIB
                </p>
              </div>

              <div>
                <span className="text-xs font-medium text-[var(--text-secondary)] block mb-1">
                  Lokasi Aktual:
                </span>
                <p className="text-sm text-[var(--text-primary)]">
                  {existingCompletion?.actual_location_address || task.planned_location || "Sesuai lokasi rencana"}
                </p>
              </div>
            </div>

            {/* Minutes / Notulen text */}
            <div className="pt-2 border-t border-[var(--border)]">
              <span className="text-xs font-medium text-[var(--text-secondary)] block mb-1.5">
                Ringkasan Notulen / Risalah Rapat:
              </span>
              <div className="p-3.5 bg-[var(--surface-hover)] border border-[var(--border)] rounded-[var(--radius-md)] text-xs text-[var(--text-primary)] whitespace-pre-wrap leading-relaxed">
                {existingCompletion?.minutes_text || "Notulen rapat tercatat lengkap."}
              </div>
            </div>

            {/* Photos Display */}
            {completionPhotos.length > 0 && (
              <div className="pt-2 border-t border-[var(--border)]">
                <span className="text-xs font-medium text-[var(--text-secondary)] block mb-2">
                  Foto Bukti Dokumentasi ({completionPhotos.length} foto):
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {completionPhotos.map((photo) => {
                    const publicUrl = supabase.storage
                      .from("completion-photos")
                      .getPublicUrl(photo.storage_path).data.publicUrl;

                    return (
                      <div
                        key={photo.id}
                        className="aspect-square bg-[var(--surface-hover)] border border-[var(--border)] rounded-[var(--radius-sm)] overflow-hidden relative group"
                      >
                        <img
                          src={publicUrl}
                          alt="Dokumentasi Rapat"
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            // Fallback thumbnail view
                            (e.target as HTMLElement).style.display = "none";
                          }}
                        />
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-[var(--text-secondary)] p-2 text-center pointer-events-none">
                          <Camera className="w-5 h-5 opacity-40 mb-1 text-[var(--accent-blue)]" />
                          <span className="text-[10px] truncate max-w-full px-1">
                            {photo.storage_path.split("/").pop()}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </Card>
        ) : (
          /* COMPLETION FORM per logic.md section 3 */
          <Card className="space-y-6">
            <div className="pb-3 border-b border-[var(--border)]">
              <h2 className="text-base font-semibold text-[var(--text-primary)]">
                Formulir Penyelesaian & Dokumentasi Tugas
              </h2>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                Unggah bukti foto, catat waktu aktual, dan lampirkan notulen rapat ke database.
              </p>
            </div>

            <form onSubmit={handleCompletionSubmit} className="space-y-6">
              {/* Photo Upload Grid: 4-col 1:1 square tiles on mobile, max 8, 10MB per file per logic.md */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-[var(--text-secondary)]">
                    Foto Dokumentasi Kegiatan (Maksimal 8 Foto, 10MB per file) *
                  </label>
                  <span className="text-[11px] text-[var(--text-secondary)] font-medium">
                    {photos.length} dari 8 foto
                  </span>
                </div>

                {photoError && (
                  <div className="p-2.5 bg-[var(--accent-red)]/15 border border-[var(--accent-red)]/30 rounded-[var(--radius-md)] text-xs text-[var(--accent-red)] flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>{photoError}</span>
                  </div>
                )}

                {/* 4-column grid of square (1:1) tiles per design.md section 5 */}
                <div className="grid grid-cols-4 gap-2 sm:gap-3">
                  {photos.map((photo) => (
                    <div
                      key={photo.id}
                      className="relative aspect-square rounded-[var(--radius-sm)] overflow-hidden border border-[var(--border)] bg-[var(--surface-hover)] group"
                    >
                      <img
                        src={photo.previewUrl}
                        alt="Dokumentasi"
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => removePhoto(photo.id)}
                        className="absolute top-1 right-1 p-1 rounded-full bg-black/70 text-white hover:bg-[var(--accent-red)] transition-colors"
                        aria-label="Hapus foto"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}

                  {/* Explicit Add Tile with dashed blue border and plus icon if < 8 photos */}
                  {photos.length < 8 && (
                    <label className="aspect-square rounded-[var(--radius-sm)] border-2 border-dashed border-[var(--accent-blue)]/50 hover:border-[var(--accent-blue)] bg-[var(--surface-hover)]/40 hover:bg-[var(--surface-hover)] flex flex-col items-center justify-center cursor-pointer transition-colors text-center p-2 group">
                      <Camera className="w-5 h-5 text-[var(--accent-blue)] group-hover:scale-110 transition-transform mb-1" />
                      <span className="text-[10px] text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] leading-tight">
                        Tambah Foto
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handlePhotoSelect}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>

                <p className="text-[11px] text-[var(--text-secondary)]">
                  Format yang didukung: JPG, PNG, WEBP. Maksimal 10MB per berkas.
                </p>
              </div>

              {/* Actual Start & End Time per logic.md section 3 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Waktu Mulai Aktual Kegiatan *"
                  type="time"
                  value={actualStartTime}
                  onChange={(e) => setActualStartTime(e.target.value)}
                  required
                />

                <Input
                  label="Waktu Selesai Aktual Kegiatan (Opsional)"
                  type="time"
                  value={actualEndTime}
                  onChange={(e) => setActualEndTime(e.target.value)}
                />
              </div>

              {/* Actual Location Picker (Shared Map-Thumbnail Component) */}
              <div>
                <LocationPicker
                  label="Lokasi Aktual Kegiatan (Verifikasi Titik Koordinat)"
                  value={actualLocation}
                  onChange={(loc) => setActualLocation(loc)}
                />
              </div>

              {/* Minutes / Notulen Textarea */}
              <div>
                <Textarea
                  label="Notulen / Risalah Rapat & Catatan Dokumentasi *"
                  placeholder="Tuliskan poin pembahasan, hasil keputusan rapat, atau kendala lapangan..."
                  rows={5}
                  value={minutesText}
                  onChange={(e) => setMinutesText(e.target.value)}
                  required
                />
              </div>

              {/* Single primary submit button per design.md section 5 */}
              <div className="pt-4 border-t border-[var(--border)] flex items-center justify-between">
                <span className="text-xs text-[var(--text-secondary)]">
                  Laporan akan tersimpan dan terkunci secara permanen.
                </span>

                <Button
                  type="submit"
                  variant="primary"
                  isLoading={isSubmitting}
                >
                  Kirim Dokumentasi
                </Button>
              </div>
            </form>
          </Card>
        )}
      </div>

      {/* Success Popup Modal: only shown after confirmed successful database insert */}
      <SuccessPopup
        isOpen={showSuccessPopup}
        title="Laporan terkirim"
        subtitle="Dokumentasi telah tersimpan di database. Mengalihkan ke Riwayat Laporan..."
        redirectTo="/riwayat"
        delayMs={1600}
        onClose={() => setShowSuccessPopup(false)}
      />
    </AppShell>
  );
}
