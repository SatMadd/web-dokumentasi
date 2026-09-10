# DOOR — Agent Build Instructions

This file is the entry point for any AI coding agent (AntiGravity IDE, Gemini models) working on this project. Read this first, then read the three referenced documents in full before writing any code.

## 1. Source of truth documents

Always consult these, in this order, before implementing anything:

1. **`schema.md`** — database structure: tables, columns, relationships, RLS policies, storage buckets. This is authoritative for anything touching Supabase.
2. **`logic.md`** — business rules, permissions, and step-by-step user flows. This is authoritative for "what happens when."
3. **`design.md`** — visual system: colors, typography, spacing, component specs, responsive rules. This is authoritative for "what it looks like."

Do not invent data structures, permissions, or UI patterns not covered by these documents. If a task requires a decision not covered by any of the three docs, stop and flag it rather than guessing — do not silently assume a default.

**Known gap**: the full Riwayat Laporan hierarchy logic beyond the basic own/all toggle is not yet finalized (see `logic.md` section 10 / `schema.md` section 6). Do not build deep Riwayat Laporan permission logic until this is resolved — implement only the basic own-vs-all scoping described in `logic.md` section 5 for now.

---

## 2. Project summary

**DOOR** (preserveD dOcumentatiOn progRam) is a meeting/task documentation web app for organizations with two roles: **Head** (Kepala) and **Member** (Anggota). Heads create and assign tasks; assignees (Member or Head) complete them by submitting photo documentation, meeting minutes, actual time, and actual location. The product is inspired by a government-agency internal tool but must remain agency-agnostic — no agency-specific branding, logos, or names anywhere in the codebase, copy, or assets.

Core pages: Dashboard, Tugas, Riwayat Laporan, Pengajuan Izin, Notifikasi, Profile.

---

## 3. Tech stack

- **Framework**: Next.js (App Router)
- **Database/Auth/Storage/Realtime**: Supabase
- **Deployment**: Vercel
- **Styling**: Tailwind CSS, using the design tokens defined in `design.md` (do not hardcode colors outside the token set)
- **Maps/geocoding**: Leaflet (`react-leaflet`) with OpenStreetMap tiles, geocoding via Nominatim. No Google Maps, no paid mapping service — must remain free and require no API key.

---

## 4. Non-negotiable rules

These override convenience or agent judgment in all cases:

1. **Role enforcement is two-layered, always**: every permission described in `logic.md`/`schema.md` must be enforced both in the UI (hide/disable controls the role shouldn't access) and in Supabase RLS policies (the actual security boundary). Never ship a feature where the only protection is a hidden button.
2. **Task creation is Head-only.** Members must never see a create/edit task control anywhere in the UI, and the `tasks` table INSERT policy must reject non-Head roles regardless of what the client sends.
3. **Completions are immutable.** No edit or resubmit UI, no UPDATE policy on `task_completions`, for any role, ever.
4. **No agency-specific branding.** Use "DOOR" and the provided compass emblem only. Do not reference KOMINFO/KOMDIGI or any specific agency in UI copy, filenames, or metadata.
5. **Design tokens are fixed.** Use only the colors, radii, and type scale defined in `design.md`. Do not introduce new hues (e.g. no magenta/purple/pink) even for "just this one chart" — blue/red/orange/neutrals only, per their defined roles (primary/destructive/pending-only).
6. **Mobile is not an afterthought.** Every screen must be built responsively per `design.md` section 6 from the start — do not build a desktop layout first and "make it responsive later." Bottom tab bar on mobile, top nav/sidebar on desktop; fullscreen takeovers for map picker and assignee search on mobile.
7. **Photo/location behavior**: 8 photos max per completion, 10MB max per file, enforced client-side before upload. Location is always manual (search or map-tap) — never auto-GPS-only. Use the shared map-thumbnail-to-fullscreen-picker component consistently in both task creation and completion contexts.
8. **Assignee search debounce**: 1.5 seconds after the user stops typing, blank screen until first keystroke, loading indicator during the debounce/fetch window, results grouped by first-letter with 10-per-group pagination (own Prev/Next + "x of y" per letter group) — implement exactly as specified in `logic.md` section 4, not a simplified version.
9. **Success popup**: after completion submission, show the light/white popup card (blue check circle) as specified in `design.md`, then auto-redirect to Riwayat Laporan. No intermediate confirmation dialogs.
10. **Creator attribution**: anywhere a Head can see a task they didn't create, the creator's name must be visibly displayed (e.g. "Dibuat oleh [name]").

---

## 5. Build order (suggested)

1. Supabase project setup: tables, RLS policies, storage buckets per `schema.md`.
2. Auth + role assignment (`profiles` creation on signup).
3. Design system implementation: Tailwind config with tokens from `design.md`, base components (buttons, cards, badges, inputs, nav shells for both breakpoint tiers).
4. Dashboard (desktop + mobile) — stat cards, status breakdown widget, recent activity feed.
5. Tugas: list view (with Head's Tugas/Penugasan toggle), task detail, task creation form (Head-only), assignee search page.
6. Completion form + success popup + Riwayat Laporan basic list (own/all toggle for Heads).
7. Pengajuan Izin: submission form + Head approval view.
8. Notifikasi: real-time feed, mark-as-read.
9. Profile page.

---

## 6. What to do when instructions are unclear

If a requested change conflicts with `schema.md`, `logic.md`, or `design.md`, or isn't covered by any of them: implement nothing, and report the ambiguity back rather than guessing a resolution. Do not silently override a non-negotiable rule in section 4 even if a specific task-level prompt seems to imply it — flag the conflict instead.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
