// ============================================================
//  Happy Man Academy — Idempotent React mount helper
// ============================================================
import { createRoot } from 'react-dom/client';
import { AppProvider } from '../context/AppContext.jsx';
import { Component, createElement } from 'react';

const roots = new Map();

class ViewErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() { return { failed: true }; }

  componentDidCatch(error, info) {
    console.error('[HMA] A view failed to render:', error, info?.componentStack || '');
  }

  render() {
    if (this.state.failed) {
      return createElement('section', { className: 'panel mt16 section-load-error', role: 'alert' },
        createElement('h2', null, 'This section could not load'),
        createElement('p', { className: 'role-muted' }, 'A page-data or app-loading error interrupted this section. Reload the app to recover the latest data and files.'),
        createElement('button', { className: 'outline-button', type: 'button', onClick: () => window.location.reload() }, 'Reload app')
      );
    }
    return this.props.children;
  }
}

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
    createElement(ViewErrorBoundary, null,
      createElement(AppProvider, null,
        createElement(Component, props)
      )
    )
  );
}

export function unmount(containerId) {
  if (roots.has(containerId)) {
    roots.get(containerId).unmount();
    roots.delete(containerId);
  }
}
