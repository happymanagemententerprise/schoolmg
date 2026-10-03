# Phase 2 Implementation Plan — Alpine.js Migration
## Happy Man Academy School Management SPA

> **Verified against source:** All file references, function names, element IDs,
> and imperative patterns below were read from the actual source files.
> Do NOT touch `app.js` (root-level legacy), `data.js`, or any large table
> renders (score tables, timetable, leaderboard, progression decisions).

---

## Project context (read before coding)

| Detail | Value |
|---|---|
| Serve command | `python -m http.server 8000` — no build step |
| Entry point | `index.html` (loads `/data.js` then `/src/main.js` as `type="module"`) |
| Alpine CDN version | **3.14.9** (latest stable as of 2025) |
| Alpine store init timing | `alpine:init` event fires **before** `DOMContentLoaded`; store init block must be placed outside and above the `DOMContentLoaded` listener in `src/main.js` |
| Module cycle note | `openModal`/`closeModal` live in `src/modals.js` (not `router.js`) to break a circular import chain; keep them there |
| `toast()` signature | `toast(msg, type = 'success')` — must stay identical |
| `openModal(id)` / `closeModal(id)` signatures — must stay identical |

---

## Step 1 — Add Alpine.js CDN script tag to `index.html`

**What to do:**
Add a single `<script defer>` tag in `<head>`, pinned to v3.14.9, **before** the closing `</head>` tag. The existing `<script type="module">` tags are in `<body>` (bottom: `/data.js` then `/src/main.js`), so there is no conflict — `defer` on the CDN script means it runs before DOMContentLoaded completes, and Alpine will initialise when it encounters `x-data` on the already-parsed HTML.

**Exact change:**
In `index.html` `<head>`, after the `<link rel="stylesheet" href="styles.css">` line, add:
```html
<script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.14.9/dist/cdn.min.js"></script>
```

**Gotcha:** Do NOT place this script below the `type="module"` tags. Placing it in `<head defer>` is correct; Alpine initialises the DOM once, and the module scripts that later call `Alpine.store(...)` will find the `Alpine` global already on `window`.

**Files:** `index.html`

**Verify:** Open `http://localhost:8000` in a browser after `python -m http.server 8000`. Open the console and run `window.Alpine` — it should return the Alpine object. No existing functionality should break (the app still boots and login works).

---

## Step 2 — Alpine store initialisation block in `src/main.js`

**What to do:**
Add the `alpine:init` listener at the **top** of `src/main.js`, before the `DOMContentLoaded` block. This guarantees stores exist before any component reads them. Steps 3, 4, and 5+ depend on these stores being registered.

**Exact insertion** — insert before the `document.addEventListener('DOMContentLoaded', ...)` line:
```js
document.addEventListener('alpine:init', () => {
  Alpine.store('toast', { visible: false, message: '', type: 'info' });
  Alpine.store('modals', {});
  Alpine.store('loginError', '');
});
```

`Alpine` is a global injected by the CDN script; it is available by the time `alpine:init` fires. There is no import needed.

**Files:** `src/main.js`

**Verify:** In the browser console after page load, run `Alpine.store('toast')` — should return `{ visible: false, message: '', type: 'info' }`. Run `Alpine.store('modals')` — should return `{}`.

---

## Step 3 — Toast notification reactive fragment (`#toast`)

### 3a. `index.html` — bind Alpine directives on `#toast`

The `#toast` element is currently:
```html
<div id="toast" class="toast" aria-live="polite" hidden></div>
```

Replace it with:
```html
<div id="toast"
     class="toast"
     aria-live="polite"
     x-data
     x-show="$store.toast.visible"
     x-transition
     x-text="$store.toast.message"
     :class="'toast toast-' + $store.toast.type">
</div>
```

Remove the `hidden` attribute — Alpine's `x-show` controls visibility via `display:none`.

**Gotcha:** `x-transition` on `x-show` applies Alpine's default fade. If `styles.css` already has a CSS transition on `.toast`, remove the `x-transition` directive to avoid double-animation. Check `styles.css` for `.toast { transition: ... }`.

