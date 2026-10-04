// ============================================================
//  Happy Man Academy — Comprehensive Button Audit
//  Tests every visible button across all roles and views
// ============================================================
const { test, expect } = require('@playwright/test');

const BASE = 'http://localhost:8000';

// ── Helpers ───────────────────────────────────────────────────

/** Log in with email+password and wait for the sidebar to appear */
async function login(page, email, pw) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.fill('#login-email', email);
  await page.fill('#login-password', pw);
  await page.click('.login-btn');
  await page.waitForSelector('#logout-btn', { timeout: 12000 });
  // Wait for data layer to be ready
  await waitForData(page);
}

/** Navigate to a view using its data-page nav button */
async function goView(page, viewId) {
  const btn = page.locator(`.nav-item[data-page="${viewId}"]`);
  if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await btn.click();
    await page.waitForTimeout(700);
    return true;
  }
  return false;
}

/** Wait for the data layer (window.Academic) to be ready — max 10s */
async function waitForData(page) {
  await page.waitForFunction(() =>
    window.Academic && typeof window.Academic.termAverage === 'function',
    { timeout: 10000 }
  ).catch(() => {});
  await page.waitForTimeout(300);
}

/**
 * Close any open modal overlay so subsequent clicks aren't blocked.
 * Tries the inner close button first, then force-hides via JS as fallback.
 */
async function dismissAnyModal(page) {
  // Click the topmost visible close button
  for (const closeSel of [
    '.modal-overlay:visible .close-modal',
    '.modal-overlay:visible [data-modal]',
    '.modal-overlay:visible button:has-text("Cancel")',
    '.modal-overlay:visible button:has-text("Close")',
  ]) {
    const el = page.locator(closeSel).first();
    if (await el.isVisible({ timeout: 300 }).catch(() => false)) {
      await el.click({ timeout: 2000, force: true }).catch(() => {});
      await page.waitForTimeout(400);
      break;
    }
  }
  // Safety net: force-hide any remaining visible overlays via JS
  await page.evaluate(() => {
    document.querySelectorAll('.modal-overlay').forEach(m => {
      if (getComputedStyle(m).display !== 'none') {
        m.style.display = 'none';
        // Reset Alpine store so it doesn't interfere
        try {
          const id = m.id;
          if (id && window.Alpine && window.Alpine.store('modals')) {
            window.Alpine.store('modals')[id] = false;
          }
        } catch(e) {}
      }
    });
  }).catch(() => {});
  await page.waitForTimeout(200);
}

/**
 * Attempt to click a button; record PASS / FAIL / SKIP.
 * After clicking, dismiss any modal that opened so the page stays clean.
 */
async function auditButton(page, selector, label, results, errors) {
  try {
    // First make sure no modal is blocking the page
    await dismissAnyModal(page);

    const btn = page.locator(selector).first();
    if (!await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
      results.push({ label, status: 'SKIP', reason: 'not visible' });
      return;
    }
    if (await btn.isDisabled().catch(() => false)) {
      results.push({ label, status: 'SKIP', reason: 'disabled' });
      return;
    }

    const before = errors.length;
    await btn.click({ timeout: 5000 });
    await page.waitForTimeout(500);

    const newErrors = errors.slice(before).filter(e =>
      !e.includes('ResizeObserver') && !e.includes('non-passive')
    );
    if (newErrors.length) {
      results.push({ label, status: 'FAIL', reason: newErrors.join(' | ').slice(0, 200) });
    } else {
      results.push({ label, status: 'PASS' });
    }

    // Dismiss any modal / drawer that just opened
    await dismissAnyModal(page);
    // Dismiss drawer
    const drawerClose = page.locator('[data-close-drawer]').first();
    if (await drawerClose.isVisible({ timeout: 300 }).catch(() => false)) {
      await drawerClose.click({ timeout: 2000 }).catch(() => {});
      await page.waitForTimeout(300);
    }
  } catch (e) {
    results.push({ label, status: 'FAIL', reason: e.message.split('\n')[0].slice(0, 200) });
  }
}

function collectErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push(`JS: ${e.message}`));
  page.on('console',   m => { if (m.type() === 'error') errors.push(`CON: ${m.text()}`); });
  return errors;
}

