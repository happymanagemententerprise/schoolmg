// ============================================================
//  Happy Man Academy — Shared student report drawer
// ============================================================

import { Data } from '../data/index.js';
import { mount } from '../react/mount.js';
import StudentReportDrawer from '../react/components/StudentReportDrawer.jsx';

export function openStudentReport(studentId, termOverride = null) {
  const s = Data.student(studentId);
  if (!s) return;
  // React component handles the drawer open + all rendering.
  // The 'term' prop name matches the component's prop signature.
  mount('react-report-drawer', StudentReportDrawer, { studentId, term: termOverride ?? null });
  // openDrawer() is called by the component's useEffect
}
