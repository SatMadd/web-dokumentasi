# DOOR — Logic & Flows

This document covers business rules, permissions, and step-by-step behavior only. For visual/component specs see `design.md`. For database structure see `schema.md`.

---

## 1. Roles & permissions (high level)

Two roles: **Head** (Kepala) and **Member** (Anggota).

| Capability | Head | Member |
|---|---|---|
| Create a task | Yes | No |
| Assign a task to anyone (Member or Head) | Yes | No |
| View the full account directory (for assignment/search) | Yes | Not needed — Members don't assign |
| View/complete a task assigned to them | Yes | Yes |
| View own reports (Riwayat Laporan) | Yes | Yes |
| View other people's reports | Yes (all) | No (own only) |
| Submit a leave request (Pengajuan Izin) | Yes | Yes |
| Approve/reject a leave request | Yes | No |

Permissions must be enforced both in the UI (hide controls a role shouldn't see) and at the database level via RLS (see `schema.md`) — hiding a button is not sufficient security on its own.

---

## 2. Task lifecycle

1. **Creation** — a Head fills out the task creation form: title, date, time, planned location (via map picker), and one or more assignees (via the assignee field + search flow, see section 4). Only Heads see/can access this form at all.
2. **Assignment & notification** — on save, a row is created in `tasks` plus one row per person in `task_assignees`. Each assignee receives a real-time notification ("You've been assigned to [task title]").
3. **Visibility** — the task appears in the Tugas list for every assignee, and for the creating Head (who can monitor it via the "Tugas/Penugasan" toggle — see section 5).
4. **Opening a task** — tapping a task in the list shows a preview (title + time) first; tapping through opens full detail: full title, detailed date/time, planned location, and the Completion section.
5. **Completion** — the assignee (Member or Head) fills out the Completion form: photo uploads (max 8), actual meeting start/end time, actual location (via map picker), and minutes/notulen text. See section 3.
6. **Submission** — submitting creates a `task_completions` row (+ `completion_photos` rows). Task status updates accordingly. A success popup appears (blue check, white card, per `design.md`) and the user is auto-redirected to Riwayat Laporan after a short delay.
7. **Status tracking** — task status is binary: `pending` → `completed`, flipping the moment a completion is submitted. There is no intermediate `in_progress` state.

---

## 3. Completion form rules

- **Photos**: multiple allowed, capped at **8**, each file capped at **10MB**. Client-side validation should block adding a 9th photo, block any file over 10MB, and show the running count ("x of 8").
- **Immutability**: once a completion is submitted, it **cannot be edited or resubmitted** by anyone, including the original submitter and Heads. The UI should not offer any edit affordance on a completed task's record — it becomes a permanent, read-only piece of the historical record (Riwayat Laporan).
- **Actual vs. planned time/location**: the Completion form captures what *actually* happened (`meeting_start_time`, `meeting_end_time`, `actual_location_*`), which is intentionally separate from the Head's originally planned `scheduled_start/end` and `planned_location` on the task itself. Both are shown to the user so the distinction is visible, not hidden.
- **Location input method**: manual — the user searches an address or taps a location on a map (not auto-GPS). Implemented via the shared map-thumbnail component: a small map preview with a pin sits above "Cari alamat atau pilih peta"; tapping it opens a fullscreen map picker with geocoding search (Nominatim) and an explicit X control to back out without applying changes. This same component is used both in task creation (Head sets planned location) and completion (assignee logs actual location).
- **Minutes text**: free text field, no formatting requirements specified — plain text area.
- **Submission**: one primary submit button. On success, show the success popup and redirect — no intermediate confirmation dialog needed (the popup itself is the confirmation).

---

## 4. Assignee selection flow (task creation)

This replaced an earlier pill-based design — see `design.md` section 5 for the current visual spec. Logic:

1. The "Ditugaskan ke" area starts with a single empty field (dashed border, placeholder "Cari nama anggota atau kepala").
2. Tapping an empty field navigates to a **dedicated fullscreen search page**.
3. On that search page:
   - The screen starts **blank** — no list is shown until the user types.
   - After the user stops typing, wait **1.5 seconds** (debounce) before firing the search query. While waiting/loading, show a loading indicator in place of results.
   - Results are grouped under **letter headers** (A, B, C...) matching the first letter of each matching name.
   - Each letter group shows **at most 10 results at a time**, with **Previous/Next** controls and an **"x of y"** page indicator scoped to that specific letter group (e.g. "S" having 23 matches shows "1 of 3" with its own pagination, independent of any other letter group on screen).
4. Selecting a name returns the user to the task creation form, filling the field they came from with that person's name.
5. A filled field shows the person's name plus an **X control** to remove/clear that assignee row entirely.
6. Below the last field is a **"Tambah" (add)** link. Tapping it appends a new, independent blank field, repeatable with **no upper limit** on number of assignees.
7. Assignees can include both Members and other Heads — assignment direction is not restricted to "downward" only.

---

## 5. Head-specific dual views

For **Tugas** and **Riwayat Laporan**, Heads see a switch/toggle not shown to Members:

- **Tugas page**: toggle between "Tugas" (tasks assigned to the Head themself, as a doer) and "Penugasan" (tasks the Head has created/assigned to others, to monitor progress).
- **Riwayat Laporan page**: toggle between "Riwayat Anda" (the Head's own submitted completions) and "Riwayat Anggota" (completions submitted by anyone the Head oversees).

This toggle changes which query is made (own-scoped vs. all-scoped), enforced by RLS as described in `schema.md` — the toggle is a UX convenience, not the actual security boundary.

### Creator attribution (cross-Head visibility)

Heads can see **every task**, including ones created by other Heads — not just tasks they personally issued. To avoid ambiguity about whose task is whose, **every task must visibly display who created it** wherever a Head views tasks outside their own "Penugasan" tab — e.g. a line like "Dibuat oleh Suprapto" on the task card/detail. This applies to task list views, task detail, and anywhere else a Head might browse tasks created by peers. Members don't need this treatment as prominently since they only ever see tasks assigned to them (creator can still be shown, but there's no cross-Head ambiguity to resolve for a Member's own view).

*(Note: further hierarchy nuances for Riwayat Laporan beyond this were flagged as "to be discussed later" and are not yet finalized in this document — revisit before build.)*

---

## 6. Pengajuan Izin (leave requests)

1. Any user (Head or Member) submits a leave request: reason, start date, end date.
2. Request enters with `status = 'pending'`.
3. A Head reviews it and sets `status` to `'approved'` or `'rejected'`, recorded with `reviewed_by` and `reviewed_at`.
4. The requester receives a real-time notification of the outcome.
5. Members can only see their own leave requests; Heads can see and act on all.

---

## 7. Notifications

- Delivered via Supabase Realtime — live updates, not polling.
- Triggered by: task assignment, leave request approval/rejection (extendable to other events later).
- Each notification belongs to exactly one recipient (`user_id`) and links back to the relevant task or leave request via `reference_id`.
- Users can only see/mark-read their own notifications.

---

## 8. Dashboard content

Replacing the original reference's intern-headcount bar chart (which didn't fit a documentation product):

- **Stat cards**: role-relevant counts (e.g. Total Tugas, Pending, Selesai, Ditolak) rather than the reference's org-headcount metrics.
- **Status breakdown widget**: task counts by status (pending / completed / rejected) shown as progress bars, not a time-series chart.
- **Recent activity feed**: a live list of recent events (e.g. "Budi submitted a report," "Sinta was assigned a task," "Rian's leave was approved") — powered by the same Realtime mechanism as notifications.

---

## 9. Resolved decisions (formerly open items)

- Completions are permanently locked once submitted — no editing or resubmission, by anyone.
- Photo limit: 10MB per photo, 8 photos max.
- Task status is simply `pending` → `completed` — no intermediate state.
- Heads can see tasks made by other Heads; creator must always be visibly attributed (section 5).

## 10. Still open

- Full Riwayat Laporan hierarchy logic beyond the basic own/all toggle — flagged by the project owner as more complex, to be discussed in a follow-up session before this is build-ready.
