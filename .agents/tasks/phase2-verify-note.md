# Phase 2 Implementation Verification Note

## Summary
All 11 steps of the Alpine.js migration have been implemented (first iteration, no prior review file found).

---

## index.html

### Step 1 — Alpine CDN
- Added `<script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.14.9/dist/cdn.min.js"></script>` in `<head>` after `<link rel="stylesheet" href="styles.css">`.

### Step 3a — Login password toggle
- `<div class="password-wrap">` now has `x-data="{ show: false }"`.
- Password `<input>` has `:type="show ? 'text' : 'password'"` (static `type="password"` removed).
- Toggle button has `@click="show = !show"`.

### Step 3b — Login error
- `#login-error` has `x-data`, `x-show="$store.loginError"`, `x-text="$store.loginError"`.
- Static `hidden` attribute and static text content removed.

### Step 4 — Toast
- `#toast` has `x-data`, `x-show="$store.toast.visible"`, `:class="'toast toast-' + $store.toast.type"`, `x-text="$store.toast.message"`.
- Static `class="toast"` and `hidden` removed; class is now dynamic.
- No `x-transition` added (styles.css uses CSS animation on `.toast`, not a CSS transition, so Alpine's default transition would double-animate).

### Step 5 — Modals (13 modals)
All 13 modal overlays updated: `hidden` attribute removed, `x-data` and `x-show="$store.modals['<id>']"` added.
Modal IDs migrated: `add-user-modal`, `reset-password-modal`, `passport-modal`, `sensitive-confirm-modal`, `place-student-modal`, `choose-subjects-modal`, `add-class-modal`, `class-teacher-modal`, `add-subject-modal`, `add-assignment-modal`, `class-students-modal`, `class-register-modal`, `assign-mentor-modal`.

### Step 6 — People tabs
- `#people-tabs` has `x-data="{ tab: 'staff' }"`.
- Each tab button has `:class="{ active: tab === '<tabname>' }"` and `@click="tab = '<tabname>'"`.
- Static `active` class removed from the Staff button.

### Step 7 — Upload toggle labels
- `#session-setup-form` div has `x-data="{ testOpen: false, examOpen: false }"`.
- `#upload-test-label` has `x-text="testOpen ? 'Open' : 'Closed'"` and `:class="testOpen ? 'open-label' : 'closed-label'"` (static text removed).
- `#upload-exam-label` has matching Alpine directives.

### Step 8 — Subject filters
- `<div class="form-row tight">` (subject filter container) has `x-data="{ level: 'ALL', group: 'ALL' }"`.
- `#as-filter-level` has `x-model="level"`.
- `#as-filter-group` has `x-model="group"`.
- JS `onchange` handlers kept (native change event still fires through x-model).

### Step 9 — Student search
- `<div class="search">` has `x-data="{ query: '' }"`.
- `#admin-student-search` has `x-model="query"`.
- JS `oninput` handler kept (native input event still fires through x-model).

### Step 10 — Attendance selectors
- `<div class="att-daily-bar mt16">` has `x-data="{ week: '1', day: '0' }"`.
- `#ct-day-week` has `x-model="week"`.
- `#ct-day-of-week` has `x-model="day"`.
- JS `onchange` handlers in teacher.js kept (native change event still fires).

### Step 11 — Pathway container
- `#stu-path-body` has `x-data="{ chosen: '' }"`.

---

## src/main.js

### Step 2 — Alpine store init
- Added `document.addEventListener('alpine:init', ...)` block **before** `DOMContentLoaded` listener.
- Initialises `Alpine.store('toast')`, `Alpine.store('modals')`, `Alpine.store('loginError')`.

---

## src/auth.js

### Step 3c — Login imperative code replaced
- Removed `const err = $('login-error')` declaration (dead code).
- Removed password toggle listener (`toggle-pw` click) — handled by Alpine `@click` in HTML.
- All `err.hidden`, `err.textContent` manipulations replaced with `Alpine.store('loginError', message)` / `Alpine.store('loginError', '')`.
- Demo button click clears error via `Alpine.store('loginError', '')`.

---

## src/utils.js

### Step 4 — Toast rewrite
- `toast(msg, type)` now sets `Alpine.store('toast', { visible: true, message: msg, type })` and uses `window._toastTimer` for the hide timeout.
- Function signature `toast(msg, type = 'success')` preserved — all callers unchanged.

---

## src/modals.js

### Step 5b — openModal/closeModal updated
- `openModal(id)`: sets `Alpine.store('modals')[id] = true` when Alpine is available; falls back to `removeAttribute('hidden')`. Also updates `aria-hidden`.
- `closeModal(id)`: sets `Alpine.store('modals')[id] = false` when Alpine is available; falls back to `setAttribute('hidden', '')`. Also updates `aria-hidden`.
- Function signatures unchanged — all callers in views/*.js stay unchanged.

---

## src/views/admin.js

### Step 6 — bindPeopleTabs simplified
- Removed manual `active` class toggling (Alpine's `:class` owns it).
- Now just calls `renderPeopleTab(btn.dataset.tab)` on click.

### Step 7 — renderAdminSetup + updateUploadLabels
- `toggle-test-upload` and `toggle-exam-upload` onclick handlers now also update Alpine component state via `Alpine.$data(setupForm)`.
- `updateUploadLabels(sess)` now also syncs `testOpen`/`examOpen` on the Alpine component (guarded by `window.Alpine` check).

### Step 8 — renderAdminSubjects
- Removed explicit `$('as-filter-level').value = 'ALL'` and `$('as-filter-group').value = 'ALL'` assignments (Alpine `x-data` initialises them).
- JS `onchange` handlers kept.

---

## src/views/student.js

### Step 11 — renderStudentPathway
- Path cards template updated: removed static `selected` class concatenation, added `:class="{ selected: chosen === '...' }"` and `@click="chosen = '...'"` Alpine directives.
- Radio input uses `:checked="chosen === '...'"` instead of static `checked` attribute.
- After setting `box.innerHTML`, calls `Alpine.initTree(box)` to initialise new Alpine directives, then syncs `chosen` via `Alpine.$data(box)`.
- Removed imperative `.path-card` click handler loop.
- Save handler reads `chosen` from Alpine data (with fallback to `:checked` radio for robustness).

---

## Final scan checklist

- [x] No `Alpine.store(...)` calls before `alpine:init` — stores initialised in `alpine:init`, JS calls to `Alpine.store(...)` are in event handlers that fire after page load.
- [x] No modal has `hidden` attribute without `x-show` — all 13 modals have `x-show`, `hidden` removed.
- [x] No conflicting `oninput`/`onchange` handlers — JS handlers in admin.js and teacher.js are kept alongside `x-model` (zero-risk approach; native events still fire).
- [x] Toast function has identical signature `toast(msg, type = 'success')`.
- [x] `openModal`/`closeModal` signatures unchanged.
