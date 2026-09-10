# DOOR — Design System

**DOOR** — preserveD dOcumentatiOn progRam. A meeting/documentation tracker built for government-agency-style teams (Head/Ketua and Member/Anggota roles), inspired by but not tied to any specific agency.

This document is visual/design-only. It does not contain business logic, permissions, or data structure — see `schema.md` and `logic.md` for those.

---

## 1. Brand

- **Name**: DOOR (preserveD dOcumentatiOn progRam)
- **Mark**: geometric compass/emblem icon (provided separately as SVG), used icon-only or paired with the "DOOR" wordmark. No agency-specific logo — must read as generic/universal so it fits any organization.
- **Tone**: cold, practical, not overly vibrant. Institutional but not stiff.

---

## 2. Color palette

Blue is the only primary/working color. Red is reserved strictly for destructive/rejected/error states. Orange is a rare accent for "pending" status only. Everything else is neutral grey/black/white. Do not introduce additional hues (no magenta/pink/purple) — this was an explicit correction from an earlier reference design.

### Dark theme (default)

| Token | Hex | Use |
|---|---|---|
| `--bg` | `#0A0E14` | Page background |
| `--surface` | `#12161F` | Cards, panels |
| `--surface-hover` | `#1A202C` | Hover states, input backgrounds, progress bar tracks |
| `--border` | `#232936` | Card borders, dividers, input borders |
| `--text-primary` | `#F5F7FA` | Headings, primary text |
| `--text-secondary` | `#8891A3` | Muted/meta text, labels, placeholders |
| `--accent-blue` | `#3B82F6` | Primary actions, active nav, links, progress fill |
| `--accent-blue-strong` | `#0C447C` | Assignee pill backgrounds, dark blue fills |
| `--accent-blue-soft` | `#B5D4F4` | Text on strong blue fills |
| `--accent-red` | `#EF4444` | Errors, rejected status, destructive actions |
| `--accent-orange` | `#F59E0B` | Pending/warning status only — do not use decoratively |
| `--status-success` | `#22C55E` | Approved/completed status (functional only) |

### Light theme

| Token | Hex |
|---|---|
| `--bg` | `#F7F8FA` |
| `--surface` | `#FFFFFF` |
| `--border` | `#E2E5EA` |
| `--text-primary` | `#111827` |
| `--text-secondary` | `#6B7280` |
| `--accent-blue` | `#2563EB` |
| `--accent-red` | `#DC2626` |
| `--accent-orange` | `#D97706` |
| `--status-success` | `#16A34A` |

### Color usage rules

- Blue carries all primary UI weight: buttons, active nav state, links, chart/progress fills, focus rings.
- Red is exclusively for negative/destructive states — never decorative.
- Orange is exclusively for "pending/in-progress" status — never decorative, never a secondary brand color.
- Status badges: blue = in progress, orange = pending, green = completed/approved, red = rejected.
- Charts and progress indicators use shades of blue only (e.g. `--accent-blue` + `--accent-blue-strong`), not multi-hue rainbow coloring. This replaces the old blue/magenta alternating bar chart pattern from the reference inspiration — see `logic.md` for what the dashboard widgets actually show (status breakdown + activity feed, not a bar chart).

---

## 3. Typography

- **Font**: Inter
- **Weights used**: 400 (regular), 500 (medium/semi-bold equivalent for headings and emphasis)

| Token | Size |
|---|---|
| `text-xs` | 12px |
| `text-sm` | 14px |
| `text-base` | 16px |
| `text-lg` | 18px |
| `text-xl` | 20px |
| `text-2xl` | 24px |
| `text-3xl` | 30px |

Mobile screens generally use one step down from desktop for dense UI (e.g. stat card numbers at 18px instead of 22–24px) to preserve breathing room at narrow widths — see mobile mockups in section 6.

---

## 4. Spacing & layout

- **Base unit**: 4px
- **Scale**: 4 / 8 / 12 / 16 / 24 / 32 / 48px
- **Card padding**: 24px desktop, 14–16px mobile
- **Page gutter**: 32px desktop, 16px mobile

### Border radius

Soft/rounded throughout — this was an explicit choice for a friendlier feel over a sharp/minimal alternative.

| Token | Value | Use |
|---|---|---|
| `radius-sm` | 8px | Inputs, small tags |
| `radius-md` | 10–12px | Buttons, form fields |
| `radius-lg` | 16px | Cards, panels |
| `radius-full` | 999px | Pills, badges, avatar circles |

---

## 5. Components

### Buttons
- **Primary**: solid `--accent-blue` background, `--text-primary` (white) text, `radius-md`, medium weight label.
- **Secondary**: outline/neutral grey border, transparent or `--surface` background.
- **Destructive**: solid `--accent-red` background — used sparingly, e.g. reject actions.
- At most one primary/filled button per screen or form; everything else is secondary/outline.

### Status badges
Pill-shaped (`radius-full`), colored background at low opacity/dark-fill with matching light text stop, per the status color mapping in section 2. Example: pending badge uses a dark amber fill with light amber text.