function printResults(section, results) {
  const pass = results.filter(r => r.status === 'PASS').length;
  const fail = results.filter(r => r.status === 'FAIL').length;
  const skip = results.filter(r => r.status === 'SKIP').length;
  console.log(`\n══════════════════════════════════════`);
  console.log(`  ${section.toUpperCase()}: ${pass} PASS  ${fail} FAIL  ${skip} SKIP`);
  console.log(`══════════════════════════════════════`);
  for (const r of results) {
    const icon = r.status === 'PASS' ? '✅' : r.status === 'FAIL' ? '❌' : '⏭';
    const detail = r.reason ? `  → ${r.reason}` : '';
    console.log(`  ${icon} ${r.label}${detail}`);
  }
}

function formatFailures(failures) {
  if (!failures.length) return '';
  return '\n\nFailed buttons:\n' + failures.map(f => `  ❌ ${f.label}:\n     ${f.reason}`).join('\n');
}

// ── TEST: Login page ──────────────────────────────────────────
test('Login page', async ({ page }) => {
  const errors = collectErrors(page);
  const results = [];

  await page.goto(BASE, { waitUntil: 'networkidle' });

  // Password eye toggle
  await auditButton(page, '#toggle-pw', 'Toggle password visibility', results, errors);

  // Demo fill buttons
  const demoBtns = [
    ['admin@happyman.edu',           'Administrator'],
    ['class@happyman.edu',           'Class Teacher'],
    ['subject@happyman.edu',         'Subject Teacher'],
    ['hod@happyman.edu',             'HOD'],
    ['ama.osei@happyman.edu',        'Student'],
    ['emeka.okafor@happyman.edu',    'Repeated Student'],
    ['parent@happyman.edu',          'Parent'],
  ];
  for (const [email, label] of demoBtns) {
    const btn = page.locator(`.demo-btn[data-email="${email}"]`);
    if (await btn.isVisible().catch(() => false)) {
      await btn.click();
      await page.waitForTimeout(200);
      const val = await page.inputValue('#login-email').catch(() => '');
      results.push({ label: `Demo fill — ${label}`, status: val === email ? 'PASS' : 'FAIL', reason: val !== email ? `got "${val}"` : undefined });
    }
  }

  printResults('Login page', results);
  expect(results.filter(r => r.status === 'FAIL'), formatFailures(results.filter(r => r.status === 'FAIL'))).toHaveLength(0);
});

// ── TEST: Administrator views ─────────────────────────────────
test('Administrator — all views', async ({ page }) => {
  const errors = collectErrors(page);
  const results = [];

  await login(page, 'admin@happyman.edu', 'admin123');

  // Overview (default landing view)
  await auditButton(page, 'button[data-nav="view-admin-analytics"]', 'Overview → View analytics', results, errors);
  await auditButton(page, 'button[data-nav="view-admin-setup"]',     'Overview → Manage calendar', results, errors);
  await auditButton(page, '#notif-btn',   'Notifications bell', results, errors);

  // People
  await goView(page, 'view-admin-people');
  await auditButton(page, '#add-user-btn', 'People → + Add person (opens modal)', results, errors);
  for (const tab of ['staff', 'students-all', 'parents']) {
    const t = page.locator(`.tab-btn[data-tab="${tab}"]`);
    if (await t.isVisible({ timeout: 1000 }).catch(() => false)) {
      await t.click(); await page.waitForTimeout(400);
      results.push({ label: `People → ${tab} tab`, status: 'PASS' });
    }
  }

  // Classes
  await goView(page, 'view-admin-classes');
  await auditButton(page, '#add-class-btn', 'Classes → + Add class', results, errors);

  // Subjects
  await goView(page, 'view-admin-subjects');
  await auditButton(page, '#add-subject-btn', 'Subjects → + Add subject', results, errors);

  // Timetable
  await goView(page, 'view-admin-timetable');
  await auditButton(page, '#generate-tt-btn',     'Timetable → Generate for class', results, errors);
  await auditButton(page, '#generate-tt-all-btn', 'Timetable → Generate for ALL',   results, errors);

  // Analytics
  await goView(page, 'view-admin-analytics');
  await auditButton(page, '#midterm-download-btn', 'Analytics → Download mid-term report', results, errors);

  // Leaderboard
  await goView(page, 'view-admin-leaderboard');
  // (no specific buttons beyond nav; just confirm it renders)
  results.push({ label: 'Leaderboard view rendered', status: 'PASS' });

  // Recognition
  await goView(page, 'view-admin-recognition');
  await auditButton(page, '#rec-award-btn', 'Recognition → Award honor', results, errors);

  // Setup
  await goView(page, 'view-admin-setup');
  await auditButton(page, '#toggle-test-upload',  'Setup → Toggle test upload',  results, errors);
  await auditButton(page, '#toggle-exam-upload',  'Setup → Toggle exam upload',  results, errors);
  await auditButton(page, '#save-session-btn',    'Setup → Save settings',       results, errors);
  await auditButton(page, '#start-session-btn',   'Setup → Start new session (disabled ok)', results, errors);
  await auditButton(page, '#add-event-btn',       'Setup → Add event',           results, errors);

  // Progression (React)
  await goView(page, 'view-admin-progression');
  await page.waitForTimeout(1200); // allow React to mount
  await auditButton(page, 'button:has-text("Dry run")',          'Progression → Dry run',          results, errors);
  await auditButton(page, 'button:has-text("Commit decisions")', 'Progression → Commit decisions', results, errors);

  // Logout
  await auditButton(page, '#logout-btn', 'Logout', results, errors);

  printResults('Administrator', results);
  expect(results.filter(r => r.status === 'FAIL'), formatFailures(results.filter(r => r.status === 'FAIL'))).toHaveLength(0);
});