### 3b. `src/utils.js` — rewrite `toast()` to set the Alpine store

Replace the current `toast()` function (lines that manipulate `el.textContent`, `el.className`, `el.hidden`, `el._t`) with:
```js
export function toast(msg, type = 'success') {
  Alpine.store('toast', { visible: true, message: msg, type });
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => {
    Alpine.store('toast', { visible: false, message: '', type: 'info' });
  }, 3200);
}
```

**Gotcha:** `Alpine` is a browser global — no import needed in `src/utils.js`. The `clearTimeout` guard prevents a second toast from disappearing early if called in quick succession.

**Files:** `index.html`, `src/utils.js`

**Verify:** Log in with any demo account. The "Connecting to database…" splash disappears and the app loads without a JS error. Trigger any action that calls `toast()` (e.g., click Save session settings in Admin → Setup). The toast should appear and fade after ~3s.

---

## Step 4 — Login form reactive fragments (`#login-screen`)

### 4a. Password toggle — `index.html`

The current markup around the password input is:
```html
<div class="password-wrap">
  <input id="login-password" type="password" placeholder="Enter password" autocomplete="current-password">
  <button type="button" id="toggle-pw" class="toggle-pw" aria-label="Show password">👁</button>
</div>
```

Replace with:
```html
<div class="password-wrap" x-data="{ show: false }">
  <input id="login-password"
         :type="show ? 'text' : 'password'"
         placeholder="Enter password"
         autocomplete="current-password">
  <button type="button" id="toggle-pw" class="toggle-pw" aria-label="Show password"
          @click="show = !show">👁</button>
</div>
```

### 4b. Error display — `index.html`

The current `#login-error` element is:
```html
<p id="login-error" class="login-error" hidden>Incorrect email or password. Try a demo account below.</p>
```

Replace with:
```html
<p id="login-error"
   class="login-error"
   x-data
   x-show="$store.loginError"
   x-text="$store.loginError">
</p>
```

Remove the `hidden` attribute and the static text content — Alpine controls both.

### 4c. `src/auth.js` — remove imperative toggle and error show/hide

In `initLogin()`:

1. **Remove** the password toggle listener:
   ```js
   // DELETE THIS BLOCK:
   $('toggle-pw').addEventListener('click', () => {
     pwI.type = pwI.type === 'password' ? 'text' : 'password';
   });
   ```
   Alpine's `@click="show = !show"` on the button handles this now.

2. **Replace** all `err.hidden = false` / `err.hidden = true` / `err.textContent = '...'` patterns with `Alpine.store('loginError', message)` / `Alpine.store('loginError', '')`.

   Current lines to change in `initLogin()`:
   - Demo button click: `err.hidden = true;` → `Alpine.store('loginError', '');`
   - Form submit success: `err.hidden = true;` → `Alpine.store('loginError', '');`
   - All error paths currently setting `err.textContent = '...'` followed by `err.hidden = false` → replace both lines with `Alpine.store('loginError', '<the message string>');`

   There are **5 error paths** in `initLogin()` — the "no account" branch, the "password wrong" branch, the "archived account" branch, the general fallback, and the success clear.

   Also in `login()` function (same file): `err.hidden = true` after login success does not exist (login() calls `$('login-screen').hidden = true` to hide the whole screen), so no change needed there.

**Gotcha:** `initLogin()` currently declares `const err = $('login-error')` at the top. Remove or comment out that declaration once all usages are removed — it becomes dead code.

**Files:** `index.html`, `src/auth.js`

**Verify:** Load the login page. Enter wrong credentials → error message appears. Enter correct credentials → error disappears, app loads. Click the eye icon → password toggles between text/password. All demo-account quick-fill buttons clear the error.

---

## Step 5 — Modals (`modal-overlay` elements in `index.html`)

### 5a. `index.html` — add `x-show` + remove `hidden` on every modal overlay

There are **11 modal overlays** in `index.html`. Each currently looks like:
```html
<div class="modal-overlay" id="add-user-modal" aria-hidden="true" hidden>
```

