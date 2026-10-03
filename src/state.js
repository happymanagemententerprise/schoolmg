// ============================================================
//  Happy Man Academy — Shared mutable state
//  All globals that are read or written across modules live here.
// ============================================================

let _currentUser = null;
export const getCurrentUser = () => _currentUser;
export const setCurrentUser = (u) => { _currentUser = u; };

// Progression decision rows (last dry-run)
export let _prRows = [];
export const set_prRows = v => { _prRows = v; };

// Action queued behind the password confirm
let _sensitiveRun = null;
export const getSensitiveRun   = ()  => _sensitiveRun;
export const set_sensitiveRun  = v   => { _sensitiveRun = v; };

// Student being placed from the pool
export let _placementId = null;
export const set_placementId = v => { _placementId = v; };

// User being edited in the people form
export let _editingUserId = null;
export const set_editingUserId = v => { _editingUserId = v; };

// User whose password is being reset
export let _resetUserId = null;
export const set_resetUserId = v => { _resetUserId = v; };

// Choose-subjects modal state
export let _csState = null;
export const set_csState = v => { _csState = v; };
