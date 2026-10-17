import { Data } from './data/index.js';

const base = String(import.meta.env.VITE_CAMPUS_API_URL || '').replace(/\/$/, '');
export async function campusApi(path, options = {}) {
  const token = await Data.getAccessToken();
  if (!token) throw new Error('Sign in again to continue.');
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers }
  });
  const payload = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || `Campus service returned ${response.status}.`);
  return payload;
}

export function watchCampusEvents(onEvent) {
  const controller = new AbortController();
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  (async () => {
    while (!controller.signal.aborted) {
      try {
        const token = await Data.getAccessToken();
        if (!token) throw new Error('Sign-in required.');
        const response = await fetch(`${base}/api/campus/events`, {
          headers: { Authorization: `Bearer ${token}` }, signal: controller.signal
        });
        if (!response.ok || !response.body) throw new Error(`Campus event stream returned ${response.status}.`);
        const reader = response.body.getReader(), decoder = new TextDecoder();
        let buffer = '';
        while (!controller.signal.aborted) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split('\n\n');
          buffer = frames.pop() || '';
          for (const frame of frames) {
            const event = frame.match(/^event:\s*(.+)$/m)?.[1];
            const data = frame.match(/^data:\s*(.+)$/m)?.[1];
            if (event && data && event !== 'ready') {
              try { onEvent(event, JSON.parse(data)); } catch (err) { console.warn('[campus] event handler failed:', err); }
            }
          }
        }
      } catch (err) {
        if (controller.signal.aborted) break;
        console.warn('[campus] live updates reconnecting:', err.message);
        await delay(2000);
      }
    }
  })();
  return () => controller.abort();
}
