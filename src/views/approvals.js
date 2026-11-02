// ============================================================
//  Happy Man Academy — Principal approval queue (admin)
//
//  Lists Vice-Principal requests awaiting Principal sign-off. Approving
//  runs principal_decide_request(), which executes the underlying action
//  (open_exam_portal / publish_results / change_term) in one transaction.
// ============================================================

import { Data } from '../data/index.js';
import { getCurrentUser } from '../state.js';
import { $, $all, esc, toast, formatDate } from '../utils.js';
import { isAdmin } from '../auth.js';

const ACTION_LABEL = {
  open_exam_portal: 'Open exam portal',
  publish_results: 'Publish results',
  change_term: 'Change active term',
  pool_placement: 'Pool placement',
  results_publish: 'Publish results',
  end_of_session_run: 'End-of-session run',
  pool_close: 'Close pool',
  reclassify: 'Reclassify student',
  reactivate: 'Reactivate student'
};

export async function renderAdminApprovals() {
  if (!isAdmin(getCurrentUser())) return;
  $('pa-refresh').onclick = renderAdminApprovals;

  const tbody = $('pa-table');
  tbody.innerHTML = '<tr><td colspan="5" class="muted-cell">Loading…</td></tr>';
  $('pa-count').textContent = '—';

  let rows = [];
  try {
    rows = await Data.pendingApprovals();
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="5" class="muted-cell">${esc(e.message || 'Could not load requests.')}</td></tr>`;
    return;
  }

  $('pa-count').textContent = `${rows.length} pending`;
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="muted-cell">No pending requests.</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map(r => {
    const requester = Data.user(r.requested_by);
    const name = requester?.name || `User ${r.requested_by}`;
    const detail = r.payload && Object.keys(r.payload).length
      ? esc(JSON.stringify(r.payload))
      : '<span class="muted-cell">—</span>';
    return `<tr>
      <td><strong>${esc(ACTION_LABEL[r.action_type] || r.action_type)}</strong></td>
      <td>${esc(name)}</td>
      <td><small class="muted-cell">${detail}</small></td>
      <td>${esc(formatDate(r.created_at))}</td>
      <td>
        <button class="btn-primary pa-approve" data-id="${r.id}">Approve</button>
        <button class="outline-button pa-reject" data-id="${r.id}">Reject</button>
      </td>
    </tr>`;
  }).join('');

  $all('.pa-approve').forEach(b => b.onclick = () => decide(b.dataset.id, true));
  $all('.pa-reject').forEach(b => b.onclick = () => decide(b.dataset.id, false));
}

async function decide(id, approve) {
  const fb = $('pa-feedback'); fb.hidden = true;
  try {
    await Data.decideApproval(id, approve);
    toast(approve ? 'Request approved and executed.' : 'Request rejected.', 'success');
    renderAdminApprovals();
  } catch (e) {
    fb.hidden = false; fb.textContent = e.message || 'Could not decide this request.';
    fb.classList.add('error');
    toast(e.message || 'Could not decide this request.', 'error');
  }
}