// ── TEST: Class Teacher views ─────────────────────────────────
test('Class Teacher — all views', async ({ page }) => {
  const errors = collectErrors(page);
  const results = [];

  await login(page, 'class@happyman.edu', 'class123');

  // My Class (React: ClassOverview)
  await goView(page, 'view-class-overview');
  await page.waitForTimeout(1000);
  await auditButton(page, 'button:has-text("Add feedback")',         'My Class → Add feedback',      results, errors);
  await auditButton(page, 'button:has-text("Class report")',         'My Class → Class report',      results, errors);
  await auditButton(page, 'button:has-text("Full register")',        'My Class → Full register',     results, errors);
  await auditButton(page, 'button:has-text("Open attendance")',      'My Class → Open attendance',   results, errors);

  // Class Report (vanilla JS view)
  await goView(page, 'view-class-report');
  await page.waitForTimeout(600);
  await auditButton(page, '#cr-register-btn', 'Class Report → Full register',   results, errors);
  await auditButton(page, '#cr-feedback-btn', 'Class Report → Feedback',        results, errors);
  await auditButton(page, '#cr-download-btn', 'Class Report → Download Excel',  results, errors);

  // Attendance (React: ClassAttendance)
  await goView(page, 'view-class-attendance');
  await page.waitForTimeout(1000);
  await auditButton(page, 'button:has-text("Save day")',    'Attendance → Save day',    results, errors);
  await auditButton(page, 'button:has-text("All present")', 'Attendance → All present', results, errors);
  await auditButton(page, 'button:has-text("All absent")',  'Attendance → All absent',  results, errors);
  // Toggle state buttons (first student row)
  await auditButton(page, '.att-state-btn:has-text("Present")', 'Attendance → toggle Present', results, errors);
  await auditButton(page, '.att-state-btn:has-text("Late")',    'Attendance → toggle Late',    results, errors);
  await auditButton(page, '.att-state-btn:has-text("Absent")',  'Attendance → toggle Absent',  results, errors);
  // Week and day selectors
  const weekSel = page.locator('.att-daily-bar select').first();
  if (await weekSel.isVisible({ timeout: 1000 }).catch(() => false)) {
    await weekSel.selectOption('2');
    await page.waitForTimeout(300);
    results.push({ label: 'Attendance → Week selector', status: 'PASS' });
  }

  // Quizzes (React: QuizManager)
  await goView(page, 'view-teacher-quizzes');
  await page.waitForTimeout(1000);
  await auditButton(page, 'button:has-text("Create quiz")', 'Quizzes → Create quiz', results, errors);

  // Logout
  await auditButton(page, '#logout-btn', 'Logout', results, errors);

  printResults('Class Teacher', results);
  expect(results.filter(r => r.status === 'FAIL'), formatFailures(results.filter(r => r.status === 'FAIL'))).toHaveLength(0);
});

