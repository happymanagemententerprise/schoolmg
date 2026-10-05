// ============================================================
//  Happy Man Academy — Bootstrap entry point
// ============================================================

import Alpine from 'alpinejs';
window.Alpine = Alpine;
import './styles.css';
import { initLogin, login } from './auth.js';
import { wireGlobals } from './router.js';
import { Data, DB } from './data/index.js';
import { initAdminModals } from './views/admin.js';

document.addEventListener('alpine:init', () => {
  Alpine.store('toast', { visible: false, message: '', type: 'info' });
  Alpine.store('modals', {});
  Alpine.store('loginError', '');
});

Alpine.start();

document.addEventListener('DOMContentLoaded', async () => {
  // Wire the shell immediately so the login screen is visible at once.
  // Data loads in the background; the login button is disabled until ready.
  wireGlobals();
  initLogin();
  initAdminModals();

  // Disable the login button while data is loading and show a subtle
  // status hint inside the form instead of a full-screen overlay.
  const loginBtn  = document.getElementById('login-btn');
  const statusEl  = document.getElementById('login-status');
  if (loginBtn)  loginBtn.disabled = true;
  if (statusEl)  { statusEl.textContent = 'Loading…'; statusEl.hidden = false; }

  if (typeof window.loadFromSupabase === 'function') {
    await window.loadFromSupabase();
  }

  // Re-enable login once data is ready.
  if (loginBtn)  loginBtn.disabled = false;
  if (statusEl)  statusEl.hidden = true;

  const failed = Data.failedSources?.();
  if (failed?.length) {
    console.warn('[HMA] unreachable tables:', failed.join(', '));
  }

  // Restore session from Supabase Auth (handles cookie/localStorage automatically)
  const session = await Data.getSession();
  if (session?.user?.email) {
    const fresh = Data.userByEmail(session.user.email);
    if (fresh && !Data.accountBlocked(fresh)) login(fresh);
  }
});