For every `modal-overlay` div, add `x-data x-show="$store.modals['<id>']"` and remove the `hidden` attribute.

The 11 modal IDs are:
1. `add-user-modal`
2. `reset-password-modal`
3. `passport-modal`
4. `sensitive-confirm-modal`
5. `place-student-modal`
6. `choose-subjects-modal`
7. `add-class-modal`
8. `class-teacher-modal`
9. `add-subject-modal`
10. `add-assignment-modal`
11. `class-students-modal`
12. `class-register-modal`
13. `assign-mentor-modal`

(Count modals in your reading — verify the final list by grepping `modal-overlay` in `index.html`.)

Pattern for each:
```html
<!-- before -->
<div class="modal-overlay" id="add-user-modal" aria-hidden="true" hidden>

<!-- after -->
<div class="modal-overlay" id="add-user-modal" aria-hidden="true"
     x-data x-show="$store.modals['add-user-modal']">
```

**Gotcha — `aria-hidden`:** The existing JS in `openModal`/`closeModal` still sets `aria-hidden` imperatively (see Step 5b below), so leave the static `aria-hidden="true"` as the default value; JS will update it.

**Gotcha — CSS `display`:** `x-show` sets `display:none` inline. If `styles.css` uses `[hidden]` to hide modals rather than a class, both mechanisms are now active while transitioning. Safest: keep `x-show` only and remove `hidden` attribute. Verify `styles.css` does not have a `.modal-overlay { display: none }` rule that would hide modals permanently (it should not — they were hidden via `hidden` attribute).

### 5b. `src/modals.js` — update `openModal`/`closeModal` to set Alpine store

Replace the current implementations:
```js
// current
export function openModal(id)  { const m = $(id); if (m) { m.hidden = false; m.setAttribute('aria-hidden', 'false'); } }
export function closeModal(id) { const m = $(id); if (m) { m.hidden = true;  m.setAttribute('aria-hidden', 'true');  } }

// new
export function openModal(id) {
  Alpine.store('modals')[id] = true;
  const m = $(id); if (m) m.setAttribute('aria-hidden', 'false');
}
export function closeModal(id) {
  Alpine.store('modals')[id] = false;
  const m = $(id); if (m) m.setAttribute('aria-hidden', 'true');
}
```

**Gotcha — Alpine store reactivity on object mutation:** Alpine tracks store object mutations; assigning `Alpine.store('modals')[id] = true` on a plain object is reactive because Alpine 3 uses `Proxy`. This is fine.

**Gotcha — close buttons:** `wireGlobals()` in `router.js` already wires `.close-modal` buttons and `[data-modal]` buttons to call `closeModal(id)` via the `data-modal` attribute. Those bindings remain unchanged — they call `closeModal` which now updates the store.

**Files:** `index.html`, `src/modals.js`

**Verify:** Open Admin → People → "+ Add person". Modal should appear. Press Cancel or × — modal should close. Check the browser console for no errors. Repeat with the Reset Password modal.

---

## Step 6 — Admin People tabs (`#people-tabs`)

**What to do:**
Replace imperative `bindPeopleTabs()` active-class toggling with Alpine `x-data` on `#people-tabs`. Keep `renderPeopleTab(tab)` calls on click — only the CSS active-class switching moves to Alpine.

### 6a. `index.html` — bind `x-data`, `@click`, and `:class` on `#people-tabs`

Current HTML:
```html
<div class="tab-bar" id="people-tabs">
  <button class="tab-btn active" data-tab="staff">Staff</button>
  <button class="tab-btn" data-tab="students-all">Students</button>
  <button class="tab-btn" data-tab="parents">Parents</button>
</div>
```

Replace with:
```html
<div class="tab-bar" id="people-tabs" x-data="{ tab: 'staff' }">
  <button class="tab-btn" data-tab="staff"
          :class="{ active: tab === 'staff' }"
          @click="tab = 'staff'">Staff</button>
  <button class="tab-btn" data-tab="students-all"
          :class="{ active: tab === 'students-all' }"
          @click="tab = 'students-all'">Students</button>
  <button class="tab-btn" data-tab="parents"
          :class="{ active: tab === 'parents' }"
          @click="tab = 'parents'">Parents</button>
</div>
```