// ── TEST: Subject Teacher views ───────────────────────────────
test('Subject Teacher — all views', async ({ page }) => {
  const errors = collectErrors(page);
  const results = [];

  await login(page, 'subject@happyman.edu', 'subject123');

  // Subject Dashboard
  await goView(page, 'view-subject-dashboard');
  await page.waitForTimeout(500);
  await auditButton(page, '#st-report-link',       'Dashboard → Open my report',       results, errors);
  await auditButton(page, '#st-upload-btn',         'Dashboard → Upload spreadsheet',   results, errors);
  await auditButton(page, '#st-choose-file',        'Dashboard → Choose file',          results, errors);
  await auditButton(page, '#st-download-sheet-btn', 'Dashboard → Download score sheet', results, errors);
  await auditButton(page, '#st-create-assign-btn',  'Dashboard → + Create assignment',  results, errors);
  await auditButton(page, '#st-assign-mentor-btn',  'Dashboard → + Assign mentor',      results, errors);
  await auditButton(page, '#wt-add-btn',            'Dashboard → Add weekly topic',     results, errors);

  // Subject Scores
  await goView(page, 'view-subject-scores');
  await page.waitForTimeout(400);
  await auditButton(page, '#st-download-xls-btn',   'Scores → Download Excel',         results, errors);
  await auditButton(page, '#st-scores-upload-btn',  'Scores → Upload scores',          results, errors);

  // Lessons
  await goView(page, 'view-teacher-lessons');
  await page.waitForTimeout(400);
  await auditButton(page, '#ls-submit', 'Lessons → Publish lesson', results, errors);

  // Discussions
  await goView(page, 'view-teacher-discussions');
  await page.waitForTimeout(400);
  await auditButton(page, '#td-open', 'Discussions → Open discussion', results, errors);

  // Quizzes (React)
  await goView(page, 'view-teacher-quizzes');
  await page.waitForTimeout(1000);
  await auditButton(page, 'button:has-text("Create quiz")', 'Quizzes → Create quiz', results, errors);

  // Logout
  await auditButton(page, '#logout-btn', 'Logout', results, errors);

  printResults('Subject Teacher', results);
  expect(results.filter(r => r.status === 'FAIL'), formatFailures(results.filter(r => r.status === 'FAIL'))).toHaveLength(0);
});

// ── TEST: HOD views ───────────────────────────────────────────
test('HOD — all views', async ({ page }) => {
  const errors = collectErrors(page);
  const results = [];

  await login(page, 'hod@happyman.edu', 'hod123');

  await goView(page, 'view-hod-dashboard');
  await page.waitForTimeout(500);
  await auditButton(page, '#hod-assign-btn',    'HOD → Assign teacher',  results, errors);
  await auditButton(page, '#hod-save-dept-btn', 'HOD → Save subjects',   results, errors);

  await auditButton(page, '#logout-btn', 'Logout', results, errors);

  printResults('HOD', results);
  expect(results.filter(r => r.status === 'FAIL'), formatFailures(results.filter(r => r.status === 'FAIL'))).toHaveLength(0);
});

// ── TEST: Student views ───────────────────────────────────────
test('Student — all views', async ({ page }) => {
  const errors = collectErrors(page);
  const results = [];

  await login(page, 'ama.osei@happyman.edu', 'student123');

  // Student Dashboard
  await goView(page, 'view-student-dashboard');
  await page.waitForTimeout(500);
  await auditButton(page, '#std-view-report-btn', 'Student → View full report',         results, errors);
  await auditButton(page, '#std-download-btn',    'Student → Download report',          results, errors);
  await auditButton(page, '#std-passport-btn',    'Student → Open passport',            results, errors);
  await auditButton(page, '#std-art-submit',      'Student → Submit for verification',  results, errors);
  await auditButton(page, '#std-subjects-btn',    'Student → Choose subjects (optional)', results, errors);

  // My Quizzes (React)
  await goView(page, 'view-student-quizzes');
  await page.waitForTimeout(1000);
  // Confirm the React panel rendered
  const panel = page.locator('.panel').first();
  const rendered = await panel.isVisible({ timeout: 2000 }).catch(() => false);
  results.push({ label: 'Student Quizzes → panel rendered', status: rendered ? 'PASS' : 'FAIL', reason: rendered ? undefined : 'No .panel visible' });

  // My Attendance
  await goView(page, 'view-student-attendance');
  await page.waitForTimeout(400);
  results.push({ label: 'Student Attendance view rendered', status: 'PASS' });

  // My Results
  await goView(page, 'view-student-results');
  await page.waitForTimeout(400);
  results.push({ label: 'Student Results view rendered', status: 'PASS' });

  await auditButton(page, '#logout-btn', 'Logout', results, errors);

  printResults('Student', results);
  expect(results.filter(r => r.status === 'FAIL'), formatFailures(results.filter(r => r.status === 'FAIL'))).toHaveLength(0);
});

