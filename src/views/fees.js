// ============================================================
//  Happy Man Academy — Parent fee portal
//
//  Itemized fees, payment history and outstanding balances per linked
//  child, with Paystack checkout. "Pay" calls the payment-checkout edge
//  function (the parent's session token is attached by supabase-js) and
//  redirects to the Paystack authorization URL.
// ============================================================

import { Data } from '../data/index.js';
import { getCurrentUser } from '../state.js';
import { $, $all, esc, toast } from '../utils.js';

let _pfChild = null;
const fmt = n => '₦' + Number(n || 0).toLocaleString('en-NG');

export async function renderParentFees() {
  const user = getCurrentUser();
  const childIds = (user.childIds || []).map(String);
  const sel = $('pf-child');
  if (!childIds.length) {
    $('pf-fees').innerHTML = '<tr><td colspan="5" class="muted-cell">No children are linked to your account.</td></tr>';
    $('pf-history').innerHTML = '<tr><td colspan="5" class="muted-cell">—</td></tr>';
    return;
  }
  sel.innerHTML = childIds.map((id, i) => {
    const s = Data.student(id);
    return `<option value="${id}" ${i === 0 ? 'selected' : ''}>${esc(s?.name || ('Student ' + id))}</option>`;
  }).join('');
  if (!_pfChild || !childIds.includes(_pfChild)) _pfChild = childIds[0];
  sel.value = _pfChild;
  sel.onchange = () => { _pfChild = sel.value; loadChild(); };
  await loadChild();
}

async function loadChild() {
  const sid = _pfChild;
  const student = Data.student(sid);
  $('pf-summary').textContent = student
    ? `${student.name} · ${Data.cls(student.classId)?.name || ''} · ${student.admissionNo || ''}`
    : '';

  const tbody = $('pf-fees');
  const hist = $('pf-history');
  tbody.innerHTML = '<tr><td colspan="5" class="muted-cell">Loading…</td></tr>';
  hist.innerHTML = '<tr><td colspan="5" class="muted-cell">Loading…</td></tr>';

  let fees = [], pays = [];
  try { fees = await Data.childFees(sid); } catch (e) {
    tbody.innerHTML = `<tr><td colspan="5" class="muted-cell">${esc(e.message || 'Could not load fees.')}</td></tr>`;
  }
  try { pays = await Data.childPayments(sid); } catch (_) { /* history optional */ }

  if (fees.length) {
    tbody.innerHTML = fees.map(f => `<tr>
      <td><strong>${esc(f.label)}</strong>${f.level ? `<br><small class="muted-cell">${esc(f.level)}</small>` : ''}</td>
      <td>${fmt(f.amountDue)}</td>
      <td>${fmt(f.amountPaid)}</td>
      <td><strong>${fmt(f.outstanding)}</strong></td>
      <td>${feeBadge(f.status)}${f.outstanding > 0 ? ` <button class="btn-primary pf-pay" data-id="${f.id}">Pay with Paystack</button>` : ''}</td>
    </tr>`).join('');
  } else if (!tbody.innerHTML.includes('muted-cell')) {
    tbody.innerHTML = '<tr><td colspan="5" class="muted-cell">No fee items on record.</td></tr>';
  }

  if (pays.length) {
    hist.innerHTML = pays.map(p => `<tr>
      <td>${esc(p.date)}</td>
      <td>${fmt(p.amount)}</td>
      <td>${esc(p.gateway)}</td>
      <td><small class="muted-cell">${esc(p.reference)}</small></td>
      <td>${payBadge(p.status)}</td>
    </tr>`).join('');
  } else {
    hist.innerHTML = '<tr><td colspan="5" class="muted-cell">No payments yet.</td></tr>';
  }

  $all('.pf-pay').forEach(b => b.onclick = () => pay(b.dataset.id));
}

function feeBadge(s) {
  const cls = { paid: 'ok', part_paid: 'warn', unpaid: 'review', overpaid: 'ok' }[s] || 'review';
  return `<span class="status ${cls}">${esc(s || '—')}</span>`;
}
function payBadge(s) {
  const cls = { successful: 'ok', failed: 'review', pending: 'warn' }[s] || 'review';
  return `<span class="status ${cls}">${esc(s || '—')}</span>`;
}

async function pay(feeId) {
  try {
    const res = await Data.feesCheckout({ studentId: _pfChild, feeId, gateway: 'paystack' });
    if (res?.authorization_url) {
      window.location.href = res.authorization_url;
    } else {
      toast('No payment URL was returned. Try again or contact the school.', 'error');
    }
  } catch (e) {
    toast(e.message || 'Could not start payment.', 'error');
  }
}
