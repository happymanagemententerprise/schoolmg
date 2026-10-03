// ============================================================
//  Happy Man Academy — Idempotent React mount helper
// ============================================================
import { createRoot } from 'react-dom/client';
import { AppProvider } from '../context/AppContext.jsx';
import { createElement } from 'react';

const roots = new Map();

/**
 * Mount a React component into a DOM element by container ID.
 * Calling mount() again on the same containerId re-renders
 * (updates props) without creating a second root.
 *
 * @param {string} containerId  - id of the mount-point div
 * @param {Function} Component  - React component to render
 * @param {object} props        - props to pass
 */
export function mount(containerId, Component, props = {}) {
  const container = document.getElementById(containerId);
  if (!container) {
    console.warn(`[HMA] mount: #${containerId} not found`);
    return;
  }
  if (!roots.has(containerId)) {
    roots.set(containerId, createRoot(container));
  }
  roots.get(containerId).render(
    createElement(AppProvider, null,
      createElement(Component, props)
    )
  );
}

export function unmount(containerId) {
  if (roots.has(containerId)) {
    roots.get(containerId).unmount();
    roots.delete(containerId);
  }
}