Remove the static `class="tab-btn active"` from the Staff button — `:class` handles it.

### 6b. `src/views/admin.js` — simplify `bindPeopleTabs()`

The current `bindPeopleTabs()` in `renderAdminPeople()`:
```js
export function bindPeopleTabs() {
  $all('#people-tabs .tab-btn').forEach(btn => btn.onclick = () => {
    $all('#people-tabs .tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderPeopleTab(btn.dataset.tab);
  });
}
```

Replace with — keep the `renderPeopleTab` call but remove the manual active-class toggling (Alpine owns that now):
```js
export function bindPeopleTabs() {
  $all('#people-tabs .tab-btn').forEach(btn => btn.addEventListener('click', () => {
    renderPeopleTab(btn.dataset.tab);
  }));
}
```

**Gotcha:** `renderPeopleTab` is called elsewhere with `$q('#people-tabs .tab-btn.active')?.dataset.tab` to know which tab is active. After this change, Alpine's `tab` variable owns truth. The safest fix: keep `data-tab` on each button and read the clicked button's `dataset.tab` directly (already done by the `.forEach` above). Calls to `renderPeopleTab($q('#people-tabs .tab-btn.active')?.dataset.tab || 'staff')` scattered in `admin.js` will still work because `:class="{ active: tab === '...' }"` keeps the `active` class present on the right button.

**Files:** `index.html`, `src/views/admin.js`

**Verify:** Navigate to Admin → People. Click "Students" tab → table updates. Click "Parents" → table updates. Active class highlights correctly on each tab. No JS errors.

---

## Step 7 — Upload toggle pills (`#view-admin-setup`)

**What to do:**
Bind `x-data` to the session setup form area to reflect open/closed state. The toggle buttons already call JS (`toggle-test-upload`, `toggle-exam-upload`) that mutates `Data.session().uploadOpen` and calls `updateUploadLabels()`. We replace `updateUploadLabels()` with Alpine `x-text` and `:class` on the label spans.

### 7a. `index.html` — add `x-data` and `x-text`/`:class` on toggle rows

The existing HTML in `#view-admin-setup`:
```html
<div class="form-group">
  <label>Upload: CA (40) scores</label>
  <div class="toggle-row">
    <span id="upload-test-label">Closed</span>
    <button class="toggle-btn" id="toggle-test-upload" data-type="test">Toggle</button>
  </div>
</div>
<div class="form-group">
  <label>Upload: Exam (60) scores</label>
  <div class="toggle-row">
    <span id="upload-exam-label">Open</span>
    <button class="toggle-btn" id="toggle-exam-upload" data-type="exam">Toggle</button>
  </div>
</div>
```

We need a shared reactive state. Wrap both `form-group` blocks with an `x-data` container, or — simpler — add `x-data` on the parent `<article class="panel">` that contains the session setup form (`id="session-setup-form"` parent `<article>`). The session setup article is:

```html
<article class="panel">
  <div class="panel-heading">...</div>
  <div class="setup-form" id="session-setup-form">
    ...toggle rows...
  </div>
</article>
```

Add `x-data="{ testOpen: false, examOpen: false }"` on the `<article>` element (the closest containing panel). Then:

```html
<!-- CA toggle row -->
<span id="upload-test-label"
      x-text="testOpen ? 'Open' : 'Closed'"
      :class="testOpen ? 'open-label' : 'closed-label'"></span>
<button class="toggle-btn" id="toggle-test-upload" data-type="test">Toggle</button>

<!-- Exam toggle row -->
<span id="upload-exam-label"
      x-text="examOpen ? 'Open' : 'Closed'"
      :class="examOpen ? 'open-label' : 'closed-label'"></span>
<button class="toggle-btn" id="toggle-exam-upload" data-type="exam">Toggle</button>
```

Remove the static text `Closed` / `Open` from the spans — `x-text` handles it.

### 7b. `src/views/admin.js` — update `renderAdminSetup()` and `updateUploadLabels()`

