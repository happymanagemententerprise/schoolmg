// ============================================================
//  Happy Man Academy — Admin fee setup
//
//  Create and manage fee structure line items (tuition, ICT, boarding, etc.)
//  then bulk-bill entire classes for a term in one click.
//  Requires: fee_structures + student_fees tables (20261026000000 / 20261027000000)
// ============================================================

import { Data } from '../data/index.js';
import { getCurrentUser } from '../state.js';
import { $, $all, esc, toast } from '../utils.js';
import { isAdmin } from '../auth.js';

const fmt = n => '₦' + Number(n || 0).toLocaleString('en-NG');

export async function renderAdminFeeSetup() {
  if (!isAdmin(getCurrentUser())) return;
  wireNewFeeForm();
  await loadFeeStructures();
  wireBillForm();
}

// ── Fee structure list ────────────────────────────────────────
async function loadFeeStructures() {
  const tbody = $('fs-list');
  tbody.innerHTML = '<tr><td colspan="6" class="muted-cell">Loading…</td></tr>';
  let rows = [];
  try { rows = await Data.fetchFeeStructures(); }
  catch (e) {
    tbody.innerHTML = `<tr><td colspan="6" class="muted-cell">${esc(e.message)}</td></tr>`;
    return;
  }
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="muted-cell">No fee items yet. Add one above.</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map(f => `<tr>
    <td><strong>${esc(f.label)}</strong></td>
    <td>${esc(f.level || '—')}</td>
    <td>${esc(f.class_id ? (Data.cls(String(f.class_id))?.name || f.class_id) : 'All classes')}</td>
    <td>${fmt(f.amount)}</td>
    <td>${f.is_termly ? 'Per term' : 'One-off'}</td>
    <td>
      <button class="text-button fs-del" data-id="${f.id}">Delete</button>
    </td>
  </tr>`).join('');

  $all('.fs-del').forEach(b => b.onclick = async () => {
    if (!confirm('Delete this fee item? Existing student_fees rows are kept.')) return;
    try {
      await Data.deleteFeeStructure(b.dataset.id);
      toast('Fee item deleted.', 'success');
      loadFeeStructures();
    } catch (e) { toast(e.message || 'Could not delete.', 'error'); }
  });
}

// ── Add new fee structure ─────────────────────────────────────
function wireNewFeeForm() {
  // Populate class selector
  const classSel = $('fs-class');
  classSel.innerHTML = '<option value="">All classes</option>' +
    Data.classes().map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');

  $('fs-add-btn').onclick = async () => {
    const label    = $('fs-label').value.trim();
    const level    = $('fs-level').value || null;
    const classId  = $('fs-class').value || null;
    const amount   = Number($('fs-amount').value);
    const isTermly = $('fs-termly').checked;
    const fb       = $('fs-feedback');
    fb.hidden = true;

    if (!label)          { fb.textContent = 'Label is required.';          fb.hidden = false; return; }
    if (!amount || amount <= 0) { fb.textContent = 'Enter a valid amount.'; fb.hidden = false; return; }

    try {
      await Data.saveFeeStructure({ label, level, classId, amount, isTermly });
      toast('Fee item saved.', 'success');
      $('fs-label').value = ''; $('fs-amount').value = '';
      $('fs-class').value = ''; $('fs-level').value = '';
      $('fs-termly').checked = true;
      fb.hidden = true;
      loadFeeStructures();
    } catch (e) {
      fb.textContent = e.message || 'Could not save.'; fb.hidden = false;
    }
  };
}

// ── Bulk-bill a class for a term ──────────────────────────────
function wireBillForm() {
  const classSel = $('bill-class');
  const termSel  = $('bill-term');
  classSel.innerHTML = '<option value="">— Select class —</option>' +
    Data.classes().map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');

  const sess = Data.session();
  termSel.innerHTML = (sess?.terms || []).map(t =>
    `<option value="${t._id}" ${t.term === sess.currentTerm ? 'selected' : ''}>${esc(t.name)}</option>`
  ).join('');

  $('bill-run-btn').onclick = async () => {
    const classId = $('bill-class').value;
    const termId  = $('bill-term').value;
    const checked = [...$all('.bill-fee-check:checked')].map(cb => cb.value);
    const fb      = $('bill-feedback');
    fb.hidden = true;

    if (!classId)       { fb.textContent = 'Select a class.';         fb.hidden = false; return; }
    if (!checked.length){ fb.textContent = 'Select at least one fee item.'; fb.hidden = false; return; }

    $('bill-run-btn').disabled = true;
    try {
      const count = await Data.billClassFees(classId, termId || null, checked);
      toast(`Billed ${count} student-fee rows.`, 'success');
      fb.hidden = true;
    } catch (e) {
      fb.textContent = e.message || 'Could not bill.'; fb.hidden = false;
    } finally { $('bill-run-btn').disabled = false; }
  };

  // Populate fee checkboxes when class changes (or on load)
  async function refreshFeeList() {
    const wrap = $('bill-fees-wrap');
    let rows = [];
    try { rows = await Data.fetchFeeStructures(); } catch { rows = []; }
    wrap.innerHTML = rows.filter(f => f.is_active).map(f =>
      `<label class="dept-check"><input type="checkbox" class="bill-fee-check" value="${f.id}" checked>
       <span>${esc(f.label)} — ${fmt(f.amount)}</span></label>`
    ).join('') || '<p class="muted-cell">No active fee items. Add them above first.</p>';
  }
  classSel.onchange = refreshFeeList;
  refreshFeeList();
}
