export type UserRole = "head" | "member";
export type TaskStatus = "pending" | "completed";
export type IzinStatus = "pending" | "approved" | "rejected";

export interface Profile {
  id: string;
  full_name: string | null;
  role: UserRole;
  division: string | null;
  avatar_url: string | null;
  created_at: string;
}

export interface Task {
  id: string;
  title: string;
  created_by: string;
  planned_location: string | null;
  planned_location_lat: number | null;
  planned_location_lng: number | null;
  scheduled_start: string;
  scheduled_end: string | null;
  status: TaskStatus;
  created_at: string;
  // Joins
  creator?: Profile | null;
  assignees?: TaskAssigneeWithProfile[];
  completion?: TaskCompletionWithDetails | null;
}

export interface TaskAssignee {
  task_id: string;
  user_id: string;
  assigned_at: string;
}

export interface TaskAssigneeWithProfile extends TaskAssignee {
  profile?: Profile | null;
}

export interface TaskCompletion {
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
}

export interface CompletionPhoto {
  id: string;
  completion_id: string;
  storage_path: string;
  uploaded_at: string;
}

export interface TaskCompletionWithDetails extends TaskCompletion {
  submitter?: Profile | null;
  photos?: CompletionPhoto[];
  task?: Task | null;
}

export interface PengajuanIzin {
  id: string;
  user_id: string;
  reason: string;
  start_date: string;
  end_date: string;
  status: IzinStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  user?: Profile | null;
  reviewer?: Profile | null;
}

export type NotificationCategory = "tugas" | "izin";
export type NotificationDetail = "baru" | "disetujui" | "ditolak";

export interface Notification {
  id: string;
  user_id: string;
  category: NotificationCategory;
  detail: NotificationDetail;
  reference_id: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

