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
  CheckCircle2,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Card, Input, Textarea } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { LocationPicker } from "@/components/map/LocationPicker";
import { SuccessPopup } from "@/components/ui/SuccessPopup";
import { useAuth } from "@/lib/context/auth-context";
import { createClient } from "@/lib/supabase/client";
import { Task } from "@/types/database";

// -----------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------

interface UploadedPhoto {
  id: string;
  file: File;
  previewUrl: string;
  name: string;
  size: number;
}

/** One task_completions row, joined with submitter profile and photos. */
interface CompletionWithDetails {
  id: string;
  task_id: string;
  submitted_by: string;
  minutes_text: string | null;
  meeting_start_time: string | null;
  meeting_end_time: string | null;
  actual_location_address: string | null;
  actual_location_lat: number | null;
  actual_location_lng: number | null;
  created_at: string;
  submitter: { id: string; full_name: string; role: string } | null;
  photos: { id: string; storage_path: string }[];
}

// -----------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------

export default function TaskDetailPage() {
  const params = useParams();
  const taskId = params?.id as string;
  const router = useRouter();
  const { user, profile, isHead } = useAuth();
  const supabase = createClient();

  const [task, setTask] = useState<Task | null>(null);
  /** All completions for this task — one per submitter */
  const [completions, setCompletions] = useState<CompletionWithDetails[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Signed URLs keyed by photo.id — populated asynchronously for ALL completions
  const [signedPhotoUrls, setSignedPhotoUrls] = useState<Record<string, string>>({});

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

  // -----------------------------------------------------------------------
  // Data loading
  // -----------------------------------------------------------------------

  const loadTaskData = useCallback(async () => {
    if (!taskId) return;
    setIsLoading(true);

    try {
      // 1. Fetch task with creator + assignees
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

        // Pre-fill actual location with planned location as default
        if (taskData.planned_location) {
          setActualLocation({
            address: taskData.planned_location,
            lat: taskData.planned_location_lat,
            lng: taskData.planned_location_lng,
          });
        }
      }

      // 2. Fetch ALL completions for this task — one per assignee who has submitted.
      //    Includes submitter profile and their photos.
      //    RLS enforces: Heads see all rows; Members see only their own.
      const { data: completionsData, error: completionsError } = await supabase
        .from("task_completions")
        .select(`
          *,
          submitter:profiles!task_completions_submitted_by_fkey(id, full_name, role),
          photos:completion_photos(id, storage_path)
        `)
        .eq("task_id", taskId)
        .order("created_at", { ascending: true });

      if (completionsError) {
        console.warn("Completions fetch error:", completionsError.message);
        setCompletions([]);
      } else {
        setCompletions((completionsData ?? []) as CompletionWithDetails[]);
      }
    } catch (err) {
      console.warn("Error loading task detail:", err);
    } finally {
      setIsLoading(false);
    }
  }, [taskId, supabase, user, profile]);

  useEffect(() => {
    loadTaskData();
  }, [loadTaskData]);

  // -----------------------------------------------------------------------
  // Signed URLs — resolved for ALL photos across ALL completions
  // (Fix 1: private bucket requires createSignedUrl, not getPublicUrl)
  // -----------------------------------------------------------------------

  useEffect(() => {
    const allPhotos = completions.flatMap((c) => c.photos ?? []);
    if (allPhotos.length === 0) {
      setSignedPhotoUrls({});
      return;
    }

    let isMounted = true;

    async function resolveSignedUrls() {
      const urlMap: Record<string, string> = {};
      await Promise.all(
        allPhotos.map(async (photo) => {
          try {
            const { data, error } = await supabase.storage
              .from("completion-photos")
              .createSignedUrl(photo.storage_path, 3600);
            if (!error && data?.signedUrl) {
              urlMap[photo.id] = data.signedUrl;
            } else if (error) {
              console.warn(`Signed URL failed for photo ${photo.id}:`, error.message);
            }
          } catch (err) {
            console.warn(`Exception creating signed URL for photo ${photo.id}:`, err);
          }
        })
      );

      if (isMounted) {
        setSignedPhotoUrls(urlMap);
      }
    }

    resolveSignedUrls();
    return () => {
      isMounted = false;
    };
  }, [completions, supabase]);

  // -----------------------------------------------------------------------
  // Photo upload validation per logic.md section 3
  // -----------------------------------------------------------------------

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

  // -----------------------------------------------------------------------
  // Completion form submission
  // -----------------------------------------------------------------------

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

      // 3. Status update is handled automatically by DB trigger handle_task_completion_status
      //    which flips tasks.status to 'completed' only when all assignees have submitted.

      // 4. Show success popup per logic.md section 3
      setShowSuccessPopup(true);
    } catch (err: any) {
      console.error("Completion submit exception:", err);
      setSubmitError(err?.message || "Terjadi kesalahan saat menyimpan laporan ke database");
    } finally {
      setIsSubmitting(false);
    }
  };

  // -----------------------------------------------------------------------
  // Derived state
  // -----------------------------------------------------------------------

  /** True if the current user already has their own completion row for this task */
  const hasSubmitted = completions.some((c) => c.submitted_by === user?.id);

  /** Task-level status badge — still derived from tasks.status (trigger-controlled) */
  const isTaskCompleted = task?.status === "completed";

  // -----------------------------------------------------------------------
  // Loading / not-found states
  // -----------------------------------------------------------------------

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

  const isCreatedByOther = isHead && task.created_by !== user?.id && (task as any).creator?.full_name;

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

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

        {/* ── 1. Task Info Card ── */}
        <Card className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[var(--border)]">
            <div className="flex items-center gap-2">
              <Badge variant={isTaskCompleted ? "green" : "blue"} size="md">
                {isTaskCompleted ? "Selesai" : "Menunggu Dokumentasi"}
              </Badge>

              {/* Creator Attribution per logic.md section 5 */}
              {isCreatedByOther && (
                <span className="text-xs text-[var(--text-secondary)]">
                  Dibuat oleh <strong className="text-[var(--text-primary)] font-medium">{(task as any).creator?.full_name}</strong>
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

          {/* Planned Location */}
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
              {(task as any).assignees && (task as any).assignees.length > 0 ? (
                (task as any).assignees.map((a: any, i: number) => (
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

        {/* ── 2. Completion Section ── */}

        {/* READ-ONLY LOCKED CARDS — one per assignee who has submitted
            Per logic.md section 3: each card is independently immutable once submitted.
            RLS: Heads see all; Members see only their own row. */}
        {completions.length > 0 && (
          <div className="space-y-4">
            {/* Section header */}
            <div className="flex items-center gap-2">
              <FileCheck className="w-4 h-4 text-[var(--status-success)]" />
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                Dokumentasi Pelaksanaan
                {completions.length > 1 && (
                  <span className="ml-1.5 text-xs font-normal text-[var(--text-secondary)]">
                    ({completions.length} laporan)
                  </span>
                )}
              </h2>
              <Badge variant="green" size="sm" className="ml-auto">Terkunci &amp; Sah</Badge>
            </div>

            {completions.map((comp) => {
              const compPhotos = comp.photos ?? [];
              const submitterLabel = comp.submitter?.role === "head" ? "Kepala" : "Anggota";
              const submittedAt = new Date(comp.created_at).toLocaleDateString("id-ID", {
                day: "numeric", month: "short", year: "numeric",
              });
              const actualStart = comp.meeting_start_time
                ? new Date(comp.meeting_start_time).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) + " WIB"
                : "-";
              const actualEnd = comp.meeting_end_time
                ? new Date(comp.meeting_end_time).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) + " WIB"
                : null;

              return (
                <Card
                  key={comp.id}
                  className="border-l-4 border-l-[var(--status-success)] space-y-4"
                >
                  {/* Submitter byline */}
                  <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-[var(--status-success)]" />
                      <span className="text-sm font-medium text-[var(--text-primary)]">
                        {comp.submitter?.full_name ?? "Petugas"}
                      </span>
                      <span className="text-xs text-[var(--text-secondary)]">— {submitterLabel}</span>
                    </div>
                    <span className="text-[11px] text-[var(--text-secondary)]">{submittedAt}</span>
                  </div>

                  <p className="text-xs text-[var(--text-secondary)] italic">
                    Laporan ini telah tersimpan dan bersifat permanen — tidak dapat disunting kembali sesuai ketentuan integritas arsip DOOR.
                  </p>

                  {/* Actual time & location */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
                    <div>
                      <span className="text-xs font-medium text-[var(--text-secondary)] block mb-1">
                        Waktu Aktual:
                      </span>
                      <p className="text-sm text-[var(--text-primary)]">
                        {actualStart}{actualEnd ? ` – ${actualEnd}` : ""}
                      </p>
                    </div>
                    <div>
                      <span className="text-xs font-medium text-[var(--text-secondary)] block mb-1">
                        Lokasi Aktual:
                      </span>
                      <p className="text-sm text-[var(--text-primary)]">
                        {comp.actual_location_address || task.planned_location || "Sesuai lokasi rencana"}
                      </p>
                    </div>
                  </div>

                  {/* Minutes / Notulen */}
                  <div className="pt-2 border-t border-[var(--border)]">
                    <span className="text-xs font-medium text-[var(--text-secondary)] block mb-1.5">
                      Ringkasan Notulen / Risalah Rapat:
                    </span>
                    <div className="p-3.5 bg-[var(--surface-hover)] border border-[var(--border)] rounded-[var(--radius-md)] text-xs text-[var(--text-primary)] whitespace-pre-wrap leading-relaxed">
                      {comp.minutes_text || "Notulen rapat tercatat lengkap."}
                    </div>
                  </div>

                  {/* Photos — signed URLs from the shared map */}
                  {compPhotos.length > 0 && (
                    <div className="pt-2 border-t border-[var(--border)]">
                      <span className="text-xs font-medium text-[var(--text-secondary)] block mb-2">
                        Foto Bukti Dokumentasi ({compPhotos.length} foto):
                      </span>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                        {compPhotos.map((photo) => {
                          const signedUrl = signedPhotoUrls[photo.id];
                          return (
                            <div
                              key={photo.id}
                              className="aspect-square bg-[var(--surface-hover)] border border-[var(--border)] rounded-[var(--radius-sm)] overflow-hidden relative group"
                            >
                              {signedUrl ? (
                                <img
                                  src={signedUrl}
                                  alt="Dokumentasi Rapat"
                                  className="w-full h-full object-cover relative z-10"
                                  onError={(e) => {
                                    (e.target as HTMLElement).style.display = "none";
                                  }}
                                />
                              ) : null}
                              <div className="absolute inset-0 flex flex-col items-center justify-center text-[var(--text-secondary)] p-2 text-center pointer-events-none z-0">
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
              );
            })}
          </div>
        )}

        {/* ── COMPLETION FORM — only shown when the current user has NOT yet submitted ──
            Per logic.md section 3: check is per-user (hasSubmitted), not per task.status.
            A task can simultaneously show locked cards for other submitters + this form. */}
        {!hasSubmitted && (
          <Card className="space-y-6">
            <div className="pb-3 border-b border-[var(--border)]">
              <h2 className="text-base font-semibold text-[var(--text-primary)]">
                Formulir Penyelesaian &amp; Dokumentasi Tugas
              </h2>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                Unggah bukti foto, catat waktu aktual, dan lampirkan notulen rapat ke database.
              </p>
            </div>

            <form onSubmit={handleCompletionSubmit} className="space-y-6">
              {/* Photo Upload Grid */}
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

              {/* Actual Time */}
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

              {/* Actual Location Picker */}
              <div>
                <LocationPicker
                  label="Lokasi Aktual Kegiatan (Verifikasi Titik Koordinat)"
                  value={actualLocation}
                  onChange={(loc) => setActualLocation(loc)}
                />
              </div>

              {/* Minutes / Notulen */}
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

              {/* Submit */}
              <div className="pt-4 border-t border-[var(--border)] flex items-center justify-between">
                <span className="text-xs text-[var(--text-secondary)]">
                  Laporan akan tersimpan dan terkunci secara permanen.
                </span>
                <Button type="submit" variant="primary" isLoading={isSubmitting}>
                  Kirim Dokumentasi
                </Button>
              </div>
            </form>
          </Card>
        )}
      </div>

      {/* Success Popup — shown only after confirmed successful database insert */}
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
