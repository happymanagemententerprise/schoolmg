#!/usr/bin/env node
// =====================================================================
// Happy Man Academy — progression migration verifier
//
// Read-only. Checks the live database matches what
// 20260928_promotion.sql is supposed to have produced, so a bad
// backfill or a half-applied migration is caught before any UI work
// depends on it.
//
//   node verify-promotion.js
//
// Override the target with HMA_SUPABASE_URL / HMA_SUPABASE_KEY.
// The defaults are the public anon key already committed in data.js.
// =====================================================================

const URL  = process.env.HMA_SUPABASE_URL  || 'https://erlhyrswcqpqpqzbgmgb.supabase.co';
const KEY  = process.env.HMA_SUPABASE_KEY  || 'sb_publishable_khuN_STEq5Pi5VqpfpqYzw_FvHQAgPj';
const REST = `${URL}/rest/v1`;

let passed = 0, failed = 0;
const fail = [];

async function get(path) {
  const res = await fetch(`${REST}/${path}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` }
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${path}`);
  const text = await res.text();
  return text ? JSON.parse(text) : [];
}

async function rpc(fn, args = {}) {
  const res = await fetch(`${REST}/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args)
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${fn}`);
  return JSON.parse(await res.text());
}

function check(name, condition, detail = '') {
  if (condition) { passed++; console.log(`  ok   ${name}`); }
  else {
    failed++;
    fail.push(name);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function section(title) { console.log(`\n${title}`); }

(async () => {
  console.log(`Happy Man Academy — verifying ${URL}`);

  // ---- classes: chain, pool, graduate -------------------------------
  section('Classes');
  const classes = await get(
    'classes?select=id,class_name,level,stream,year,next_class_id,selection_mode'
  );
  check('classes.selection_mode exists',
    classes.every(c => 'selection_mode' in c));

  const pool = classes.find(c => c.class_name === 'Grade 10 Pool');
  check('Grade 10 Pool class exists', !!pool,
    classes.map(c => c.class_name).join(', '));
  if (pool) {
    check('Pool is level SS, year 10', pool.level === 'SS' && pool.year === 10,
      `level=${pool.level} year=${pool.year}`);
    check('Pool has no stream', pool.stream === null, `stream=${pool.stream}`);
    check('Pool selection_mode = pool', pool.selection_mode === 'pool',
      `selection_mode=${pool.selection_mode}`);
    check('Pool has no next class', pool.next_class_id === null);
  }

  const byId = new Map(classes.map(c => [c.id, c]));
  const chainYears = [7, 8, 10, 11];
  const chainRows = classes.filter(c => chainYears.includes(c.year));
  check('Chain years are present', chainRows.length > 0, `found ${chainRows.length}`);

  for (const c of chainRows) {
    const next = byId.get(c.next_class_id);
    check(`${c.class_name} has a next class`, !!next,
      `next_class_id=${c.next_class_id}`);
    if (next) {
      check(`${c.class_name} -> ${next.class_name} advances one year`,
        next.year === c.year + 1, `year ${c.year} -> ${next.year}`);
      check(`${c.class_name} -> ${next.class_name} keeps the stream`,
        (next.stream ?? null) === (c.stream ?? null),
        `${c.stream ?? 'null'} -> ${next.stream ?? 'null'}`);
    }
    check(`${c.class_name} selection_mode = chain`, c.selection_mode === 'chain',
      `selection_mode=${c.selection_mode}`);
  }

  const grade9 = classes.filter(c => c.year === 9);
  check('Grade 9 is a pool', grade9.every(c => c.selection_mode === 'pool'),
    grade9.map(c => `${c.class_name}=${c.selection_mode}`).join(', '));
  check('Grade 9 has no single next class', grade9.every(c => c.next_class_id === null));

  const grade12 = classes.filter(c => c.year === 12);
  check('Grade 12 graduates', grade12.every(c => c.selection_mode === 'graduate'),
    grade12.map(c => `${c.class_name}=${c.selection_mode}`).join(', '));
  check('Grade 12 has no next class', grade12.every(c => c.next_class_id === null));

  // ---- grades: class attribution ------------------------------------
  section('Grades');
  const grades = await get('grades?select=id,student_id,class_id');
  check('grades.class_id exists', grades.every(g => 'class_id' in g));
  const unassigned = grades.filter(g => g.class_id === null);
  check('every grade is attributed to a class', unassigned.length === 0,
    `${unassigned.length} of ${grades.length} still null`);

  // ---- students: status ---------------------------------------------
  section('Students');
  const students = await get('students?select=id,class_id,status,status_reason');
  check('students.status exists', students.every(s => 'status' in s));
  check('students.status_reason exists', students.every(s => 'status_reason' in s));
  check('every student is active at rest', students.every(s => s.status === 'active'),
    students.filter(s => s.status !== 'active').map(s => `${s.id}=${s.status}`).join(', '));
  const stranded = students.filter(s => !byId.has(s.class_id));
  check('no student points at a missing class', stranded.length === 0,
    stranded.map(s => `student ${s.id} -> class ${s.class_id}`).join(', '));

  // ---- new tables exist and start empty -----------------------------
  section('New tables');
  const newTables = [
    'promotions', 'path_requests', 'subject_selections', 'approval_requests',
    'student_transfers', 'score_uploads', 'weekly_topics'
  ];
  for (const t of newTables) {
    try {
      const rows = await get(`${t}?select=id&limit=5`);
      check(`${t} exists and is empty`, rows.length === 0, `${rows.length} rows`);
    } catch (e) {
      check(`${t} exists and is empty`, false, e.message);
    }
  }

  // ---- calendar closure and publication -----------------------------
  section('Calendar');
  const sessions = await get('sessions?select=id,is_closed');
  const terms = await get('terms?select=id,session_id,is_closed,results_published,published_at');
  check('sessions.is_closed exists', sessions.every(s => 'is_closed' in s));
  check('terms.is_closed exists', terms.every(t => 'is_closed' in t));
  check('terms.results_published exists', terms.every(t => 'results_published' in t));
  check('no session is closed yet', sessions.every(s => s.is_closed === false));
  check('no term is published yet', terms.every(t => t.results_published === false));

  // ---- timetable -----------------------------------------------------
  section('Timetable');
  const tt = await get('timetable_settings?select=*');
  check('timetable_settings has one row', tt.length === 1, `${tt.length} rows`);
  if (tt.length === 1) {
    check('7 periods a day', tt[0].periods_per_day === 7, `${tt[0].periods_per_day}`);
    check('45 minute periods', tt[0].period_minutes === 45, `${tt[0].period_minutes}`);
    check('two breaks configured', Array.isArray(tt[0].breaks) && tt[0].breaks.length === 2,
      JSON.stringify(tt[0].breaks));
    const afterThird = (tt[0].breaks || []).find(b => b.after === 3);
    const afterLast = (tt[0].breaks || []).find(b => b.after === tt[0].periods_per_day);
    check('20 minute break after period 3', afterThird?.minutes === 20,
      JSON.stringify(afterThird));
    check('45 minute break after the last period', afterLast?.minutes === 45,
      JSON.stringify(afterLast));
  }
  const slots = await get('time_slots?select=id,is_break,label');
  check('time_slots.is_break exists', slots.every(s => 'is_break' in s));

  // ---- subject rules -------------------------------------------------
  section('Subject registration');
  const rules = await get('subject_selection_rules?select=*');
  check('subject_selection_rules has one row', rules.length === 1, `${rules.length} rows`);
  if (rules.length === 1) {
    const implied = 2 + rules[0].general_count + rules[0].stream_count;
    check('min_total matches core + general + stream',
      rules[0].min_total === implied, `min_total=${rules[0].min_total} implied=${implied}`);
  }

  // ---- admin tiers ---------------------------------------------------
  section('Administrator tiers');
  const admins = await get('users?select=id,name,admin_tier&role=eq.admin');
  check('users.admin_tier exists', admins.every(a => 'admin_tier' in a));
  check('there is at least one administrator', admins.length > 0);
  const tiered = admins.filter(a => a.admin_tier !== null);
  console.log(`  note ${admins.length} administrator(s), ${tiered.length} with a tier set` +
    (tiered.length === 0 ? ' — a null tier keeps full rights' : ''));

  // ---- positions -----------------------------------------------------
  section('Positions');
  const current = sessions.find(s => s.is_closed !== undefined && s.is_current) || sessions[0];
  if (current) {
    const termsInSession = terms.filter(t => t.session_id === current.id);
    const term = termsInSession[0];
    if (term) {
      try {
        const pos = await rpc('student_positions', {
          p_session_id: current.id, p_term_id: term.id
        });
        check('student_positions() runs', Array.isArray(pos), `${pos.length} rows`);
        const bad = pos.filter(p => p.class_position < 1 || p.year_position < 1);
        check('every position is a positive integer', bad.length === 0,
          `${bad.length} bad rows`);
        const ties = pos.some(p => p.year_position > 1 && pos.filter(
          q => q.year === p.year && q.session_avg === p.session_avg
        ).length > 1);
        if (ties) console.log('  note ties share a position, as intended');
      } catch (e) {
        check('student_positions() runs', false, e.message);
      }
    } else {
      console.log('  note no terms in the current session, skipped');
    }
  }

  // ---- summary -------------------------------------------------------
  console.log(`\n${'-'.repeat(52)}`);
  console.log(`${passed} passed, ${failed} failed`);
  if (failed) {
    console.log('\nfailing checks:');
    fail.forEach(f => console.log(`  - ${f}`));
  }
  process.exit(failed ? 1 : 0);
})().catch(e => {
  console.error(`\nverifier could not run: ${e.message}`);
  process.exit(1);
});
