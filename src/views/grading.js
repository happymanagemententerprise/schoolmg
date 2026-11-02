// ============================================================
//  Happy Man Academy — Dynamic grading configuration (admin)
//
//  Per school-level (JSS / SSS) assessment components with custom max
//  scores. The calculation rule is enforced by grading_compute() in the
//  database (see 20261026000000_platform_modules.sql): direct sum when
//  the total max is 100, average over active components when it exceeds 100.
// ============================================================

import { Data } from '../data/index.js';
import { getCurrentUser } from '../state.js';
import { $, $all, esc, toast } from '../utils.js';
import { isAdmin } from '../auth.js';

let _gsStructures = {};   // level -> [{ key, label, max }]
let _gsLoaded = false;

const DEFAULT_COMPONENTS = () => [
  { key: 'ca1',  label: 'CA 1', max: 20 },
  { key: 'ca2',  label: 'CA 2', max: 20 },
  { key: 'exam', label: 'Exam', max: 60 }
];

export async function renderAdminGrading() {
  if (!isAdmin(getCurrentUser())) return;
  const levelSel = $('gs-level');
  if (!_gsLoaded) {
    try {
      const rows = await Data.gradingStructures();
      _gsStructures = {};
      for (const r of (rows || [])) {
        _gsStructures[r.school_level] = Array.isArray(r.components) ? r.components : [];
      }
    } catch (e) {
      toast(e.message || 'Could not load grading configuration.', 'error');
    }
    _gsLoaded = true;
  }
  if (!_gsStructures[levelSel.value]) _gsStructures[levelSel.value] = DEFAULT_COMPONENTS();
  drawGrading();

  levelSel.onchange = () => {
    if (!_gsStructures[levelSel.value]) _gsStructures[levelSel.value] = DEFAULT_COMPONENTS();
    drawGrading();
  };
  $('gs-add').onclick = () => {
    _gsStructures[levelSel.value].push({ key: '', label: '', max: 0 });
    drawGrading();
  };
  $('gs-save').onclick = saveGrading;
}

function drawGrading() {
  const level = $('gs-level').value;
  const comps = _gsStructures[level] || [];
  $('gs-components').innerHTML = comps.map((c, i) => `<tr>
    <td><input class="gs-label" data-i="${i}" value="${esc(c.label || '')}" placeholder="Label"></td>
    <td><input class="gs-key"   data-i="${i}" value="${esc(c.key || '')}" placeholder="key"></td>
    <td><input class="gs-max"    data-i="${i}" type="number" min="0" value="${Number(c.max || 0)}" placeholder="0"></td>
    <td><button class="text-button gs-del" data-i="${i}" type="button">Remove</button></td>
  </tr>`).join('');

  $all('.gs-del').forEach(b => b.onclick = () => {
    comps.splice(Number(b.dataset.i), 1);
    drawGrading();
  });
  $all('.gs-label').forEach(inp => inp.oninput = () => { comps[Number(inp.dataset.i)].label = inp.value; });
  $all('.gs-key').forEach(inp => inp.oninput = () => { comps[Number(inp.dataset.i)].key = inp.value; });
  $all('.gs-max').forEach(inp => inp.oninput = () => {
    comps[Number(inp.dataset.i)].max = Number(inp.value) || 0;
    updateGradingTotal();
  });
  updateGradingTotal();
}

function updateGradingTotal() {
  const comps = _gsStructures[$('gs-level').value] || [];
  const total = comps.reduce((sum, c) => sum + (Number(c.max) || 0), 0);
  $('gs-total').textContent = `Total max: ${total}`;
  $('gs-rule').textContent =
    total === 100 ? 'Rule: direct sum of component scores (total max = 100).'
    : total > 100 ? `Rule: average over ${comps.length} active components (total max ${total} > 100).`
    : total > 0  ? `Rule: scale scores to 100 (total max ${total}).`
    : 'Add components to see the calculation rule.';
}

async function saveGrading() {
  const level = $('gs-level').value;
  const comps = (_gsStructures[level] || [])
    .map(c => ({ key: (c.key || '').trim(), label: (c.label || '').trim(), max: Number(c.max) || 0 }))
    .filter(c => c.label || c.max > 0);
  if (!comps.length) { toast('Add at least one component.', 'error'); return; }

  const btn = $('gs-save');
  btn.disabled = true; btn.textContent = 'Saving…';
  const fb = $('gs-feedback'); fb.hidden = true;
  try {
    await Data.saveGradingStructure(level, comps);
    _gsStructures[level] = comps;
    toast('Grading configuration saved.', 'success');
    updateGradingTotal();
  } catch (e) {
    fb.hidden = false; fb.textContent = e.message || 'Could not save.';
    fb.classList.add('error');
    toast(e.message || 'Could not save.', 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Save configuration';
  }
}
