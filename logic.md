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
6. **Submission** — each assignee submits their own completion independently (`task_completions` row tied by `task_id` and `submitted_by`, plus `completion_photos` rows). Each assignee provides their own photos, minutes, actual time, and actual location. A success popup appears (blue check, white card, per `design.md`) and the user is auto-redirected to Riwayat Laporan after a short delay.
7. **Status tracking** — task status is binary: `pending` → `completed`. The parent task status flips to `completed` if and only if **every assigned person has submitted their completion** (governed by the database trigger `handle_task_completion_status`). Until all assignees have submitted, the task remains `pending`, allowing remaining assignees to access and complete their form. Update: Riwayat Laporan surfaces a task as soon as any one assignee submits, showing a live per-assignee completion roster rather than waiting for full completion (see section 5).

---

## 3. Completion form rules

- **Independent submissions**: in multi-assignee tasks, each assignee submits their own separate documentation tied by `(task_id, submitted_by)`. One assignee's submission does not mark the task complete for other assignees nor lock them out.
- **Photos**: multiple allowed, capped at **8**, each file capped at **10MB**. Client-side validation should block adding a 9th photo, block any file over 10MB, and show the running count ("x of 8"). Accepted formats: `image/jpeg` (including both `.jpg` and `.jpeg` extensions), `image/png`, `image/webp`. Any photo viewer/thumbnail component must render all these formats identically; there must be no extension-based whitelist that only recognizes a subset (e.g. missing the `.jpg` extension variant while accepting `.jpeg`) and falls back to a generic file-icon placeholder for the rest.
- **HEIC handling**: HEIC/HEIF (the default format on iPhone cameras) is not natively renderable in most browsers via a plain `<img>` tag — this is a browser codec limitation, not an app bug. HEIC files are **converted to JPEG client-side at upload time** (before the file reaches Supabase Storage), using a browser-compatible WASM-based decode library (e.g. `heic2any`). Once converted, the resulting JPEG is uploaded and treated identically to any other photo — no special-casing needed downstream in storage, RLS, or display. The original HEIC file is not retained.
- **Photo viewing — click to enlarge**: wherever completion photos are displayed as thumbnails (task detail, Riwayat Laporan full report view), thumbnails must be clickable and open a fullscreen/lightbox view of the original image, consistent with `design.md`'s modal/popup visual patterns (dark backdrop, centered content, explicit close control). Thumbnails that cannot be enlarged are considered incomplete, not acceptable final behavior.
- **Immutability**: once a completion is submitted, it **cannot be edited or resubmitted** by anyone, including the original submitter and Heads. The UI should not offer any edit affordance on a completed task's record — it becomes a permanent, read-only piece of the historical record (Riwayat Laporan).
- **Actual vs. planned time/location**: the Completion form captures what *actually* happened (`meeting_start_time`, `meeting_end_time`, `actual_location_*`), which is intentionally separate from the Head's originally planned `scheduled_start/end` and `planned_location` on the task itself. Both are shown to the user so the distinction is visible, not hidden.
- **Location input method**: manual — the user searches an address or taps a location on a map (not auto-GPS). Implemented via the shared map-thumbnail component: a small map preview with a pin sits above "Cari alamat atau pilih peta"; tapping it opens a fullscreen map picker with geocoding search (Nominatim) and an explicit X control to back out without applying changes. This same component is used both in task creation (Head sets planned location) and completion (assignee logs actual location).
- **Minutes text**: free text field, no formatting requirements specified — plain text area.
- **Submission**: one primary submit button. On success, show the success popup and redirect — no intermediate confirmation dialog needed (the popup itself is the confirmation).
- **Multi-completion display**: in the task detail view, each submitted completion is displayed as an independent locked card (one per submitter). A task can show 0 to N locked cards depending on how many assignees have submitted so far. **Visibility is gated by overall task completion state**: while the task is still `pending` (i.e. not every assignee has submitted yet), a Member can only see their **own** completion card in full — co-assignees' cards are not visible to them at all (not even redacted), only a status flag (submitted or not) via the roster (see section 5). Once **every** assignee on the task has submitted and the task flips to `completed`, full cross-visibility opens up for everyone assigned to that task — all completion cards, including photos, become visible to every co-assignee, not just the Head. This is all-or-nothing per task: there is no partial reveal while some assignees are still pending. Heads always see everything regardless of task state, as before.
- **Form gate — per-user, not per-task**: the editable submission form is shown only when `completions.some(c => c.submitted_by === user.id) === false`. Task-level `status` is never used for this check — a task can still be `pending` overall while the current user has already submitted their own part.
- **Simultaneous locked + form state**: for a partially-submitted multi-assignee task, a user who has not yet submitted sees only their own editable form (no co-assignee cards yet, per the gate above) — once the task is fully completed, if this same page is revisited, all cards become visible per the completion-state gate.

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

### Editing assignees after creation (new)