In `renderAdminSetup()`, after reading `sess`:
1. Set the Alpine component state by locating the component root and using `Alpine.$data()`:
   ```js
   // After updateUploadLabels(sess) line, add:
   const setupArticle = $q('#session-setup-form')?.closest('article');
   if (setupArticle && window.Alpine) {
     const data = Alpine.$data(setupArticle);
     data.testOpen = !!sess.uploadOpen.test;
     data.examOpen = !!sess.uploadOpen.exam;
   }
   ```
2. In `$('toggle-test-upload').onclick` and `$('toggle-exam-upload').onclick` handlers, after `Data.saveSession(s)`:
   - Also update Alpine state:
     ```js
     $('toggle-test-upload').onclick = () => {
       const s = Data.session();
       s.uploadOpen.test = !s.uploadOpen.test;
       Data.saveSession(s);
       updateUploadLabels(s);  // kept for safety during transition
       const data = Alpine.$data($q('#session-setup-form')?.closest('article'));
       if (data) data.testOpen = s.uploadOpen.test;
     };
     ```
   - Same pattern for `toggle-exam-upload` / `examOpen`.

3. `updateUploadLabels()` can be kept as a fallback safety net — it is a no-op when Alpine's `x-text` already reflects the right value. Remove it entirely in a later cleanup pass only after testing.

**Gotcha:** `Alpine.$data(element)` requires the element to be an Alpine component root (the element with `x-data`). Use the `<article>` that carries `x-data`.

**Files:** `index.html`, `src/views/admin.js`

**Verify:** Navigate to Admin → Setup. Both labels reflect the current state from `Data.session().uploadOpen`. Click "Toggle" on CA — label switches between "Open" and "Closed" with the correct CSS class. Reload page — state persists (it comes from `Data.session()` not Alpine, so it is read fresh on `renderAdminSetup()` each time).

---

## Step 8 — Subject level/group filters (`#view-admin-subjects`)

**What to do:**
Wrap the filter area with `x-data`, bind `x-model` on the two `<select>` elements, and call `draw()` on change via `@change`. Remove the `onchange` assignments in JS.

### 8a. `index.html` — add `x-data` + `x-model` on filter row

The existing filter panel heading HTML:
```html
<div class="form-row tight">
  <select id="as-filter-level" class="select-inline" aria-label="Filter by level">
    <option value="ALL">All levels</option>...
  </select>
  <select id="as-filter-group" class="select-inline" aria-label="Filter by track">
    <option value="ALL">All tracks</option>...
  </select>
  <span class="read-only-badge" id="as-count">&mdash;</span>
</div>
```

Wrap the `<div class="form-row tight">` with an `x-data` scope — or add `x-data` directly on it:
```html
<div class="form-row tight" x-data="{ level: 'ALL', group: 'ALL' }">
  <select id="as-filter-level" class="select-inline" aria-label="Filter by level"
          x-model="level"
          @change="$dispatch('subjects-filter-change')">
    ...
  </select>
  <select id="as-filter-group" class="select-inline" aria-label="Filter by track"
          x-model="group"
          @change="$dispatch('subjects-filter-change')">
    ...
  </select>
  <span class="read-only-badge" id="as-count">&mdash;</span>
</div>
```

**Alternative (simpler, no custom event):** just use `@change="document.dispatchEvent(new Event('subjects-filter-change'))"`, but the cleanest approach that avoids an extra event is to just leave the JS `onchange` handler and let Alpine `x-model` keep the select values in sync while the JS `onchange` still fires natively. Since `x-model` does not prevent the native `change` event from firing, you can keep the existing JS `onchange` assignments and Alpine `x-model` simply becomes a redundant reactive binding for future use. This is the zero-risk approach.

**Recommended approach (zero-risk):** Add `x-data="{ level: 'ALL', group: 'ALL' }"` on the `<div class="form-row tight">`, add `x-model="level"` and `x-model="group"` to the selects, but **keep** the existing `$('as-filter-level').onchange = draw;` and `$('as-filter-group').onchange = draw;` in `renderAdminSubjects()`. Both mechanisms fire on change; the JS handler still redraws the table.

