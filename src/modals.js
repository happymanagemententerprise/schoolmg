// ============================================================
//  Happy Man Academy — Modal helpers
//
//  Extracted from router.js so that shared.js can import
//  openModal/closeModal without creating a static circular
//  dependency through router.js → views/admin.js → shared.js.
//
//  Import chain after extraction:
//    shared.js  → modals.js   (no cycle)
//    router.js  → modals.js   (no cycle; re-exports for compat)
//    admin.js   → modals.js   (no cycle)
//    student.js → modals.js   (no cycle)
//    teacher.js → modals.js   (no cycle)
// ============================================================

import { $ } from './utils.js';

export function openModal(id) {
  if (window.Alpine) {
    Alpine.store('modals')[id] = true;
  } else {
    document.getElementById(id)?.removeAttribute('hidden');
  }
  const m = document.getElementById(id); if (m) m.setAttribute('aria-hidden', 'false');
}

export function closeModal(id) {
  if (window.Alpine) {
    Alpine.store('modals')[id] = false;
  } else {
    document.getElementById(id)?.setAttribute('hidden', '');
  }
  const m = document.getElementById(id); if (m) m.setAttribute('aria-hidden', 'true');
}
