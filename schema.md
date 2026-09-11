# DOOR — Database Schema (Supabase / Postgres)

This document is the source of truth for data structure only. For UI/visual specs see `design.md`. For business rules, permissions, and step-by-step flows see `logic.md`.

Stack: Supabase (Postgres + Auth + Storage + Realtime), consumed by a Next.js app deployed on Vercel.

---

## 1. Roles

Two roles only, stored on `profiles.role`:
- `head` (Kepala) — can create tasks, assign to anyone, view all reports, approve/reject leave requests.
- `member` (Anggota) — can only view/complete tasks assigned to them, view their own reports, submit leave requests.

Role is enforced at the database level via RLS, not just hidden in the UI.

---

## 2. Tables

### `profiles`
Extends `auth.users`. One row per account, created on signup (trigger or app logic).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK, = `auth.users.id` |
| `full_name` | text | |
| `role` | text | enum-like: `'head'` \| `'member'` |
| `division` | text | e.g. "Divisi TI" |
| `avatar_url` | text | nullable, Supabase Storage path |
| `created_at` | timestamptz | default `now()` |

Readable by all authenticated users (needed for the Head's assignee directory/search). Only self-editable for profile fields (name, avatar); `role` should not be self-editable from the client.

---

### `tasks`
A task/assignment created by a Head.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK, default `gen_random_uuid()` |
| `title` | text | required |
| `created_by` | uuid | FK → `profiles.id`, must be a `head` |
| `planned_location` | text | human-readable address set by Head |
| `planned_location_lat` | float8 | nullable |
| `planned_location_lng` | float8 | nullable |
| `scheduled_start` | timestamptz | required |
| `scheduled_end` | timestamptz | nullable |
| `status` | text | `'pending'` \| `'completed'` only — flips to `'completed'` when a completion is submitted. No intermediate `in_progress` state. |
| `created_at` | timestamptz | default `now()` |

Only `head` role can INSERT. Any authenticated user can SELECT tasks they created or are assigned to (see `task_assignees`). Heads can SELECT all tasks — **including tasks created by other Heads**. Since a Head can see tasks they didn't personally create, the UI must always display the creator (join `created_by` → `profiles.full_name`) so it's clear whose task it is (e.g. "Dibuat oleh Suprapto") — see `logic.md` section 5 for the display rule.

---

### `task_assignees`
Join table — a task can have multiple assignees (Members and/or other Heads).

| Column | Type | Notes |
|---|---|---|
| `task_id` | uuid | FK → `tasks.id`, cascade delete |
| `user_id` | uuid | FK → `profiles.id` |
| `assigned_at` | timestamptz | default `now()` |

Composite PK (`task_id`, `user_id`). INSERT restricted to the task's `created_by` (a Head). A user can SELECT rows where `user_id = auth.uid()`, or any row if their own role is `head`.

---

### `task_completions`
The "Completion" section a Member (or Head) fills out after doing the task — documentation of what actually happened.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `task_id` | uuid | FK → `tasks.id` |
| `submitted_by` | uuid | FK → `profiles.id` |
| `minutes_text` | text | the "notulen"/meeting minutes content |
| `meeting_start_time` | timestamptz | actual start, distinct from `tasks.scheduled_start` |
| `meeting_end_time` | timestamptz | actual end |
| `actual_location_lat` | float8 | |
| `actual_location_lng` | float8 | |
| `actual_location_address` | text | reverse-geocoded label, stored so no re-fetch needed on reload |
| `created_at` | timestamptz | default `now()` |

One completion per (`task_id`, `submitted_by`) pair — enforced via a unique constraint on (`task_id`, `submitted_by`). Completions are **immutable once submitted**: INSERT restricted to users who are in `task_assignees` for that task; **no UPDATE policy exists for any role** (not even the submitter or a Head) — once sent, a completion cannot be edited or resubmitted. SELECT: own rows always; Heads can SELECT all.

---

### `completion_photos`
Multiple photos per completion (up to 8, enforced client-side + optionally a DB check).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `completion_id` | uuid | FK → `task_completions.id`, cascade delete |
| `storage_path` | text | path in Supabase Storage bucket, not the raw file |
| `uploaded_at` | timestamptz | default `now()` |

Storage bucket (e.g. `completion-photos`) should be private with signed URLs generated per-request, or public read if documentation photos are not sensitive — decide based on data sensitivity policy; default assumption here is **private bucket + signed URLs**.

---

### `pengajuan_izin` (leave requests)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | FK → `profiles.id`, requester |
| `reason` | text | |
| `start_date` | date | |
| `end_date` | date | |
| `status` | text | `'pending'` \| `'approved'` \| `'rejected'` |
| `reviewed_by` | uuid | nullable, FK → `profiles.id`, the Head who acted |
| `reviewed_at` | timestamptz | nullable |
| `created_at` | timestamptz | default `now()` |

INSERT: any authenticated user, for themselves only. UPDATE (status/reviewed_by/reviewed_at): `head` role only. SELECT: own rows always; Heads can SELECT all.

---

### `notifications`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | FK → `profiles.id`, recipient |
| `category` | text | `'tugas'` \| `'izin'` — the broad event domain. Constrained via `CHECK`. |
| `detail` | text | specific event within that category: `'baru'` (for `'tugas'`), `'disetujui'` \| `'ditolak'` (for `'izin'`). Constrained via `CHECK` per category. |
| `reference_id` | uuid | id of the related task/izin row |
| `message` | text | |
| `is_read` | bool | default `false` |
| `created_at` | timestamptz | default `now()` |

Current canonical (`category`, `detail`) pairs:
- `('tugas', 'baru')` — a task was assigned to this user
- `('izin', 'disetujui')` — this user's leave request was approved
- `('izin', 'ditolak')` — this user's leave request was rejected

Standardized project-wide on Indonesian minimal set. Enforced via `CHECK ( (category = 'tugas' AND detail = 'baru') OR (category = 'izin' AND detail IN ('disetujui', 'ditolak')) )`.

INSERT: application-level on task creation for task assignees (with error checking); trigger-driven on izin status change. SELECT/UPDATE (mark read): only own rows (`user_id = auth.uid()`).

Realtime enabled on this table so the client can subscribe and update the notification badge/feed live.

---

## 3. Triggers

- **`handle_new_user`** — on `auth.users` insert, creates the corresponding `profiles` row (already implemented).
- **`handle_task_completion_status`** — on `task_completions` insert, counts `total_assignees` vs `total_completions` for the task. Flips parent `tasks.status` to `'completed'` if and only if every assignee has submitted their completion (`total_completions >= total_assignees`).
- **`handle_izin_status_notification`** — on `pengajuan_izin` UPDATE where `status` changes from `'pending'` to `'approved'` or `'rejected'`, inserts a `notifications` row for `user_id = pengajuan_izin.user_id` with `category = 'izin'` and `detail = 'disetujui'`/`'ditolak'` accordingly. Must be a database trigger, not an app-level insert — this guarantees the notification fires regardless of which code path changes the status (current UI, future admin tooling, direct SQL), matching the existing pattern used by `handle_task_completion_status`.

## 4. Realtime publication

Tables in `supabase_realtime`: `notifications`, `tasks`, `task_completions`, and **`pengajuan_izin`** (this last one was missing from the original migration — confirmed by QA pass — and must be added: `ALTER PUBLICATION supabase_realtime ADD TABLE public.pengajuan_izin;`).

Both the requesting Member and any Head must receive live updates on `pengajuan_izin` — the Member sees their own request's status change live; a Head sees new pending requests and status changes across the board live (their RLS SELECT policy already permits seeing all rows, so their realtime subscription is unfiltered while a Member's is scoped to their own `user_id`).

