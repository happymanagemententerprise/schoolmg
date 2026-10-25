import { Data } from '../data/index.js';
import { $, esc, showFormMessage } from '../utils.js';

const money = value => value == null ? '—' : new Intl.NumberFormat('en-NG', {
  style: 'currency', currency: 'NGN', maximumFractionDigits: 0
}).format(value);

export function renderPlatformSchools() {
  renderSchoolDirectory();
}

export function renderPlatformOnboarding() {
  wireOnboarding();
}

function renderSchoolDirectory() {
  const schools = Data.platformSchools();
  $('owner-stat-schools').textContent = schools.length.toLocaleString();
  $('owner-stat-students').textContent = schools.reduce((sum, school) => sum + school.studentCount, 0).toLocaleString();
  $('owner-stat-subscribed').textContent = schools.filter(school => school.subscriptionStatus === 'active').length.toLocaleString();
  const body = $('owner-schools-table');
  if (!schools.length) {
    body.innerHTML = '<tr><td colspan="5" class="muted-cell">No schools are registered yet.</td></tr>';
    return;
  }
  body.innerHTML = schools.map(school => `<tr>
    <td><strong>${esc(school.name)}</strong><small class="owner-school-status">${esc(school.status || 'active')}</small></td>
    <td>${school.studentCount.toLocaleString()}</td>
    <td>${school.planName ? esc(school.planName) : '<span class="muted-cell">Not subscribed</span>'}</td>
    <td>${money(school.price)}</td>
    <td>${school.subscriptionStatus ? esc(school.subscriptionStatus.replace('_', ' ')) : '—'}</td>
  </tr>`).join('');
}

function wireOnboarding() {
  const form = $('owner-onboarding-form');
  const feedback = $('owner-onboarding-feedback');
  const success = $('owner-onboarding-success');
  success.hidden = true;
  feedback.hidden = true;
  const planSelect = $('owner-onboarding-plan');
  planSelect.innerHTML = '<option value="">Loading plans…</option>';
  planSelect.disabled = true;
  $('owner-create-school').disabled = true;
  Data.platformPlans().then(plans => {
    planSelect.innerHTML = plans.length
      ? plans.map(plan => `<option value="${esc(plan.code)}">${esc(plan.name)} — ${money(plan.price_per_student_per_term)} / student / term</option>`).join('')
      : '<option value="">No available plans</option>';
    planSelect.disabled = !plans.length;
    $('owner-create-school').disabled = !plans.length;
    updatePriceHint(plans);
    planSelect.onchange = () => updatePriceHint(plans);
  }).catch(error => {
    $('owner-create-school').disabled = true;
    showFormMessage(feedback, error.message || 'Could not load plans.', 'error');
  });
  form.onsubmit = async event => {
    event.preventDefault();
    feedback.hidden = true;
    success.hidden = true;
    const submit = $('owner-create-school');
    const fields = new FormData(form);
    const values = {
      organizationName: String(fields.get('organizationName') || '').trim(),
      schoolName: String(fields.get('schoolName') || '').trim(),
      adminName: String(fields.get('adminName') || '').trim(),
      adminEmail: String(fields.get('adminEmail') || '').trim().toLowerCase(),
      planCode: String(fields.get('planCode') || ''),
      prepaidTerms: Number(fields.get('prepaidTerms')),
      discountPercent: Number(fields.get('discountPercent'))
    };
    submit.disabled = true;
    submit.textContent = 'Creating school…';
    try {
      const created = await Data.onboardPlatformSchool(values);
      await Data.refreshPlatformSchools();
      renderSchoolDirectory();
      success.innerHTML = `<strong>${esc(values.schoolName)} is registered.</strong>
        <span>Plan: ${esc($('owner-onboarding-plan').selectedOptions[0]?.textContent || values.planCode)}</span>
        <span>First administrator: ${esc(values.adminName)} · ${esc(values.adminEmail)}</span>
        <span class="owner-invite-next">Next: in Supabase Dashboard, open Authentication → Users and invite <strong>${esc(values.adminEmail)}</strong>. The school admin profile is ready for the Auth account to link to it.</span>
        <small>School ID: ${esc(created.school_id)}</small>`;
      success.hidden = false;
      form.reset();
      $('owner-onboarding-plan').value = values.planCode;
      updatePriceHint();
    } catch (error) {
      showFormMessage(feedback, error.message || 'Could not create the school. No onboarding records were saved.', 'error');
    } finally {
      submit.disabled = planSelect.disabled;
      submit.textContent = 'Create school';
    }
  };
}

function updatePriceHint(plans) {
  const chosen = plans?.find(plan => plan.code === $('owner-onboarding-plan').value);
  $('owner-plan-price').textContent = chosen
    ? `${money(chosen.price_per_student_per_term)} per student each term · ${chosen.currency || 'NGN'}`
    : '';
}