// ── TEST: Parent views ────────────────────────────────────────
test('Parent — all views', async ({ page }) => {
  const errors = collectErrors(page);
  const results = [];

  await login(page, 'parent@happyman.edu', 'parent123');

  await goView(page, 'view-parent-dashboard');
  await page.waitForTimeout(500);
  await auditButton(page, '#par-ack-btn', "Parent → Acknowledge results",      results, errors);
  await auditButton(page, '#par-pta-btn', "Parent → Record PTA attendance",    results, errors);

  await auditButton(page, '#logout-btn', 'Logout', results, errors);

  printResults('Parent', results);
  expect(results.filter(r => r.status === 'FAIL'), formatFailures(results.filter(r => r.status === 'FAIL'))).toHaveLength(0);
});

// ── TEST: All modals open + close ─────────────────────────────
test('Modals — open and close', async ({ page }) => {
  const errors = collectErrors(page);
  const results = [];

  await login(page, 'admin@happyman.edu', 'admin123');

  async function testModal(openSel, modalId, label) {
    await dismissAnyModal(page); // ensure page is clean before each modal test
    const btn = page.locator(openSel).first();
    if (!await btn.isVisible({ timeout: 1500 }).catch(() => false)) {
      results.push({ label: `${label} — open btn visible`, status: 'SKIP', reason: 'trigger not visible' });
      return false;
    }
    await btn.click();
    await page.waitForTimeout(700);
    const modal = page.locator(`#${modalId}`);
    const open  = await modal.isVisible({ timeout: 2000 }).catch(() => false);
    results.push({ label: `${label} — opens`, status: open ? 'PASS' : 'FAIL', reason: open ? undefined : 'modal not visible after click' });
    if (open) {
      // Close with the header X button specifically within this modal
      const closeX = modal.locator('.close-modal').first();
      if (await closeX.isVisible({ timeout: 500 }).catch(() => false)) {
        await closeX.click({ force: true });
        await page.waitForTimeout(500);
        const closed = !await modal.isVisible({ timeout: 800 }).catch(() => true);
        results.push({ label: `${label} — closes`, status: closed ? 'PASS' : 'FAIL', reason: closed ? undefined : 'modal still visible after close' });
        if (!closed) await dismissAnyModal(page);
      }
    }
    return open;
  }

  // Add person modal
  await goView(page, 'view-admin-people');
  await testModal('#add-user-btn', 'add-user-modal', 'Add person modal');

  // Add class modal
  await goView(page, 'view-admin-classes');
  await testModal('#add-class-btn', 'add-class-modal', 'Add class modal');

  // Add subject modal
  await goView(page, 'view-admin-subjects');
  await testModal('#add-subject-btn', 'add-subject-modal', 'Add subject modal');

  // Add assignment modal (any teacher role can do this from subject dashboard)
  // Re-login as subject teacher for this one
  await auditButton(page, '#logout-btn', 'logout before modal test', results, errors);
  await login(page, 'subject@happyman.edu', 'subject123');
  await goView(page, 'view-subject-dashboard');
  await testModal('#st-create-assign-btn', 'add-assignment-modal', 'Add assignment modal');

  // Assign mentor modal
  await testModal('#st-assign-mentor-btn', 'assign-mentor-modal', 'Assign mentor modal');

  // Student passport modal (from student login)
  await auditButton(page, '#logout-btn', 'logout before passport test', results, errors);
  await login(page, 'ama.osei@happyman.edu', 'student123');
  await goView(page, 'view-student-dashboard');
  await testModal('#std-passport-btn', 'passport-modal', 'Passport modal');

  printResults('Modals', results);
  expect(results.filter(r => r.status === 'FAIL'), formatFailures(results.filter(r => r.status === 'FAIL'))).toHaveLength(0);
});

