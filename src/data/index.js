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

// data.js is loaded as a side-effect <script type="module"> in
// index.html (it runs before src/main.js because it appears
// first in the import chain). By the time any src module
// executes, window.Data etc. are already populated.
export const Data       = window.Data;
export const Academic   = window.Academic;
export const Progression = window.Progression;
export const Timetable  = window.Timetable;
export const Growth     = window.Growth;
export const DB         = window.DB;
