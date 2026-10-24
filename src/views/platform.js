import { Data } from '../data/index.js';
import { $, esc } from '../utils.js';

export function renderPlatformSchools() {
  const schools = Data.platformSchools();
  $('owner-stat-schools').textContent = schools.length.toLocaleString();
  $('owner-stat-students').textContent = schools.reduce((sum, school) => sum + school.studentCount, 0).toLocaleString();
  $('owner-stat-subscribed').textContent = schools.filter(school => school.subscriptionStatus === 'active').length.toLocaleString();
  const body = $('owner-schools-table');
  if (!schools.length) {
    body.innerHTML = '<tr><td colspan="5" class="muted-cell">No schools are registered yet.</td></tr>';
    return;
  }
  const money = value => value == null ? '—' : new Intl.NumberFormat('en-NG', {
    style: 'currency', currency: 'NGN', maximumFractionDigits: 0
  }).format(value);
  body.innerHTML = schools.map(school => `<tr>
    <td><strong>${esc(school.name)}</strong><small class="owner-school-status">${esc(school.status || 'active')}</small></td>
    <td>${school.studentCount.toLocaleString()}</td>
    <td>${school.planName ? esc(school.planName) : '<span class="muted-cell">Not subscribed</span>'}</td>
    <td>${money(school.price)}</td>
    <td>${school.subscriptionStatus ? esc(school.subscriptionStatus.replace('_', ' ')) : '—'}</td>
  </tr>`).join('');
}