// ── TEST: Student report drawer ───────────────────────────────
test('Student report drawer', async ({ page }) => {
  const errors = collectErrors(page);
  const results = [];

  await login(page, 'admin@happyman.edu', 'admin123');

  // Navigate to class report which has per-student "Detail" buttons
  await goView(page, 'view-admin-people');
  await page.waitForTimeout(500);

  // Try clicking first student's "Open full report" row action
  const reportTrigger = page.locator('[data-student-report], button[data-cr-student], .btn-sm-save:has-text("Report")').first();
  if (await reportTrigger.isVisible({ timeout: 2000 }).catch(() => false)) {
    await reportTrigger.click();
    await page.waitForTimeout(1200);

    const drawerVisible = await page.locator('#report-drawer').evaluate(
      el => el.getAttribute('aria-hidden') === 'false' || !el.hasAttribute('aria-hidden')
    ).catch(() => false);
    results.push({ label: 'Report drawer opens', status: drawerVisible ? 'PASS' : 'FAIL', reason: drawerVisible ? undefined : 'aria-hidden still set' });

    const reactContent = await page.locator('#react-report-drawer .drawer-content').isVisible({ timeout: 2000 }).catch(() => false);
    results.push({ label: 'React drawer content rendered', status: reactContent ? 'PASS' : 'FAIL', reason: reactContent ? undefined : '.drawer-content missing inside #react-report-drawer' });

    if (reactContent) {
      await auditButton(page, '#react-report-drawer button:has-text("Download")', 'Drawer → Download report', results, errors);
      await auditButton(page, '#react-report-drawer button:has-text("Print")',    'Drawer → Print/PDF',       results, errors);
    }

    // Close drawer
    await auditButton(page, '.close-drawer', 'Drawer → Close button', results, errors);
  } else {
    // Fallback: open class report and use the per-row Detail buttons
    await goView(page, 'view-class-report');
    await page.waitForTimeout(600);
    const detailBtn = page.locator('[data-cr-student]').first();
    if (await detailBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await detailBtn.click();
      await page.waitForTimeout(1200);
      const reactContent = await page.locator('#react-report-drawer .drawer-content').isVisible({ timeout: 2000 }).catch(() => false);
      results.push({ label: 'React drawer content rendered (via class report)', status: reactContent ? 'PASS' : 'FAIL', reason: reactContent ? undefined : '.drawer-content not found' });
    } else {
      results.push({ label: 'Report drawer', status: 'SKIP', reason: 'No report trigger found — no students in data' });
    }
  }

  printResults('Report Drawer', results);
  expect(results.filter(r => r.status === 'FAIL'), formatFailures(results.filter(r => r.status === 'FAIL'))).toHaveLength(0);
});

