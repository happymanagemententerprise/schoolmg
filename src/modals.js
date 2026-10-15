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
  const m = document.getElementById(id);
  const modalStore = window.Alpine?.store?.('modals');
  if (modalStore) modalStore[id] = true;
  if (m) {
    m.hidden = false;
    m.setAttribute('aria-hidden', 'false');
  }
}

export function closeModal(id) {
  const m = document.getElementById(id);
  const modalStore = window.Alpine?.store?.('modals');
  if (modalStore) modalStore[id] = false;
  if (m) {
    m.hidden = true;
    m.setAttribute('aria-hidden', 'true');
  }
}