### 8b. `src/views/admin.js` — remove explicit `value = 'ALL'` initialisation

In `renderAdminSubjects()`, remove:
```js
$('as-filter-level').value = 'ALL';
$('as-filter-group').value = 'ALL';
```
Alpine's `x-data="{ level: 'ALL', group: 'ALL' }"` + `x-model` initialises them to `ALL` on component mount. The `onchange` assignments can be kept.

**Gotcha:** `renderAdminSubjects()` is called fresh on every nav to the Subjects view — Alpine re-initialises the component each time the page is shown (because the element is always in the DOM but `hidden` was controlled by `showView()`). The `x-data` scope persists as long as the element stays in the DOM, which it does. So the component state (`level`, `group`) would retain last values between navigation away and back. This matches the existing behaviour (the `onchange` handler reads the select's `.value` directly, Alpine just mirrors it).

**Files:** `index.html`, `src/views/admin.js`

**Verify:** Navigate to Admin → Subjects. Both selects default to "All". Change Level to "Junior (JSS)" — table filters. Change back — all subjects show.

---

## Step 9 — Student search input (`#admin-student-search`)

**What to do:**
The `#admin-student-search` input is inside the Admin Overview view. Currently:

```js
// In renderAdminOverview():
$('admin-student-search').oninput = e => renderAdminStudentTable(e.target.value);
```

Wrap the search input's container (`<div class="search">`) with `x-data`, bind `x-model` and `@input`.

### 9a. `index.html` — add `x-data` + `x-model` on search wrapper

Existing HTML:
```html
<div class="search">
  <span>⌕</span>
  <input id="admin-student-search" type="search" placeholder="Search student" aria-label="Search student">
</div>
```

Replace with:
```html
<div class="search" x-data="{ query: '' }">
  <span>⌕</span>
  <input id="admin-student-search" type="search" placeholder="Search student" aria-label="Search student"
         x-model="query"
         @input="$dispatch('admin-student-search-input', { query })">
</div>
```

Or — zero-risk approach — just add `x-model="query"` and keep the existing `oninput` handler in JS (the native `input` event still fires through `x-model`):
```html
<div class="search" x-data="{ query: '' }">
  <span>⌕</span>
  <input id="admin-student-search" type="search" placeholder="Search student" aria-label="Search student"
         x-model="query">
</div>
```

### 9b. `src/views/admin.js` — keep `oninput` handler (or remove it if using dispatch)

With the zero-risk `x-model` only approach, the existing handler:
```js
$('admin-student-search').oninput = e => renderAdminStudentTable(e.target.value);
```
can remain unchanged — the native `input` event still fires and `e.target.value` still gives the current string.

**Files:** `index.html`, `src/views/admin.js`

**Verify:** Navigate to Admin → Overview. Type a student name in the search box — the student table filters in real time. Clear the box — all students return.

---

## Step 10 — Attendance day/week selectors (`#view-class-attendance`)

**What to do:**
Bind `x-data`, `x-model` on the week and day selects. The JS `drawDay()` function reads `$('ct-day-week').value` and `$('ct-day-of-week').value` directly, so the simplest migration is `x-model` that keeps Alpine state in sync with the selects, while keeping the existing `onchange` assignments.

### 10a. `index.html` — add `x-data` + `x-model` on attendance daily bar

Existing HTML:
```html
<div class="att-daily-bar mt16">
  <label>Week
    <select id="ct-day-week">
      <option value="1">Week 1</option>...<option value="4">Week 4</option>
    </select>
  </label>
  <label>Day
    <select id="ct-day-of-week">
      <option value="0">Monday</option>...<option value="4">Friday</option>
    </select>
  </label>
  ...
</div>
```

Replace with:
```html
<div class="att-daily-bar mt16" x-data="{ week: '1', day: '0' }">
  <label>Week
    <select id="ct-day-week" x-model="week">
      <option value="1">Week 1</option><option value="2">Week 2</option>
      <option value="3">Week 3</option><option value="4">Week 4</option>
    </select>
  </label>
  <label>Day
    <select id="ct-day-of-week" x-model="day">
      <option value="0">Monday</option><option value="1">Tuesday</option>
      <option value="2">Wednesday</option><option value="3">Thursday</option>
      <option value="4">Friday</option>
    </select>
  </label>
  ...
</div>
```

### 10b. `src/views/teacher.js` — keep existing `onchange` handlers

In `renderClassAttendance()`, the existing assignments:
```js
$('ct-day-week').onchange    = drawDay;
$('ct-day-of-week').onchange = drawDay;
$('ct-day-week').value       = 1;
$('ct-day-of-week').value    = 0;
```
can remain as-is. The native `change` event fires through `x-model`, and the JS handler reads `.value` directly from the DOM element. The Alpine `x-data` local state (`week`/`day`) stays in sync for any future Alpine-driven template use, but the JS side is unchanged.

**Gotcha:** `renderClassAttendance()` is called on every nav to the attendance view. It sets `$('ct-day-week').value = 1` and `$('ct-day-of-week').value = 0` imperatively. Since `x-model` is a two-way binding, writing to `.value` in JS does NOT automatically update Alpine's `week`/`day` variables (Alpine only syncs on DOM events). For correctness, after the imperative `.value` assignments call `drawDay()` which is fine — the JS reads `.value` directly anyway. If you later want Alpine to reflect the reset, add a custom event dispatch or use `Alpine.$data` to update state, but this is not required for Phase 2.

**Files:** `index.html`, `src/views/teacher.js`

**Verify:** Log in as a Class Teacher. Navigate to Attendance. Change the Week selector — the daily register updates. Change the Day selector — the register updates. Save Day button still works.

---

## Step 11 — Path card selection (`#view-student-pathway`)

**What to do:**
The pathway view's HTML is **dynamically generated** by `renderStudentPathway()` in `src/views/student.js` — the entire `box.innerHTML` is set imperatively. The `.path-card` selection logic is also imperative:

```js
$all('.path-card').forEach(card => card.onclick = () => {
  $all('.path-card').forEach(x => x.classList.toggle('selected', x === card));
  const radio = card.querySelector('input[type=radio]');
  if (radio) radio.checked = true;
});
```

Since the HTML is regenerated on each render, the best approach is to add `x-data` on the outer container `#stu-path-body` (the static div) and generate Alpine-compatible markup from within `renderStudentPathway()`.

### 11a. `index.html` — add `x-data` on `#stu-path-body`

```html
<!-- before -->
<div id="stu-path-body" class="mt16"></div>

<!-- after -->
<div id="stu-path-body" class="mt16" x-data="{ chosen: '' }"></div>
```

### 11b. `src/views/student.js` — update generated path card HTML and remove imperative click handler

In `renderStudentPathway()`, in the `box.innerHTML = ...` template string, the path cards are:
```js
options.map(o => `
  <label class="path-card${o.stream === chosen ? ' selected' : ''}" data-stream="${o.stream}">
    <input type="radio" name="stu-path" value="${o.stream}" ${o.stream === chosen ? 'checked' : ''}>
    <strong>${esc(o.name)}</strong>
    <span class="muted-cell">${esc(hints[o.stream] || '')}</span>
  </label>`).join('')
```

Replace with Alpine-bound version:
```js
options.map(o => `
  <label class="path-card" data-stream="${o.stream}"
         :class="{ selected: chosen === '${o.stream}' }"
         @click="chosen = '${o.stream}'">
    <input type="radio" name="stu-path" value="${o.stream}" :checked="chosen === '${o.stream}'">
    <strong>${esc(o.name)}</strong>
    <span class="muted-cell">${esc(hints[o.stream] || '')}</span>
  </label>`).join('')
```

Also set `chosen` to the pre-existing selection on render by injecting into the component's Alpine data after setting `innerHTML`:
```js
box.innerHTML = `...`; // the full template as before

// Sync Alpine state to existing selection
const data = Alpine.$data(box);
if (data) data.chosen = chosen; // `chosen` is already computed above as req?.stream || ''
```

**Remove** the imperative click block:
```js
// DELETE:
$all('.path-card').forEach(card => card.onclick = () => {
  $all('.path-card').forEach(x => x.classList.toggle('selected', x === card));
  const radio = card.querySelector('input[type=radio]'); if (radio) radio.checked = true;
});
```

**Update** the save handler to read from Alpine state instead of `:checked` radio:
```js
$('stu-path-save').onclick = async () => {
  const data = Alpine.$data(box);
  const picked = data?.chosen;
  const msg = $('stu-path-msg');
  if (!picked) { _message(msg, 'Choose a path first.', 'error'); return; }
  await Progression.requestPathway(s.id, picked, $('stu-path-note').value.trim(), currentUser.id);
  _message(msg, 'Your choice is saved — the school will confirm it.', 'success');
  renderStudentPathway();
};
```

**Gotcha — Alpine initialisation on innerHTML set:** When you set `box.innerHTML`, Alpine does not automatically initialise new `x-bind` / `:class` / `@click` directives in the injected HTML. You must call `Alpine.initTree(box)` after setting `innerHTML` to make Alpine process the new nodes. Add:
```js
box.innerHTML = `...`;
Alpine.initTree(box);
const data = Alpine.$data(box);
if (data) data.chosen = chosen;
```

**Files:** `index.html`, `src/views/student.js`

**Verify:** Log in as the demo Student (`ama.osei@happyman.edu`). Navigate to "Choose my path" (if the pathway menu item appears — it depends on the student's class having `selectionMode === 'pool'` or being at the Grade 9 checkpoint). Click a stream card — it gets the `selected` class. Click another — selection moves. The Save button records the choice.

---

## Ordering and dependencies

| # | Step | Depends on |
|---|---|---|
| 1 | Add Alpine CDN script | — |
| 2 | Alpine store init block in main.js | Step 1 |
| 3 | Toast reactive fragment | Step 2 |
| 4 | Login form reactive fragments | Step 2 |
| 5 | Modals | Step 2 |
| 6 | People tabs | Step 1 (local x-data, no store) |
| 7 | Upload toggle pills | Step 1 (local x-data, no store) |
| 8 | Subject filters | Step 1 (local x-data, no store) |
| 9 | Student search | Step 1 (local x-data, no store) |
| 10 | Attendance selectors | Step 1 (local x-data, no store) |
| 11 | Path card selection | Step 1 (local x-data on dynamic HTML) |

Steps 6–11 each use local `x-data` and do not require Alpine stores. They can be done in any order after Step 1, but Steps 3–5 should be done after Step 2.

---

## Global gotchas summary

1. **`defer` on Alpine CDN + `type="module"` scripts:** `defer` scripts run in document order — Alpine (in `<head>`) runs first, then `/data.js`, then `/src/main.js`. `alpine:init` fires during Alpine's boot, which happens before `DOMContentLoaded`. The `DOMContentLoaded` block in `main.js` correctly comes after the `alpine:init` block.

2. **`Alpine.$data()` on dynamic HTML:** Only works on elements that are Alpine component roots. After injecting `innerHTML` call `Alpine.initTree(parentEl)` to process new directives. Only needed in Step 11.

3. **`x-show` vs `hidden` attribute:** Both set `display:none`, but `x-show` uses inline style and `hidden` uses the HTML attribute. Do not use both simultaneously on the same element — remove `hidden` when adding `x-show`.

4. **`Alpine.store` mutations on plain objects:** `Alpine.store('modals')[id] = true` is reactive because Alpine 3 wraps stores in a Proxy. No need to call `Alpine.store('modals', { ...Alpine.store('modals'), [id]: true })`.

5. **No build step / no npm:** Every reference to `Alpine` is a browser global. No imports. No bundler.

6. **`app.js` is untouched:** `app.js` is the root-level legacy script. It also has `renderAdminOverview`, `renderClassAttendance`, etc. duplicated. Do not edit it. The `src/` modules take precedence because `src/main.js` is the entry point loaded by `index.html`.
