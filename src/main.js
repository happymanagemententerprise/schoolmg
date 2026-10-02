// ============================================================
//  Happy Man Academy — Bootstrap entry point
// ============================================================

import { initLogin, login } from './auth.js';
import { wireGlobals } from './router.js';
import { Data, DB } from './data/index.js';
import { bindResetPasswordModal, bindProgressionModals, bindPassportActions } from './views/admin.js';

document.addEventListener('DOMContentLoaded', async () => {
  // Wait for the data layer to load from Supabase (data.js bootstraps
  // itself via window.loadFromSupabase, which is called in data.js's
  // own DOMContentLoaded or in data.js directly when it's a module).
  // data.js exposes loadFromSupabase on window; call it here if needed.
  const loadingEl = document.createElement('div');
  loadingEl.id      = 'app-loading';
  loadingEl.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:var(--bg,#f5f5f5);font-size:15px;color:#888;z-index:9999;';
  loadingEl.textContent   = 'Connecting to database…';
  document.body.appendChild(loadingEl);

  if (typeof window.loadFromSupabase === 'function') {
    await window.loadFromSupabase();
  }

  loadingEl.remove();

  wireGlobals();
  initLogin();
  bindResetPasswordModal();
  bindProgressionModals();
  bindPassportActions();

  const failed = Data.failedSources?.();
  if (failed?.length) {
    console.warn('[HMA] unreachable tables:', failed.join(', '));
  }

  const saved = DB.get('currentUser');
  if (saved?.email) {
    const fresh = Data.userByEmail(saved.email);
    if (fresh) login(fresh);
  }
});