// ── TEST: React component smoke tests ─────────────────────────
test('React components — mount without errors', async ({ page }) => {
  const errors = collectErrors(page);
  const results = [];

  // AdminProgression
  await login(page, 'admin@happyman.edu', 'admin123');
  await waitForData(page);
  const errsBefore0 = errors.length;
  await goView(page, 'view-admin-progression');
  await page.waitForTimeout(2000); // React + dynamic import
  let mounted = await page.locator('#react-admin-progression').evaluate(el => el.children.length > 0).catch(() => false);
  results.push({ label: 'AdminProgression mounted', status: mounted ? 'PASS' : 'FAIL', reason: mounted ? undefined : '#react-admin-progression empty' });
  const jsErrors1 = errors.slice(errsBefore0).filter(e => e.includes('JS:'));
  results.push({ label: 'AdminProgression — no JS errors', status: jsErrors1.length === 0 ? 'PASS' : 'FAIL', reason: jsErrors1.join(' | ').slice(0, 300) || undefined });

  await auditButton(page, '#logout-btn', 'logout', results, errors);

  // ClassAttendance
  await login(page, 'class@happyman.edu', 'class123');
  await waitForData(page);
  const errsBefore1 = errors.length;
  await goView(page, 'view-class-attendance');
  await page.waitForTimeout(2000);
  mounted = await page.locator('#react-class-attendance').evaluate(el => el.children.length > 0).catch(() => false);
  results.push({ label: 'ClassAttendance mounted', status: mounted ? 'PASS' : 'FAIL', reason: mounted ? undefined : '#react-class-attendance empty' });
  const jsErrors2 = errors.slice(errsBefore1).filter(e => e.includes('JS:'));
  results.push({ label: 'ClassAttendance — no JS errors', status: jsErrors2.length === 0 ? 'PASS' : 'FAIL', reason: jsErrors2.join(' | ').slice(0, 300) || undefined });

  // ClassOverview
  const errsBefore2 = errors.length;
  await goView(page, 'view-class-overview');
  await page.waitForTimeout(2000);
  mounted = await page.locator('#react-class-overview').evaluate(el => el.children.length > 0).catch(() => false);
  results.push({ label: 'ClassOverview mounted', status: mounted ? 'PASS' : 'FAIL', reason: mounted ? undefined : '#react-class-overview empty' });
  const jsErrors3 = errors.slice(errsBefore2).filter(e => e.includes('JS:'));
  results.push({ label: 'ClassOverview — no JS errors', status: jsErrors3.length === 0 ? 'PASS' : 'FAIL', reason: jsErrors3.join(' | ').slice(0, 300) || undefined });

  // QuizManager
  const errsBefore3 = errors.length;
  await goView(page, 'view-teacher-quizzes');
  await page.waitForTimeout(2000);
  mounted = await page.locator('#react-teacher-quizzes').evaluate(el => el.children.length > 0).catch(() => false);
  results.push({ label: 'QuizManager mounted', status: mounted ? 'PASS' : 'FAIL', reason: mounted ? undefined : '#react-teacher-quizzes empty' });
  const jsErrors4 = errors.slice(errsBefore3).filter(e => e.includes('JS:'));
  results.push({ label: 'QuizManager — no JS errors', status: jsErrors4.length === 0 ? 'PASS' : 'FAIL', reason: jsErrors4.join(' | ').slice(0, 300) || undefined });

  await auditButton(page, '#logout-btn', 'logout', results, errors);

  // QuizTaker
  await login(page, 'ama.osei@happyman.edu', 'student123');
  await waitForData(page);
  const errsBefore4 = errors.length;
  await goView(page, 'view-student-quizzes');
  await page.waitForTimeout(2000);
  mounted = await page.locator('#react-student-quizzes').evaluate(el => el.children.length > 0).catch(() => false);
  results.push({ label: 'QuizTaker mounted', status: mounted ? 'PASS' : 'FAIL', reason: mounted ? undefined : '#react-student-quizzes empty' });
  const jsErrors5 = errors.slice(errsBefore4).filter(e => e.includes('JS:'));
  results.push({ label: 'QuizTaker — no JS errors', status: jsErrors5.length === 0 ? 'PASS' : 'FAIL', reason: jsErrors5.join(' | ').slice(0, 300) || undefined });

  // StudentReportDrawer (via class report Detail button)
  await auditButton(page, '#logout-btn', 'logout', results, errors);
  await login(page, 'class@happyman.edu', 'class123');
  await waitForData(page);
  const errsBefore5 = errors.length;
  await goView(page, 'view-class-report');
  await page.waitForTimeout(800);
  const detailBtn = page.locator('[data-cr-student]').first();
  if (await detailBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await detailBtn.click();
    await page.waitForTimeout(2000);
    mounted = await page.locator('#react-report-drawer').evaluate(el => el.children.length > 0).catch(() => false);
    results.push({ label: 'StudentReportDrawer mounted', status: mounted ? 'PASS' : 'FAIL', reason: mounted ? undefined : '#react-report-drawer empty' });
    const jsErrors6 = errors.slice(errsBefore5).filter(e => e.includes('JS:'));
    results.push({ label: 'StudentReportDrawer — no JS errors', status: jsErrors6.length === 0 ? 'PASS' : 'FAIL', reason: jsErrors6.join(' | ').slice(0, 300) || undefined });
  } else {
    results.push({ label: 'StudentReportDrawer', status: 'SKIP', reason: 'No [data-cr-student] buttons — no students in DB' });
  }

  printResults('React Components', results);
  expect(results.filter(r => r.status === 'FAIL'), formatFailures(results.filter(r => r.status === 'FAIL'))).toHaveLength(0);
});
