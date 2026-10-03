// ============================================================
//  Happy Man Academy — Data namespace re-export
//
//  data.js is the root data layer. It attaches Data, Academic,
//  Progression, Timetable, Growth and DB to window.* for
//  backward-compat with app.js.  In Phase 1 we load data.js as
//  a side-effect module (it already IS ESM via its Supabase
//  import) and then re-expose those same window references as
//  named exports so every src/* module can import them with a
//  stable path.
//
//  When data.js gains proper `export` statements in a later
//  phase, change these lines to:
//    export { Data, Academic, Progression, Timetable, Growth, DB }
//    from '../../data.js';
// ============================================================

// Guard: data.js assigns window.Data synchronously at module
// top-level (confirmed at line ~3601 of data.js). The check
// MUST run before the exports so that a missing window.Data
// produces a clean thrown error instead of silent undefined
// bindings spreading through every importing module.
if (typeof window !== 'undefined' && !window.Data) {
  throw new Error('[HMA] src/data/index.js: window.Data is not set — data.js must assign it synchronously at top level before this module is evaluated.');
}

// data.js is loaded as a side-effect <script type="module"> in
// index.html (it runs before src/main.js because it appears
// first in the import chain). By the time any src module
// executes, window.Data etc. are already populated.
export const Data        = window.Data;
export const Academic    = window.Academic;
export const Progression = window.Progression;
export const Timetable   = window.Timetable;
export const Growth      = window.Growth;
export const DB          = window.DB;