### Cards
`radius-lg`, 1px `--border`, `--surface` background. No shadow in dark mode; subtle shadow acceptable in light mode. No gradients.

### Form inputs
`--surface-hover` or `--bg` background (input sits slightly recessed from its parent card), 1px `--border`, `radius-sm`/`radius-md`, `--text-secondary` for labels above the field.

### Assignee fields (task creation)
Each assignee is its own field, styled identically to other text inputs (not a pill/tag). An unfilled field shows a dashed border with placeholder text ("Cari nama anggota atau kepala"); tapping it navigates to the dedicated assignee search page (see Assignee search screen), and returns with the selected name filling that field. A filled field shows the person's name with an **X control** on the right to remove that row entirely. Below the last field sits a **"Tambah"** (add) text link/button — tapping it appends a new blank assignee field. This can be repeated with no upper limit; every row is independent, so removing or refilling one row does not affect the others.

### Photo upload grid
4-column grid of square (1:1) tiles on mobile, `radius-sm` corners, `--surface-hover` placeholder fill. An explicit "add" tile with a dashed blue border and plus icon marks the next open slot. A count label ("x of 8 photos") sits below the grid.

### Location picker (map thumbnail)
A short strip/thumbnail of the map (fixed height ~70px) with a pin marker, `--accent-red` for the pin, sitting above a secondary line of text: "Cari alamat atau pilih peta" (search address or pick on map). Tapping the thumbnail opens a fullscreen map view with an **X (close) control top-left** to back out without side effects. Used identically in both task creation (Head sets planned location) and the Completion form (actual meeting location) — same component, two contexts.

### Success popup (modal)
Small centered card (not full-bleed), **light/white background even in dark mode** — an intentional exception so it reads as a distinct, friendly confirmation moment. Blue filled circle with a white checkmark icon at the top, one bold short line ("Laporan terkirim"), one muted line describing the redirect that's about to happen. No buttons — it is timed/auto-dismissing and redirects automatically (see `logic.md` for the destination and timing).

### Bottom navigation (mobile)
Fixed-position bar, `--surface` background, 1px top border, five icon+label items (Dashboard, Tugas, Riwayat, Izin, Profile). Active item shown in `--accent-blue`, inactive in `--text-secondary`. Icons at ~18px, labels at ~9–10px.

### Top navigation (desktop)
Horizontal nav bar with logo/wordmark left, nav links center, notification bell + avatar right. Active link underlined or colored in `--accent-blue`. A collapsible left sidebar mirroring the same nav items is also available (per original reference inspiration) for desktop users who prefer persistent navigation.

### Progress / breakdown bars
Thin (6px) horizontal bars, `--surface-hover` track, `--accent-blue` (or the relevant status color) fill, `radius-full`- ish small radius. Paired with a label + percentage above each bar.

---

## 6. Responsive rules

Layout structure must adapt at breakpoints — visual tokens (color, radius, type scale) stay constant, but component arrangement changes. This is a hard requirement, not a nice-to-have: the desktop layout must not simply be shrunk to fit mobile.

| Breakpoint | Range | Layout behavior |
|---|---|---|
| Mobile | `<640px` | Single column stacking, 2-column max for stat/metric grids, bottom tab bar navigation, fullscreen takeover for map picker and assignee search |
| Tablet | `640–1024px` | 2-column grids where desktop uses more |
| Desktop | `>1024px` | Full multi-column layout, top nav + optional sidebar, up to 4-column stat grids |

Rules of thumb:
- Never render more than 2 columns of cards/stats on mobile.
- Minimum touch target height: ~44px on any tappable control on mobile.
- Panels that sit side-by-side on desktop (e.g. status breakdown + activity feed) stack vertically on mobile, full width each.
- Forms with a map or search step (task creation, task completion, assignee picker) use fullscreen dedicated views on mobile rather than inline widgets, to avoid squeezed/unusable embedded controls.

---

## 7. Theming

Both dark and light mode are supported, user-toggleable (moon/sun icon in nav, per original reference). Dark is the default. All tokens in section 2 must have both variants defined — nothing hardcoded to a single mode.

---

## 8. Icons

Outline-style icon set (consistent stroke weight throughout — no mixed filled/outline icons). Used for nav items, stat card accents, form field affordances (calendar, map pin, search), and status indicators.

---

## 9. Reference mockups produced during design discussion

These are not final pixel specs but establish the intended look and structure:
- Dashboard (desktop): 4-column stat cards, status breakdown panel + recent activity feed panel side by side, top nav.
- Dashboard (mobile): same content, 2-column stat cards, stacked panels, bottom tab bar.
- Task creation form (Head-only): title, date/time, location (map thumbnail), stacked assignee text-fields with X-to-remove and a "Tambah" link to add more.
- Assignee search screen: debounced search (1.5s), letter-grouped results, 10 per group with prev/next pagination and "x of y" indicator.
- Task detail + Completion form: task info card (scheduled time/location, status badge) + completion section (photo grid, actual start/end time, actual location, minutes text field, submit button).
- Completion success popup: white card, blue check circle, auto-redirect messaging.