## 5. Row Level Security (RLS) — summary

RLS must be **enabled on every table above**. General pattern:

| Table | Head can | Member can |
|---|---|---|
| `profiles` | SELECT all, UPDATE own | SELECT all, UPDATE own |
| `tasks` | INSERT, SELECT all, UPDATE own-created | SELECT own-assigned only |
| `task_assignees` | INSERT/DELETE for tasks they created, SELECT all | SELECT own rows only |
| `task_completions` | SELECT all | INSERT own (must be an assignee), SELECT own only |
| `completion_photos` | SELECT all (via completion join) | SELECT own only (via completion join) |
| `pengajuan_izin` | SELECT all, UPDATE status (approve/reject) | INSERT own, SELECT own only |
| `notifications` | SELECT/UPDATE own only (Heads are not special here — it's per-recipient) | SELECT/UPDATE own only |

This is the mechanism behind the "Tugas/Penugasan" and "Riwayat Anda/Riwayat Anggota" toggle from the original brief: the toggle changes which query the frontend makes (own vs. all), and RLS is what actually enforces that a Member can't fetch other members' data even if the client were tampered with.

---

## 6. Storage

- Bucket: `completion-photos` — stores images referenced by `completion_photos.storage_path`.
- Bucket: `avatars` — optional, for `profiles.avatar_url`.
- File size/type validation should happen client-side before upload (per `logic.md`; limit: 10MB per photo, 8 photos max), plus Supabase Storage policies restricting upload to authenticated users and matching the folder-per-user or folder-per-completion convention (e.g. `completion-photos/{completion_id}/{filename}`).

### Storage path format

Upload paths use `{completion_id}/{timestamp}-{filename}` — the **first path segment is the completion UUID**, not the user UUID. All Storage RLS policies on `completion-photos` objects must use this accordingly.

### Storage RLS (completion-photos bucket)

The `completion_photos_read` Storage policy grants access as follows:
- **Heads**: `is_head()` → all objects in the bucket are readable.
- **Members**: must have submitted the completion whose `id` matches the first path segment of the object. The policy joins through `task_completions` (`WHERE id::text = (storage.foldername(name))[1] AND submitted_by = auth.uid()`).

**Co-assignee restriction**: a Member cannot read another assignee's completion photos, even on the same shared task. This matches the table-level `completion_photos_select` RLS policy intent (`schema.md` section 5: "Members: SELECT own only via completion join"). Broadening this to allow co-assignee cross-access would require an explicit policy decision and updates to both the `completion_photos_select` RLS and this Storage policy.



---

## 7. Resolved decisions (formerly open items)

- Completions are final once submitted — no edit/resubmit, no UPDATE policy on `task_completions`.
- Photo limit: 10MB per photo, 8 photos max per completion.
- Task status is binary (`pending`/`completed`) — no `in_progress` state.
- Heads can see tasks created by other Heads; creator attribution must always be visible in the UI (see `logic.md`).
- `completion-photos` bucket confirmed private with signed/RLS-gated access (QA-verified).
- Izin status-change notifications are DB-trigger-driven (`handle_izin_status_notification`), not app-level inserts — consistent with the completion-status trigger pattern.
- `notifications` uses a `category`/`detail` two-column shape (Option B) instead of a flat `type` enum, chosen for extensibility ahead of anticipated future role/domain expansion beyond Head/Member.
- Both Head and Member get live Realtime updates on `pengajuan_izin` — not just the requesting Member.

## 8. Still open

- Whether `completion-photos` bucket should be public or private/signed-URL — recommended private, pending confirmation.
- Full Riwayat Laporan hierarchy logic beyond basic own/all scoping — to be discussed in a follow-up session.