Motivation: a task's originally assigned person may go on approved leave (Pengajuan Izin) after the task was created, and the task needs to be reassigned or have coverage added. This feature has **no automated link** to the Pengajuan Izin approval flow — approving a leave request does not automatically trigger or suggest reassignment; a Head must manually go edit the task's assignees if a swap is needed. The two features are related in *purpose* only, not wired together in code.

- **Who can edit**: any Head — not restricted to the task's original creator — can open a task and edit its assignee list, consistent with Heads already being able to view every task regardless of who created it.
- **UI**: reuses the same stacked assignee-fields component from task creation (`design.md` section 5) — pre-filled with the task's current assignees, each row independently removable via its X control, with the same "Tambah" flow to add more via the assignee search page.
- **Removal restriction**: an assignee who has **already submitted their completion** for this task cannot be removed — this is blocked at the RLS layer, not just hidden in the UI, since their submission is permanent history per the immutability rule (section 3). The UI should visually indicate (e.g. disable or omit the X control) that an already-submitted assignee's row is locked, rather than letting the user attempt a removal that will fail.
- **Notifications**: removing an assignee sends them a `('tugas', 'dihapus')` notification; adding a new assignee sends the existing `('tugas', 'baru')` notification, same as initial task creation.
- **No limit change**: the "at least implied but not hard-enforced" pattern from creation carries over — there's no explicit minimum assignee count enforced, consistent with task creation's existing behavior.

---

## 5. Head-specific dual views

For **Tugas** and **Riwayat Laporan**, Heads see a switch/toggle not shown to Members:

- **Tugas page**: toggle between "Tugas" (tasks assigned to the Head themself, as a doer) and "Penugasan" (tasks the Head has created/assigned to others, to monitor progress).
- **Riwayat Laporan page**: toggle between "Riwayat Anda" (the Head's own submitted completions) and "Riwayat Anggota" (completions submitted by anyone the Head oversees).

This toggle changes which query is made (own-scoped vs. all-scoped), enforced by RLS as described in `schema.md` — the toggle is a UX convenience, not the actual security boundary.

Update:
Riwayat Laporan is no longer restricted to fully completed tasks only. For tasks with multiple assignees, the entry appears in Riwayat Laporan as soon as at least one assignee has submitted a completion — not only once all assignees have submitted. Each entry shows a per-assignee roster at the bottom: every assignee's name with their individual status, e.g. "Ahmad Fauzi — ✓ Selesai" / "Budi S. — Menunggu Dokumentasi." This lets a viewer (Member or Head, subject to existing RLS scoping) see who has and hasn't submitted their part of a shared task, without needing to separately check the Tugas list.

**Content visibility while incomplete vs. complete**: while a task is only partially submitted, a Member viewing this entry sees the roster (names + status only, via `get_task_completion_status()` per `schema.md`) but **cannot open or view a co-assignee's actual documentation** (minutes, photos, actual location) — only their own. Once every assignee has submitted and the task is `completed`, full documentation for every assignee on that task becomes visible to everyone assigned to it (not just the Head) — same page, same "Lihat Laporan Lengkap" flow, now unlocked for all. This applies identically whether reached from Riwayat Laporan or the task detail page, since "Lihat Laporan Lengkap" routes to the same underlying view either way.

A single-assignee task behaves as before: it appears once that one person submits, and the roster shows just that one name as complete — the cross-visibility gate is moot with only one assignee.

The task-level completed status (all assignees submitted) still governs whether the task is "locked" for editing purposes and whether it shows the "Selesai" badge elsewhere (Dashboard, Tugas list) — this Riwayat Laporan roster is a visibility/tracking change only, it does not affect when tasks.status itself flips to completed (that logic is unchanged from the earlier per-assignee completion trigger fix).

RLS scoping is unchanged for the roster/status layer: a Member only sees rosters for tasks they're personally assigned to or created; a Head sees all, per the existing "Riwayat Anda / Riwayat Anggota" toggle. Full-content visibility follows the new gate described above and in `schema.md`.

### Creator attribution (cross-Head visibility)

Heads can see **every task**, including ones created by other Heads — not just tasks they personally issued. To avoid ambiguity about whose task is whose, **every task must visibly display who created it** wherever a Head views tasks outside their own "Penugasan" tab — e.g. a line like "Dibuat oleh Suprapto" on the task card/detail. This applies to task list views, task detail, and anywhere else a Head might browse tasks created by peers. Members don't need this treatment as prominently since they only ever see tasks assigned to them (creator can still be shown, but there's no cross-Head ambiguity to resolve for a Member's own view).

*(Note: further hierarchy nuances for Riwayat Laporan beyond this were flagged as "to be discussed later" and are not yet finalized in this document — revisit before build.)*

### Export to Excel (new feature)

An export button lives on the **Riwayat Laporan** page, accessible to **any Head**. It generates a `.xlsx` summary roster covering a selected time period.

- **Date range selection**: preset options as the base (e.g. "Minggu Ini", "Bulan Ini", "Bulan Lalu"), plus a "Custom" option that reveals a start/end date picker. Preset is the default UX, custom is the escape hatch.
- **Sheet shape**: a **summary roster** — one row per person (every profile, or every profile with at least one relevant record in range — implementer's choice unless it meaningfully affects clarity), with aggregate columns for that person within the selected date range:
  - Nama
  - Role (Kepala/Anggota)
  - Divisi
  - Total Tugas (count of tasks the person was assigned to, `created_at` within range)
  - Tugas Selesai (count of those where the person has a `task_completions` row)
  - Tugas Belum (Total Tugas − Tugas Selesai)
  - Izin Diajukan (count of `pengajuan_izin` rows for that person, `start_date` within range)
  - Izin Disetujui (count where `status = 'approved'`)
  - Izin Ditolak (count where `status = 'rejected'`)
- **Date anchoring** (important, easy to get wrong):
  - A task counts as "within range" based on `tasks.created_at` — **when the Head created it** — not the meeting's scheduled date.
  - A leave request counts as "within range" based on `pengajuan_izin.start_date` — the start of the leave period — not when it was submitted.
- **Single combined sheet**: task-attendance and leave data appear together in one sheet per the columns above, not as separate tabs — this is a roster-style summary, not a raw event log.

---

## 6. Pengajuan Izin (leave requests)

1. Any user (Head or Member) submits a leave request: reason, start date, end date.
2. Request enters with `status = 'pending'`.
3. A Head reviews it and sets `status` to `'approved'` or `'rejected'`, recorded with `reviewed_by` and `reviewed_at`.
4. The requester receives a real-time notification of the outcome, generated by a **database trigger** (`handle_izin_status_notification`, see `schema.md` section 3) that fires on the `pengajuan_izin` status UPDATE — not an app-level insert. This guarantees the notification fires regardless of which code path changes the status.
5. Both the requester and any Head must see live updates on `pengajuan_izin` via Supabase Realtime, without a manual reload: the requester sees their own request's status change live; a Head sees new pending requests and any status changes across the board live (their existing SELECT-all RLS policy covers this — the realtime subscription is simply unfiltered for a Head, scoped to `user_id` for a Member).
6. Members can only see their own leave requests; Heads can see and act on all.

---

## 7. Notifications

- Delivered via Supabase Realtime — live updates, not polling.
- Structured as `category` (`'tugas'` | `'izin'`) + `detail` (`'baru'` | `'dihapus'` for tugas; `'disetujui'` | `'ditolak'` for izin) rather than a single flat type string. Standardized on Indonesian minimal canonical pairs matching actual features: `('tugas', 'baru')`, `('tugas', 'dihapus')`, `('izin', 'disetujui')`, `('izin', 'ditolak')`. See `schema.md` section 2 for the canonical pairs and their `CHECK` constraints.
- Task-assignment (`tugas`/`baru`) and task-unassignment (`tugas`/`dihapus`) notifications are inserted at the application level on task creation / assignee editing respectively, with explicit error checking. Izin status-change notifications (`izin`/`disetujui`, `izin`/`ditolak`) are inserted by a **database trigger** on `pengajuan_izin` (`handle_izin_status_notification`, see `schema.md` section 3), not app code — this ensures the notification fires no matter what changes the status.
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
- Izin status-change notifications are DB-trigger-driven, matching the completion-status trigger pattern, not an app-level insert.
- Notifications use a `category`/`detail` structure instead of a flat type enum, for extensibility.
- Both Head and Member receive live Realtime updates on Pengajuan Izin, not just the requester.
- Cross-assignee completion visibility (content + photos) is gated by overall task completion: blocked entirely while any assignee is still pending, fully open to all assignees once the task is `completed`. Status-only roster (no content) is available anytime via `get_task_completion_status()`.
- Any Head (not just a task's creator) can edit its assignee list, to accommodate leave-driven reassignment; removal of an already-submitted assignee is blocked at RLS. Both removed and newly-added assignees are notified.
- Photo format bug corrected diagnosis: `.jpg` fails to render while `.jpeg` works (extension-whitelist bug, high-confidence fix), while `.heic` fails for a separate, genuine reason (browser codec limitation, not an app bug) — resolved by converting HEIC to JPEG client-side at upload time, not by a display-layer fix. All accepted formats (jpeg via both extensions, png, webp) must render identically in any viewer — no extension whitelist. Photo thumbnails must be clickable to open a fullscreen/lightbox view.
- Export-to-Excel: any Head, from Riwayat Laporan, summary-roster shape (one row per person), preset date ranges with a custom option, tasks anchored on `created_at` and izin anchored on `start_date`, single combined sheet.

## 10. Still open

- Full Riwayat Laporan hierarchy logic beyond the basic own/all toggle — flagged by the project owner as more complex, to be discussed in a follow-up session before this is build-ready.
