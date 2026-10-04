// ============================================================
//  Happy Man Academy — Previous Session Cache
//
//  Lazy-fetch + LRU cache (max 50 entries) for previous-session
//  grade and attendance data.  Uses its own Supabase client
//  (publishable anon key) because _sb in data.js is module-private
//  and not exposed on window.
// ============================================================

import { createClient } from '@supabase/supabase-js';

const _sb = createClient(
  'https://erlhyrswcqpqpqzbgmgb.supabase.co',
  'sb_publishable_khuN_STEq5Pi5VqpfpqYzw_FvHQAgPj'
);

// ── LRU cache ────────────────────────────────────────────────
// Map preserves insertion order.  Oldest entry = first key.
const MAX_ENTRIES = 50;
const _cache = new Map();

function _cacheSet(key, value) {
  // Move to end (newest) on re-insert
  if (_cache.has(key)) _cache.delete(key);
  // Evict oldest entry when at capacity
  if (_cache.size >= MAX_ENTRIES) {
    _cache.delete(_cache.keys().next().value);
  }
  _cache.set(key, value);
}

function _cacheGet(key) {
  if (!_cache.has(key)) return null;
  const value = _cache.get(key);
  // Move to end (LRU: re-insert to mark as recently used)
  _cache.delete(key);
  _cache.set(key, value);
  return value;
}

// ── Exports ──────────────────────────────────────────────────

/**
 * Returns the list of closed previous sessions that have at least
 * one grade row for the given student.
 *
 * @param {string|number} studentId
 * @returns {Promise<Array>}  session rows from the sessions table
 */
export async function getSessionsWithData(studentId) {
  // Fetch all closed, non-current sessions
  const { data: sessions, error: sessErr } = await _sb
    .from('sessions')
    .select('*')
    .eq('is_current', false)
    .eq('is_closed', true)
    .order('created_at', { ascending: false });

  if (sessErr) throw new Error('[prevSessionCache] getSessionsWithData sessions: ' + sessErr.message);
  if (!sessions || sessions.length === 0) return [];

  // Filter to sessions that actually have grade data for this student
  const result = [];
  for (const session of sessions) {
    // Fetch term ids for this session
    const { data: terms, error: termErr } = await _sb
      .from('terms')
      .select('id')
      .eq('session_id', session.id);

    if (termErr) throw new Error('[prevSessionCache] getSessionsWithData terms: ' + termErr.message);
    if (!terms || terms.length === 0) continue;

    const termIds = terms.map(t => t.id);

    // Count grade rows for this student in these terms
    const { count, error: gradeErr } = await _sb
      .from('grades')
      .select('id', { count: 'exact', head: true })
      .in('term_id', termIds)
      .eq('student_id', studentId);

    if (gradeErr) throw new Error('[prevSessionCache] getSessionsWithData grades count: ' + gradeErr.message);

    if (count && count > 0) {
      result.push(session);
    }
  }

  return result;
}

/**
 * Fetches full grade + attendance data for one (student, session) pair.
 * Results are cached; a second call for the same pair reads from cache.
 *
 * Returned shape:
 * {
 *   terms:           Array   — raw term rows for the session
 *   gradesByTerm:    Object  — { [termNumber]: [{subject_id, test, exam}] }
 *   attendanceByTerm:Object  — { [termNumber]: { [week_label]: days_present } }
 *   fetchedAt:       number  — Date.now() at fetch time
 * }
 *
 * @param {string|number} studentId
 * @param {string|number} sessionId
 * @returns {Promise<Object>}
 */
export async function fetchPrevSession(studentId, sessionId) {
  const cacheKey = `${studentId}:${sessionId}`;

  // Cache hit — return immediately
  const cached = _cacheGet(cacheKey);
  if (cached) return cached;

  // ── 1. Fetch terms for this session ────────────────────────
  const { data: terms, error: termErr } = await _sb
    .from('terms')
    .select('*')
    .eq('session_id', sessionId);

  if (termErr) throw new Error('[prevSessionCache] fetchPrevSession terms: ' + termErr.message);
  if (!terms || terms.length === 0) {
    const empty = { terms: [], gradesByTerm: {}, attendanceByTerm: {}, fetchedAt: Date.now() };
    _cacheSet(cacheKey, empty);
    return empty;
  }

  const termIds = terms.map(t => t.id);

  // Build a lookup: term.id → term.term (integer 1/2/3)
  const termNumberById = {};
  for (const t of terms) {
    termNumberById[t.id] = t.term;
  }

  // ── 2. Fetch grades ─────────────────────────────────────────
  const { data: grades, error: gradeErr } = await _sb
    .from('grades')
    .select('*')
    .in('term_id', termIds)
    .eq('student_id', studentId);

  if (gradeErr) throw new Error('[prevSessionCache] fetchPrevSession grades: ' + gradeErr.message);

  // ── 3. Fetch attendance ─────────────────────────────────────
  const { data: attendance, error: attErr } = await _sb
    .from('attendance_weekly')
    .select('*')
    .in('term_id', termIds)
    .eq('student_id', studentId);

  if (attErr) throw new Error('[prevSessionCache] fetchPrevSession attendance: ' + attErr.message);

  // ── 4. Build gradesByTerm keyed by term number (1/2/3) ──────
  const gradesByTerm = {};
  for (const g of grades || []) {
    const termNum = termNumberById[g.term_id];
    if (termNum == null) continue;
    if (!gradesByTerm[termNum]) gradesByTerm[termNum] = [];
    gradesByTerm[termNum].push({
      subject_id: g.subject_id,
      test:       g.test,
      exam:       g.exam
    });
  }

  // ── 5. Build attendanceByTerm keyed by term number (1/2/3) ──
  const attendanceByTerm = {};
  for (const a of attendance || []) {
    const termNum = termNumberById[a.term_id];
    if (termNum == null) continue;
    if (!attendanceByTerm[termNum]) attendanceByTerm[termNum] = {};
    // week_label → days_present
    attendanceByTerm[termNum][a.week_label] = a.days_present;
  }

  // ── 6. Cache and return ─────────────────────────────────────
  const payload = {
    terms,
    gradesByTerm,
    attendanceByTerm,
    fetchedAt: Date.now()
  };
  _cacheSet(cacheKey, payload);
  return payload;
}

/**
 * Clears the entire in-memory cache.
 * Should be called on logout so stale data is never served to the
 * next user that logs in on the same browser session.
 */
export function clearPrevSessionCache() {
  _cache.clear();
}
