# Phase 1 Review Findings — Fix Verification

Date: 2025-07-29
Status: All 4 findings addressed

---

## Files Modified

| File | Change |
|---|---|
| `src/views/shared.js` | Added Growth import; added ATT_DAYS const; added 9 functions moved from admin.js and student.js: `renderEventsList`, `termNameOf`, `resultsLockedNote`, `xpBar`, `renderStudentGrowth`, `renderParentGuardian`, `recordParentLoginIfNew`, `renderPassport`, `dayChipsHTML`, `attendanceGridHTML`, `assignmentRowsHTML` |
| `src/views/admin.js` | Removed 7 exported functions (now in shared.js); updated import from `./shared.js` to include the moved names; added `initAdminModals()` aggregator; `bindPassportActions` kept in admin.js |
| `src/views/student.js` | Removed static imports from `./admin.js`; removed `ATT_DAYS` const; removed `dayChipsHTML`, `attendanceGridHTML`, `assignmentRowsHTML` function bodies; added all moved names to `./shared.js` import |
| `src/views/parent.js` | Removed static imports from `./admin.js` and `./student.js`; added all moved names to `./shared.js` import |
| `src/data/index.js` | Added guard that throws a clear error if `window.Data` is not set at evaluation time |
| `src/main.js` | Changed three individual `bind*` imports to single `initAdminModals` import from admin.js |
| `index.html` | Removed the ambiguous "app.js retained as backup at root" HTML comment |

---

## Finding #1 (HIGH) — Static import cycles fixed

Moved 9 functions from admin.js/student.js to shared.js:
- From `admin.js`: `renderEventsList`, `termNameOf`, `resultsLockedNote`, `xpBar`, `renderStudentGrowth`, `renderParentGuardian`, `recordParentLoginIfNew`, `renderPassport`
- From `student.js`: `dayChipsHTML`, `attendanceGridHTML`, `assignmentRowsHTML`

The import graph is now:
```
router.js
  → admin.js    (no back-edges to student/parent)
  → student.js  (no imports from admin.js or parent.js)
  → parent.js   (no imports from admin.js or student.js)
  → teacher.js
All views → shared.js (no circular back-edges)
```

## Finding #2 (MEDIUM) — data.js window timing guard added

Confirmed: data.js assigns `window.Data` synchronously at top level (line ~3601, outside any callback). Added guard in `src/data/index.js` that throws an explicit error if `window.Data` is undefined at module evaluation time.

## Finding #3 (MEDIUM) — index.html comment removed

Removed the "app.js retained as backup at root" comment from index.html. app.js still exists at the root as a fallback but is NOT loaded by index.html (no script tag references it).

Verified exactly one `<script type="module" src="/data.js">` and one `<script type="module" src="/src/main.js">` in index.html.

## Finding #4 (LOW) — initAdminModals() aggregator added

Added `export function initAdminModals()` to admin.js that calls `bindResetPasswordModal()`, `bindProgressionModals()`, and `bindPassportActions()`. main.js now imports and calls `initAdminModals()` instead of the three functions individually.

---

## Node import check result

```
Resolution OK. Expected browser error: window is not defined
```

Module resolution passes — all `import` paths resolve to existing files. The `window is not defined` error is expected since this is a browser-only app being validated by Node.

No `ERR_MODULE_NOT_FOUND` or `Cannot find module` errors.
