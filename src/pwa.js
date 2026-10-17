import { Data } from './data/index.js';
import { toast } from './utils.js';

const apiBase = String(import.meta.env.VITE_CAMPUS_API_URL || '').replace(/\/$/, '');
let installPrompt = null;

export function initPWA() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(err => console.warn('[PWA] Service worker unavailable:', err.message));
  const installButton = document.getElementById('install-app-btn');
  const pushButton = document.getElementById('push-enable-btn');
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault(); installPrompt = event;
    if (installButton) installButton.hidden = false;
  });
  installButton?.addEventListener('click', async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    installPrompt = null; installButton.hidden = true;
  });
  pushButton?.addEventListener('click', subscribeToPush);
  window.addEventListener('appinstalled', () => { if (installButton) installButton.hidden = true; });
}

export async function showPWAActions() {
  const button = document.getElementById('push-enable-btn');
  if (!button || !('PushManager' in window) || !('serviceWorker' in navigator)) { if (button) button.hidden = true; return; }
  const registration = await navigator.serviceWorker.ready.catch(() => null);
  const subscription = await registration?.pushManager.getSubscription().catch(() => null);
  button.hidden = Notification.permission === 'granted' && !!subscription;
}

async function subscribeToPush() {
  const button = document.getElementById('push-enable-btn');
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) throw new Error('Push notifications are not supported by this browser.');
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') throw new Error('Allow notifications in your browser settings to enable attendance reminders.');
    const token = await Data.getAccessToken();
    const keyResponse = await fetch(`${apiBase}/api/push/vapid-public-key`, { headers: { Authorization: `Bearer ${token}` } });
    const { publicKey, error } = await keyResponse.json();
    if (!keyResponse.ok) throw new Error(error || 'Push service is not configured.');
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeKey(publicKey) });
    const response = await fetch(`${apiBase}/api/push/subscribe`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ subscription })
    });
    if (!response.ok) { const result = await response.json().catch(() => ({})); throw new Error(result.error || 'Could not save this device for alerts.'); }
    button.hidden = true; toast('Attendance notifications enabled.');
  } catch (err) { toast(err.message || 'Could not enable notifications.', 'error'); }
}

function decodeKey(value) {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const raw = atob((value + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, character => character.charCodeAt(0));
}
