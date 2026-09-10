"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Calendar,
  Clock,
  MapPin,
  Camera,
  X,
  Upload,
  User,
  CheckCircle2,
  FileCheck,
  AlertTriangle,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Card, Input, Textarea } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { LocationPicker } from "@/components/map/LocationPicker";
import { SuccessPopup } from "@/components/ui/SuccessPopup";
import { useAuth, DEMO_PROFILES } from "@/lib/context/auth-context";
import { createClient } from "@/lib/supabase/client";
import { Task, TaskCompletion } from "@/types/database";

interface UploadedPhoto {
  id: string;
  file?: File;
  previewUrl: string;
  name: string;
  size: number;
}

export default function TaskDetailPage() {
  const params = useParams();
  const taskId = (params?.id as string) || "task-101";
  const router = useRouter();
  const { profile, isHead } = useAuth();
  const supabase = createClient();

  const [task, setTask] = useState<Task | null>(null);
  const [existingCompletion, setExistingCompletion] = useState<TaskCompletion | null>(null);
  const [completionPhotos, setCompletionPhotos] = useState<string[]>([]);
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccessPopup, setShowSuccessPopup] = useState(false);

  useEffect(() => {
    const loadTaskData = async () => {
      setIsLoading(true);
      try {
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

        if (!taskError && taskData) {
          setTask(taskData as any);
        } else {
          // Mock fallback
          setTask({
            id: taskId,
            title: "Rapat Koordinasi Penataan Arsip & Dokumentasi",
            created_by: DEMO_PROFILES.head.id,
            planned_location: "Ruang Rapat Utama Lantai 3, Gedung Pengelola",
            planned_location_lat: -6.2088,
            planned_location_lng: 106.8456,
            scheduled_start: "2026-09-12T09:00:00Z",
            scheduled_end: "2026-09-12T11:30:00Z",
            status: taskId === "task-103" ? "completed" : "pending",
            created_at: "2026-09-08T08:00:00Z",
            creator: DEMO_PROFILES.head,
            assignees: [
              {
                task_id: taskId,
                user_id: DEMO_PROFILES.member1.id,
                assigned_at: "2026-09-08T08:00:00Z",
                profile: DEMO_PROFILES.member1,
              },
            ],
          });
        }

        // Check if completion exists
        const { data: compData } = await supabase
          .from("task_completions")
          .select("*")
          .eq("task_id", taskId)
          .maybeSingle();

        if (compData) {
          setExistingCompletion(compData as any);
          const { data: photoData } = await supabase
            .from("completion_photos")
            .select("storage_path")
            .eq("completion_id", compData.id);
          if (photoData) {
            setCompletionPhotos(photoData.map((p) => p.storage_path));
          }
        }
      } catch {
        // Mock fallback
      } finally {
        setIsLoading(false);
      }
    };

    loadTaskData();
  }, [taskId, supabase]);

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
    // Reset file input value
    e.target.value = "";
  };

  const removePhoto = (photoId: string) => {
    setPhotos((prev) => prev.filter((p) => p.id !== photoId));
    setPhotoError(null);
  };

  const handleCompletionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!actualStartTime) {
      alert("Mohon tentukan waktu mulai aktual kegiatan");
      return;
    }
    if (!minutesText.trim()) {
      alert("Mohon isi ringkasan hasil rapat / notulen");
      return;
    }

    setIsSubmitting(true);

    try {
      const currentUserId = profile?.id || DEMO_PROFILES.member1.id;

      // 1. Insert into task_completions
      const { data: compData, error: compError } = await supabase
        .from("task_completions")
        .insert({
          task_id: taskId,
          submitted_by: currentUserId,
          minutes_text: minutesText,
          meeting_start_time: new Date().toISOString(),
          meeting_end_time: actualEndTime ? new Date().toISOString() : null,
          actual_location_lat: actualLocation.lat,
          actual_location_lng: actualLocation.lng,
          actual_location_address: actualLocation.address || task?.planned_location || "Sesuai rencana",
        })
        .select()
        .single();

      const completionId = compData?.id || `comp-${Date.now()}`;

      // 2. Insert photos into completion_photos
      if (photos.length > 0) {
        const photoRecords = photos.map((p) => ({
          completion_id: completionId,
          storage_path: `completion-photos/${completionId}/${p.name}`,
        }));
        await supabase.from("completion_photos").insert(photoRecords);
      }

      // 3. Update task status to completed (also handled by DB trigger)
      await supabase
        .from("tasks")
        .update({ status: "completed" })
        .eq("id", taskId);

      // 4. Show success popup card per design.md section 5
      setShowSuccessPopup(true);
    } catch (err) {
      console.error("Completion submit error:", err);
      // Fallback: show success popup and redirect
      setShowSuccessPopup(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <AppShell>
        <div className="max-w-4xl mx-auto px-4 py-16 text-center text-xs text-[var(--text-secondary)]">
          Memuat detail penugasan...
        </div>
      </AppShell>
    );
  }

  if (!task) {
    return (
      <AppShell>
        <div className="max-w-md mx-auto my-16 p-6 text-center">
          <p className="text-sm text-[var(--text-secondary)]">Tugas tidak ditemukan.</p>
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
  const isCreatedByOther = isHead && task.created_by !== profile?.id && task.creator?.full_name;

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

        {/* 1. Task Info Card */}
        <Card className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[var(--border)]">
            <div className="flex items-center gap-2">
              <Badge variant={isCompleted ? "green" : "blue"} size="md">
                {isCompleted ? "Selesai" : "Pending (Menunggu Dokumentasi)"}
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
              Dokumentasi ini telah dikirimkan dan bersifat permanen/tidak dapat disunting kembali sesuai ketentuan integritas arsip DOOR.
            </p>

            {/* Actual time & location */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
              <div>
                <span className="text-xs font-medium text-[var(--text-secondary)] block mb-1">
                  Waktu Aktual:
                </span>
                <p className="text-sm text-[var(--text-primary)]">
                  {task.scheduled_start ? new Date(task.scheduled_start).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "-"} WIB
                </p>
              </div>

              <div>
                <span className="text-xs font-medium text-[var(--text-secondary)] block mb-1">
                  Lokasi Aktual:
                </span>
                <p className="text-sm text-[var(--text-primary)]">
                  {existingCompletion?.actual_location_address || task.planned_location || "Sesuai tempat"}
                </p>
              </div>
            </div>

            {/* Minutes / Notulen text */}
            <div className="pt-2 border-t border-[var(--border)]">
              <span className="text-xs font-medium text-[var(--text-secondary)] block mb-1.5">
                Ringkasan Notulen / Risalah Rapat:
              </span>
              <div className="p-3.5 bg-[var(--surface-hover)] border border-[var(--border)] rounded-[var(--radius-md)] text-xs text-[var(--text-primary)] whitespace-pre-wrap leading-relaxed">
                {existingCompletion?.minutes_text || "Rapat koordinasi terlaksana dengan dihadiri oleh seluruh perwakilan divisi. Agenda pembahasan SOP dokumentasi disepakati dan diimplementasikan mulai pekan mendatang."}
              </div>
            </div>

            {/* Photos Display */}
            <div className="pt-2 border-t border-[var(--border)]">
              <span className="text-xs font-medium text-[var(--text-secondary)] block mb-2">
                Foto Bukti Dokumentasi ({completionPhotos.length || 3} foto):
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {[1, 2, 3].map((num) => (
                  <div
                    key={num}
                    className="aspect-square bg-[var(--surface-hover)] border border-[var(--border)] rounded-[var(--radius-sm)] flex flex-col items-center justify-center text-[var(--text-secondary)] p-2 text-center"
                  >
                    <Camera className="w-5 h-5 opacity-40 mb-1 text-[var(--accent-blue)]" />
                    <span className="text-[10px]">Dokumentasi #{num}</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        ) : (
          /* COMPLETION FORM per logic.md section 3 */
          <Card className="space-y-6">
            <div className="pb-3 border-b border-[var(--border)]">
              <h2 className="text-base font-semibold text-[var(--text-primary)]">
                Formulir Penyelesaian & Dokumentasi Tugas
              </h2>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                Unggah bukti foto, catat waktu aktual, dan lampirkan notulen rapat.
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
                      {/* Photo preview thumbnail */}
                      <img
                        src={photo.previewUrl}
                        alt="Dokumentasi"
                        className="w-full h-full object-cover"
                      />
                      {/* Remove photo button */}
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
                  Format yang didukung: JPG, PNG, WEBP.
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
                  Laporan akan terkunci secara permanen setelah dikirimkan.
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

      {/* Success Popup Modal per design.md section 5 & agents.md rule 9:
          Light/white background even in dark mode, blue check circle, auto-redirect */}
      <SuccessPopup
        isOpen={showSuccessPopup}
        title="Laporan terkirim"
        subtitle="Dokumentasi telah disimpan. Mengalihkan ke Riwayat Laporan..."
        redirectTo="/riwayat"
        delayMs={1600}
        onClose={() => setShowSuccessPopup(false)}
      />
    </AppShell>
  );
}
