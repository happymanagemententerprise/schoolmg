// ============================================================
//  Happy Man Academy — Teacher push devices
//
//  Lists the teacher's registered FCM/APNs device tokens (from the mobile
//  app) and lets them remove stale ones. New tokens are added from the
//  mobile app via Data.registerDeviceToken(); the web portal only manages
//  existing ones.
// ============================================================

import { Data } from '../data/index.js';
import { getCurrentUser } from '../state.js';
import { $, $all, esc, toast } from '../utils.js';

export async function renderTeacherDevices() {
  const user = getCurrentUser();
  await loadDevices(user.id);
}

async function loadDevices(userId) {
  const tbody = $('td-list');
  tbody.innerHTML = '<tr><td colspan="5" class="muted-cell">Loading…</td></tr>';
  let rows = [];
  try {
    rows = await Data.deviceTokens(userId);
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="5" class="muted-cell">${esc(e.message || 'Could not load devices.')}</td></tr>`;
    return;
  }
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="muted-cell">No devices registered. Add one from the mobile app.</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map(d => `<tr>
    <td>${esc(d.platform)}</td>
    <td><small class="muted-cell">${esc(String(d.deviceToken).slice(0, 16))}…</small></td>
    <td>${esc(d.createdAt || '—')}</td>
    <td>${d.isActive ? '<span class="status ok">active</span>' : '<span class="status review">inactive</span>'}</td>
    <td><button class="text-button td-del" data-id="${d.id}">Remove</button></td>
  </tr>`).join('');
  $all('.td-del').forEach(b => b.onclick = async () => {
    try {
      await Data.removeDeviceToken(b.dataset.id);
      toast('Device removed.', 'success');
      loadDevices(userId);
    } catch (e) {
      toast(e.message || 'Could not remove the device.', 'error');
    }
  });
}
