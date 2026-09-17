"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
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
  Users,
  Plus,
  Lock,
  FileCheck,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Maximize2,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Card, Input, Textarea } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { LocationPicker } from "@/components/map/LocationPicker";
import { AssigneeSearchModal } from "@/components/tugas/AssigneeSearchModal";
import { SuccessPopup } from "@/components/ui/SuccessPopup";
import { PhotoLightbox, LightboxPhoto } from "@/components/ui/PhotoLightbox";
import { useAuth } from "@/lib/context/auth-context";
import { createClient } from "@/lib/supabase/client";
import { Task, Profile } from "@/types/database";

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

interface AssigneeStatus {
  user_id: string;
  full_name: string;
  has_submitted: boolean;
}

interface EditAssigneeRow {
  id: string;
  user: Profile | null;
  hasSubmitted: boolean;
}

// -----------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------

export default function TaskDetailPage() {
  const params = useParams();
  const taskId = params?.id as string;
  const router = useRouter();
  const { user, profile, isHead } = useAuth();
  const supabase = useMemo(() => createClient(), []);

  const [task, setTask] = useState<Task | null>(null);
  /** All completions visible to the current user under RLS rules */
  const [completions, setCompletions] = useState<CompletionWithDetails[]>([]);
  /** Status flags per assignee from get_task_completion_status RPC */
  const [assigneeStatuses, setAssigneeStatuses] = useState<AssigneeStatus[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Signed URLs keyed by photo.id — populated asynchronously for ALL completions
  const [signedPhotoUrls, setSignedPhotoUrls] = useState<Record<string, string>>({});

  // Track if location has been initialized from task.planned_location so it is never overwritten on re-fetch
  const hasInitializedLocationRef = useRef(false);

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

  // Head-Editable Task Assignees state
  const [isEditingAssignees, setIsEditingAssignees] = useState(false);
  const [editAssigneeRows, setEditAssigneeRows] = useState<EditAssigneeRow[]>([]);
  const [activeRowIdForSearch, setActiveRowIdForSearch] = useState<string | null>(null);
  const [isSavingAssignees, setIsSavingAssignees] = useState(false);
  const [editAssigneeError, setEditAssigneeError] = useState<string | null>(null);
  const [editSuccessMsg, setEditSuccessMsg] = useState<string | null>(null);

  // Lightbox state for full-size photo viewing
  const [lightboxPhotos, setLightboxPhotos] = useState<LightboxPhoto[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);

  // Track image load errors per photo ID
  const [imageErrorMap, setImageErrorMap] = useState<Record<string, boolean>>({});

  const handleOpenLightbox = (photosList: { id: string; storage_path: string }[], clickedIndex: number) => {
    const prepared: LightboxPhoto[] = photosList.map((p) => ({
      id: p.id,
      storage_path: p.storage_path,
      signedUrl: signedPhotoUrls[p.id],
      name: p.storage_path.split("/").pop(),
    }));
    setLightboxPhotos(prepared);
    setLightboxIndex(clickedIndex);
    setIsLightboxOpen(true);
  };

  // -----------------------------------------------------------------------
  // Photo helpers — MIME normalisation & HEIC detection
  // -----------------------------------------------------------------------

  /** Derive a reliable MIME type from a filename extension when file.type is empty/wrong. */
  function getMimeFromExtension(filename: string): string {
    const ext = filename.split(".").pop()?.toLowerCase() ?? "";
    const map: Record<string, string> = {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      webp: "image/webp",
      gif: "image/gif",
      heic: "image/heic",
      heif: "image/heif",
    };
    return map[ext] ?? "image/jpeg";
  }

  /**
   * Returns true for HEIC/HEIF files — which browsers cannot decode natively.
   * Detects by MIME type OR extension (because some OSes report file.type = "" for HEIC).
   */
  function isHeicFile(file: File): boolean {
    const heicMimes = ["image/heic", "image/heif"];
    if (heicMimes.includes(file.type.toLowerCase())) return true;
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    return ext === "heic" || ext === "heif";
  }

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

        // Pre-fill actual location with planned location ONLY on initial load
        if (!hasInitializedLocationRef.current && taskData.planned_location) {
          setActualLocation({
            address: taskData.planned_location,
            lat: taskData.planned_location_lat,
            lng: taskData.planned_location_lng,
          });
          hasInitializedLocationRef.current = true;
        }
      }

      // 2. Fetch completions: RLS returns own row while pending; all rows once completed; Head always sees all
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

      // 3. Fetch RPC status per assignee via get_task_completion_status
      try {
        const { data: rpcStatuses, error: rpcError } = await supabase.rpc(
          "get_task_completion_status",
          { p_task_id: taskId }
        );
        if (!rpcError && rpcStatuses) {
          setAssigneeStatuses(rpcStatuses as AssigneeStatus[]);
        }
      } catch (e) {
        console.warn("RPC status fetch error:", e);
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

  // -----------------------------------------------------------------------
  // Signed URLs — resolved for ALL photos across ALL visible completions
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

  /**
   * Async photo selection handler — handles three cases:
   *   1. HEIC/HEIF → convert to JPEG client-side via heic2any before queuing.
   *   2. .jpg with empty file.type (Windows quirk) → normalise MIME type.
   *   3. All other accepted formats (jpeg, png, webp) → pass through normally.
   *
   * Must be async because heic2any is a Promise-based API.
   * React synthetic event is consumed synchronously before the first await.
   */
  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhotoError(null);
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // Reset the input value synchronously before any awaits — React pools
    // synthetic events and the value would be cleared anyway, but doing it
    // here explicitly avoids any stale-event issues.
    const fileList = Array.from(files);
    e.target.value = "";

    const remainingSlots = 8 - photos.length;
    if (remainingSlots <= 0) {
      setPhotoError("Maksimal 8 foto per dokumentasi.");
      return;
    }

    const newValidPhotos: UploadedPhoto[] = [];

    for (const rawFile of fileList) {
      if (newValidPhotos.length >= remainingSlots) {
        setPhotoError("Hanya maksimal 8 foto yang dapat diunggah.");
        break;
      }

      let file: File = rawFile;

      // ── HEIC/HEIF: convert to JPEG client-side ──────────────────────────
      if (isHeicFile(rawFile)) {
        try {
          // Dynamic import avoids SSR issues (heic2any relies on browser WASM)
          const heic2any = (await import("heic2any")).default;
          const converted = await heic2any({
            blob: rawFile,
            toType: "image/jpeg",
            quality: 0.92,
          });
          // heic2any may return a Blob or Blob[] (for multi-image HEIC)
          const blob = Array.isArray(converted) ? converted[0] : converted;
          const newName = rawFile.name.replace(/\.heic$/i, ".jpg").replace(/\.heif$/i, ".jpg");
          file = new File([blob], newName, { type: "image/jpeg" });
        } catch (convErr) {
          console.error("HEIC conversion failed:", convErr);
          setPhotoError(
            `File "${rawFile.name}" tidak dapat dikonversi. Pastikan berkas HEIC tidak rusak, lalu coba lagi.`
          );
          continue; // skip this file, continue with remaining
        }
      }

      // ── Size check (10MB) ───────────────────────────────────────────────
      if (file.size > 10 * 1024 * 1024) {
        setPhotoError(`File "${rawFile.name}" melebihi batas ukuran 10MB.`);
        continue;
      }

      // ── MIME normalisation: fix empty file.type (Windows .jpg quirk) ───
      // Some Windows browsers report file.type = "" for .jpg files.
      // We need a valid MIME type string for the Storage upload Content-Type header.
      const resolvedMime: string =
        file.type && file.type !== "application/octet-stream"
          ? file.type
          : getMimeFromExtension(file.name);

      // If the MIME type changed, re-wrap the file so file.type is correct
      // for downstream use (including the upload contentType parameter).
      if (resolvedMime !== file.type) {
        file = new File([file], file.name, { type: resolvedMime });
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

    if (newValidPhotos.length > 0) {
      setPhotos((prev) => [...prev, ...newValidPhotos]);
    }
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

      // 1. Insert into task_completions with actual location (Bug 3 fix)
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

          // Always pass a valid non-empty Content-Type — guards against the
          // edge case where file.type is still empty after normalisation
          // (e.g. a file added programmatically without a type attribute).
          const uploadMime =
            p.file.type && p.file.type !== "application/octet-stream"
              ? p.file.type
              : getMimeFromExtension(p.name);

          const { error: uploadError } = await supabase.storage
            .from("completion-photos")
            .upload(storagePath, p.file, {
              contentType: uploadMime,
              upsert: true,
            });

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

      // 3. Show success popup per logic.md section 3
      setShowSuccessPopup(true);
    } catch (err: any) {
      console.error("Completion submit exception:", err);
      setSubmitError(err?.message || "Terjadi kesalahan saat menyimpan laporan ke database");
    } finally {
      setIsSubmitting(false);
    }
  };

  // -----------------------------------------------------------------------
  // Head: Edit Assignees handlers
  // -----------------------------------------------------------------------

  const handleOpenEditAssignees = () => {
    const currentAssignees = ((task as any)?.assignees ?? []).map((a: any, idx: number) => {
      const prof: Profile = a.profile || {
        id: a.user_id,
        full_name: "Petugas",
        role: "member",
        division: "Umum",
        avatar_url: null,
        created_at: "",
      };
      const isSubmitted =
        assigneeStatuses.some((s) => s.user_id === a.user_id && s.has_submitted) ||
        completions.some((c) => c.submitted_by === a.user_id);

      return {
        id: `row-${a.user_id}-${idx}`,
        user: prof,
        hasSubmitted: isSubmitted,
      };
    });

    setEditAssigneeRows(
      currentAssignees.length > 0
        ? currentAssignees
        : [{ id: `row-${Date.now()}`, user: null, hasSubmitted: false }]
    );
    setEditAssigneeError(null);
    setIsEditingAssignees(true);
  };

  const handleAddEditAssigneeRow = () => {
    setEditAssigneeRows((prev) => [
      ...prev,
      {
        id: `row-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        user: null,
        hasSubmitted: false,
      },
    ]);
  };

  const handleRemoveEditAssigneeRow = (rowId: string) => {
    const target = editAssigneeRows.find((r) => r.id === rowId);
    if (target?.hasSubmitted) {
      setEditAssigneeError("Petugas yang telah mengunggah laporan dokumentasi tidak dapat dihapus.");
      return;
    }

    if (editAssigneeRows.length === 1) {
      setEditAssigneeRows([{ id: rowId, user: null, hasSubmitted: false }]);
    } else {
      setEditAssigneeRows((prev) => prev.filter((r) => r.id !== rowId));
    }
  };

  const handleSelectAssigneeForEdit = (selectedUser: Profile) => {
    if (!activeRowIdForSearch) return;
    setEditAssigneeRows((prev) =>
      prev.map((r) =>
        r.id === activeRowIdForSearch
          ? {
              ...r,
              user: selectedUser,
              hasSubmitted:
                assigneeStatuses.some((s) => s.user_id === selectedUser.id && s.has_submitted) ||
                completions.some((c) => c.submitted_by === selectedUser.id),
            }
          : r
      )
    );
    setActiveRowIdForSearch(null);
  };

  const handleSaveAssignees = async () => {
    setEditAssigneeError(null);
    const validUsers = editAssigneeRows
      .map((r) => r.user)
      .filter((u): u is Profile => u !== null);

    if (validUsers.length === 0) {
      setEditAssigneeError("Minimal harus ada satu petugas pelaksana.");
      return;
    }

    // Deduplicate users
    const uniqueUsers: Profile[] = [];
    const seenIds = new Set<string>();
    for (const u of validUsers) {
      if (!seenIds.has(u.id)) {
        seenIds.add(u.id);
        uniqueUsers.push(u);
      }
    }

    const originalUserIds: string[] = ((task as any)?.assignees ?? []).map((a: any) => a.user_id);
    const newUserIds = uniqueUsers.map((u) => u.id);

    const addedUsers = uniqueUsers.filter((u) => !originalUserIds.includes(u.id));
    const removedUserIds = originalUserIds.filter((id) => !newUserIds.includes(id));

    // Guard: Prevent removal of already submitted assignees
    for (const rid of removedUserIds) {
      const hasSub =
        assigneeStatuses.some((s) => s.user_id === rid && s.has_submitted) ||
        completions.some((c) => c.submitted_by === rid);
      if (hasSub) {
        setEditAssigneeError(
          "Tidak dapat menghapus petugas yang telah menyelesaikan dan mengunggah dokumentasi."
        );
        return;
      }
    }

    if (addedUsers.length === 0 && removedUserIds.length === 0) {
      setIsEditingAssignees(false);
      return;
    }

    setIsSavingAssignees(true);

    try {
      // 1. Insert new assignees
      if (addedUsers.length > 0) {
        const inserts = addedUsers.map((u) => ({
          task_id: taskId,
          user_id: u.id,
        }));
        const { error: insErr } = await supabase.from("task_assignees").insert(inserts);
        if (insErr) {
          throw new Error(`Gagal menambahkan petugas: ${insErr.message}`);
        }

        // 2. Insert notifications for added assignees ('tugas', 'baru')
        const notifInserts = addedUsers.map((u) => ({
          user_id: u.id,
          category: "tugas" as const,
          detail: "baru" as const,
          reference_id: taskId,
          message: `Anda telah ditugaskan ke: ${task?.title}`,
          is_read: false,
        }));
        const { error: notifErr } = await supabase.from("notifications").insert(notifInserts);
        if (notifErr) {
          console.warn("Gagal mengirim notifikasi penugasan baru:", notifErr.message);
        }
      }

      // 3. Delete removed assignees
      if (removedUserIds.length > 0) {
        for (const uid of removedUserIds) {
          const { error: delErr } = await supabase
            .from("task_assignees")
            .delete()
            .eq("task_id", taskId)
            .eq("user_id", uid);
          if (delErr) {
            throw new Error(`Gagal menghapus penugasan: ${delErr.message}`);
          }
        }

        // 4. Insert notifications for removed assignees ('tugas', 'dihapus')
        const notifsToRemove = removedUserIds.map((uid) => ({
          user_id: uid,
          category: "tugas" as const,
          detail: "dihapus" as const,
          reference_id: taskId,
          message: `Anda telah dihapus dari penugasan: ${task?.title}`,
          is_read: false,
        }));
        const { error: delNotifErr } = await supabase.from("notifications").insert(notifsToRemove);
        if (delNotifErr) {
          console.warn("Gagal mengirim notifikasi pembatalan penugasan:", delNotifErr.message);
        }
      }

      // 5. Reload task data to re-evaluate completion status and roster
      await loadTaskData();
      setIsEditingAssignees(false);
      setEditSuccessMsg("Daftar petugas pelaksana berhasil diperbarui.");
      setTimeout(() => setEditSuccessMsg(null), 4000);
    } catch (err: any) {
      console.error("Save assignees error:", err);
      setEditAssigneeError(err?.message || "Terjadi kesalahan saat memperbarui petugas.");
    } finally {
      setIsSavingAssignees(false);
    }
  };

  // -----------------------------------------------------------------------
  // Derived state
  // -----------------------------------------------------------------------

  /** True if the current user already has their own completion submitted */
  const hasSubmitted =
    completions.some((c) => c.submitted_by === user?.id) ||
    assigneeStatuses.some((s) => s.user_id === user?.id && s.has_submitted);

  /** Task-level status badge — derived from tasks.status */
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

          {/* Assignees list with live status indicators & Head edit affordance */}
          <div className="pt-2 border-t border-[var(--border)] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[var(--text-secondary)] block">
                Petugas Pelaksana:
              </span>
              {isHead && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleOpenEditAssignees}
                  className="h-7 text-xs px-2.5 py-1 text-[var(--accent-blue)] border-[var(--border)] hover:border-[var(--accent-blue)]/50"
                  icon={<Users className="w-3.5 h-3.5" />}
                >
                  Edit Petugas
                </Button>
              )}
            </div>

            {editSuccessMsg && (
              <div className="p-2.5 bg-[var(--status-success)]/10 border border-[var(--status-success)]/30 rounded-[var(--radius-sm)] text-xs text-[var(--status-success)] flex items-center justify-between">
                <span>{editSuccessMsg}</span>
                <button
                  type="button"
                  onClick={() => setEditSuccessMsg(null)}
                  className="text-[var(--status-success)] hover:opacity-80"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {assigneeStatuses.length > 0 ? (
                assigneeStatuses.map((s) => (
                  <div
                    key={s.user_id}
                    className="inline-flex items-center gap-1.5 px-3 py-1 bg-[var(--surface-hover)] border border-[var(--border)] rounded-[var(--radius-full)] text-xs text-[var(--text-primary)]"
                  >
                    {s.has_submitted ? (
                      <CheckCircle2 className="w-3 h-3 text-[var(--status-success)]" />
                    ) : (
                      <AlertCircle className="w-3 h-3 text-[var(--accent-orange)]" />
                    )}
                    <span>{s.full_name}</span>
                    <span
                      className={`text-[10px] ml-1 font-medium ${
                        s.has_submitted
                          ? "text-[var(--status-success)]"
                          : "text-[var(--accent-orange)]"
                      }`}
                    >
                      ({s.has_submitted ? "Selesai" : "Menunggu"})
                    </span>
                  </div>
                ))
              ) : (task as any).assignees && (task as any).assignees.length > 0 ? (
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

        {/* READ-ONLY LOCKED CARDS — gated by RLS
            While task is pending: Member sees only own card; Head sees all.
            Once task is completed: All assignees on the task see all cards and photos! */}
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

                  {/* Actual time & location (Bug 3 fix) */}
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

                  {/* Photos — signed URLs with click-to-enlarge lightbox */}
                  {compPhotos.length > 0 && (
                    <div className="pt-2 border-t border-[var(--border)]">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-[var(--text-secondary)]">
                          Foto Bukti Dokumentasi ({compPhotos.length} foto):
                        </span>
                        <span className="text-[11px] text-[var(--accent-blue)]">
                          Klik foto untuk memperbesar
                        </span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                        {compPhotos.map((photo, idx) => {
                          const signedUrl = signedPhotoUrls[photo.id];
                          const hasError = imageErrorMap[photo.id];

                          return (
                            <div
                              key={photo.id}
                              onClick={() => {
                                if (signedUrl && !hasError) {
                                  handleOpenLightbox(compPhotos, idx);
                                }
                              }}
                              className={`aspect-square bg-[var(--surface-hover)] border border-[var(--border)] rounded-[var(--radius-sm)] overflow-hidden relative group ${
                                signedUrl && !hasError
                                  ? "cursor-pointer hover:border-[var(--accent-blue)] transition-all hover:shadow-md"
                                  : ""
                              }`}
                              title={
                                signedUrl && !hasError
                                  ? "Klik untuk melihat foto ukuran penuh"
                                  : photo.storage_path.split("/").pop()
                              }
                            >
                              {signedUrl && !hasError ? (
                                <>
                                  <img
                                    src={signedUrl}
                                    alt="Dokumentasi Rapat"
                                    className="w-full h-full object-cover relative z-10 group-hover:scale-105 transition-transform duration-200"
                                    onError={() => {
                                      setImageErrorMap((prev) => ({ ...prev, [photo.id]: true }));
                                    }}
                                  />
                                  {/* Hover Overlay with Enlarge Icon */}
                                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity z-20 flex flex-col items-center justify-center text-white pointer-events-none gap-1">
                                    <Maximize2 className="w-5 h-5 drop-shadow-md text-white" />
                                    <span className="text-[10px] font-medium drop-shadow-md">Perbesar</span>
                                  </div>
                                </>
                              ) : (
                                <div className="absolute inset-0 flex flex-col items-center justify-center text-[var(--text-secondary)] p-2 text-center pointer-events-none z-0">
                                  <Camera className="w-5 h-5 opacity-40 mb-1 text-[var(--accent-blue)]" />
                                  <span className="text-[10px] truncate max-w-full px-1">
                                    {photo.storage_path.split("/").pop()}
                                  </span>
                                </div>
                              )}
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

        {/* ── COMPLETION FORM — only shown when the current user has NOT yet submitted ── */}
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
                        accept="image/*,.heic,.heif"
                        multiple
                        onChange={handlePhotoSelect}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>

                <p className="text-[11px] text-[var(--text-secondary)]">
                  Format yang didukung: JPG, JPEG, PNG, WEBP. Foto HEIC (iPhone) dikonversi otomatis ke JPEG. Maksimal 10MB per berkas.
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

      {/* ── Edit Assignees Modal (Head Only) ── */}
      {isHead && isEditingAssignees && (
        <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] shadow-2xl max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-4 border-b border-[var(--border)] flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
                  <Users className="w-4 h-4 text-[var(--accent-blue)]" />
                  Ubah Petugas Pelaksana
                </h3>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                  Sesuaikan daftar petugas yang ditugaskan untuk kegiatan ini.
                </p>
              </div>
              <button
                type="button"
                onClick={() => !isSavingAssignees && setIsEditingAssignees(false)}
                className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-[var(--radius-sm)] transition-colors"
                aria-label="Tutup modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 overflow-y-auto space-y-4 flex-1">
              {editAssigneeError && (
                <div className="p-3 bg-[var(--accent-red)]/15 border border-[var(--accent-red)]/30 rounded-[var(--radius-md)] text-xs text-[var(--accent-red)] flex items-center justify-between">
                  <span>{editAssigneeError}</span>
                  <button
                    type="button"
                    onClick={() => setEditAssigneeError(null)}
                    className="text-[var(--accent-red)] hover:opacity-80"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-[var(--text-secondary)]">
                    Daftar Petugas Ditugaskan
                  </label>
                  <span className="text-[11px] text-[var(--text-secondary)]">
                    {editAssigneeRows.filter((r) => r.user !== null).length} petugas
                  </span>
                </div>

                {/* Stacked Assignee Rows matching task creation */}
                <div className="space-y-2.5">
                  {editAssigneeRows.map((row) => {
                    const hasUser = row.user !== null;
                    return (
                      <div key={row.id} className="relative flex items-center gap-2">
                        {hasUser ? (
                          <div className="flex-1 flex items-center justify-between bg-[var(--surface-hover)] border border-[var(--border)] rounded-[var(--radius-md)] px-3.5 py-2.5 min-h-[44px]">
                            <div className="flex items-center gap-2.5 overflow-hidden">
                              <div className="w-6 h-6 rounded-full bg-[var(--accent-blue-strong)] text-[var(--accent-blue-soft)] flex items-center justify-center text-[11px] font-semibold shrink-0">
                                {(row.user?.full_name || "A").charAt(0).toUpperCase()}
                              </div>
                              <div className="flex flex-col overflow-hidden">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-[var(--text-primary)] truncate">
                                    {row.user?.full_name}
                                  </span>
                                  {row.hasSubmitted && (
                                    <Badge variant="green" size="sm" className="shrink-0 text-[10px] py-0 px-1.5 h-4">
                                      <Lock className="w-2.5 h-2.5 mr-1" />
                                      Terkunci (Sudah Lapor)
                                    </Badge>
                                  )}
                                </div>
                                <span className="text-[10px] text-[var(--text-secondary)] truncate">
                                  {row.user?.division || "Umum"} • {row.user?.role === "head" ? "Kepala" : "Anggota"}
                                </span>
                              </div>
                            </div>

                            {/* If already submitted: locked (no X delete control), otherwise show X remove */}
                            {row.hasSubmitted ? (
                              <div
                                className="p-1 text-[var(--text-secondary)]/50 cursor-not-allowed flex items-center justify-center min-h-[32px] min-w-[32px]"
                                title="Petugas ini telah mengunggah dokumentasi pelaksanaan dan tidak dapat dihapus."
                              >
                                <Lock className="w-4 h-4" />
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleRemoveEditAssigneeRow(row.id)}
                                className="p-1 text-[var(--text-secondary)] hover:text-[var(--accent-red)] rounded-[var(--radius-sm)] transition-colors min-h-[32px] min-w-[32px] flex items-center justify-center"
                                title="Hapus petugas ini"
                                aria-label="Hapus petugas ini"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        ) : (
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

                        {!hasUser && editAssigneeRows.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveEditAssigneeRow(row.id)}
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

                {/* Add Row Button */}
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={handleAddEditAssigneeRow}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--accent-blue)] hover:text-[var(--accent-blue-strong)] hover:underline"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Tambah Penerima Penugasan</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-[var(--surface-hover)] border-t border-[var(--border)] flex items-center justify-end gap-2.5">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setIsEditingAssignees(false)}
                disabled={isSavingAssignees}
              >
                Batal
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleSaveAssignees}
                isLoading={isSavingAssignees}
              >
                Simpan Perubahan
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Dedicated Fullscreen Assignee Search Modal per logic.md section 4 */}
      <AssigneeSearchModal
        isOpen={activeRowIdForSearch !== null}
        onClose={() => setActiveRowIdForSearch(null)}
        onSelect={handleSelectAssigneeForEdit}
        selectedIds={editAssigneeRows.map((r) => r.user?.id).filter((id): id is string => !!id)}
      />

      {/* Success Popup — shown only after confirmed successful database insert */}
      <SuccessPopup
        isOpen={showSuccessPopup}
        title="Laporan terkirim"
        subtitle="Dokumentasi telah tersimpan di database. Mengalihkan ke Riwayat Laporan..."
        redirectTo="/riwayat"
        delayMs={1600}
        onClose={() => setShowSuccessPopup(false)}
      />

      {/* Click-to-Enlarge Fullscreen Photo Lightbox */}
      <PhotoLightbox
        isOpen={isLightboxOpen}
        photos={lightboxPhotos}
        currentIndex={lightboxIndex}
        onClose={() => setIsLightboxOpen(false)}
        onNavigate={(newIdx) => setLightboxIndex(newIdx)}
      />
    </AppShell>
  );
}
