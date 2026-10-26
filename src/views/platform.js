import { Data } from '../data/index.js';
import { $, esc, showFormMessage } from '../utils.js';

const money = (value, currency = 'NGN') => value == null ? '—' : new Intl.NumberFormat('en-NG', {
  style: 'currency', currency: /^[A-Z]{3}$/.test(currency) ? currency : 'NGN', maximumFractionDigits: 0
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
  const tiers = $('owner-tier-options');
  success.hidden = true;
  feedback.hidden = true;
  tiers.innerHTML = '<span class="muted-cell">Loading tiers…</span>';
  tiers.setAttribute('aria-busy', 'true');
  let availablePlans = [];
  const submit = $('owner-create-school');
  submit.disabled = true;
  Data.platformPlans().then(plans => {
    availablePlans = Array.isArray(plans) ? plans : [];
    tiers.innerHTML = availablePlans.length
      ? availablePlans.map((plan, index) => `<label class="owner-tier-card">
          <input type="radio" name="planCode" value="${esc(plan.code)}" required ${index === 0 ? 'checked' : ''}>
          <span class="owner-tier-radio" aria-hidden="true"></span>
          <span class="owner-tier-copy"><strong>${esc(plan.name)}</strong><small>School subscription</small></span>
          <span class="owner-tier-price">${money(plan.price_per_student_per_term, plan.currency)}<small>per student / term</small></span>
        </label>`).join('')
      : '<span class="muted-cell">No subscription tiers are available. Add an available plan before onboarding a school.</span>';
    tiers.setAttribute('aria-busy', 'false');
    submit.disabled = !availablePlans.length;
    updatePriceHint(plans);
    tiers.onchange = () => updatePriceHint(availablePlans);
  }).catch(error => {
    tiers.setAttribute('aria-busy', 'false');
    tiers.innerHTML = '<span class="muted-cell">Subscription tiers are unavailable. The database setup needs attention.</span>';
    submit.disabled = true;
    const detail = String(error?.message || '');
    const missingRpc = /platform_available_plans|PGRST202|schema cache|could not find the function/i.test(detail);
    showFormMessage(feedback, missingRpc
      ? 'Could not load plans: public.platform_available_plans() is missing or not visible in this project’s API schema cache. Apply supabase/migrations/20261024044308_platform_school_onboarding.sql to the project this app uses, then reload the API schema cache. No school was created.'
      : 'Could not load subscription tiers. Check your SaaS-owner sign-in and database connection, then try again.', 'error');
  });
  form.onsubmit = async event => {
    event.preventDefault();
    feedback.hidden = true;
    success.hidden = true;
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
      let refreshMessage = '';
      try {
        await Data.refreshPlatformSchools();
        renderSchoolDirectory();
      } catch {
        refreshMessage = '<span class="owner-refresh-note">School setup succeeded, but the directory did not refresh. Return to Schools and refresh it.</span>';
      }
      const selectedPlan = availablePlans.find(plan => plan.code === values.planCode);
      success.innerHTML = `<strong>${esc(values.schoolName)} is registered.</strong>
        <span>Tier: ${esc(selectedPlan?.name || values.planCode)} · ${money(created.plan_price ?? selectedPlan?.price_per_student_per_term, selectedPlan?.currency)} per student / term</span>
        <span>First school account: ${esc(values.adminName)} · ${esc(values.adminEmail)} · School administrator</span>
        <span class="owner-invite-next"><strong>Next: create the admin sign-in.</strong> In Supabase Dashboard, open Authentication → Users and invite <strong>${esc(values.adminEmail)}</strong>. This setup created the school admin profile and membership; the invitation links the login.</span>
        ${refreshMessage}
        <small>School ID: ${esc(created.school_id)}</small>`;
      success.hidden = false;
      form.reset();
      const selectedRadio = [...form.querySelectorAll('input[name="planCode"]')].find(input => input.value === values.planCode);
      if (selectedRadio) selectedRadio.checked = true;
      updatePriceHint(availablePlans);
    } catch (error) {
      showFormMessage(feedback, error.message || 'Could not finish school setup. Check the school, administrator, and tier details.', 'error');
    } finally {
      submit.disabled = !availablePlans.length;
      submit.textContent = 'Create school and first account';
    }
  };
}

function updatePriceHint(plans) {
  const selectedCode = $('owner-onboarding-form')?.querySelector('input[name="planCode"]:checked')?.value;
  const chosen = plans?.find(plan => plan.code === selectedCode);
  $('owner-plan-price').textContent = chosen
    ? `${money(chosen.price_per_student_per_term, chosen.currency)} per student each term. ${chosen.currency || 'NGN'} billing.`
    : '';
}
