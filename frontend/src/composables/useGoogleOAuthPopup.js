import api from '@/api';

// Opens a Google OAuth consent popup and resolves once the backend confirms
// the flow completed, by polling GET /api/google/oauth-status?state=...
// instead of relying on window.opener/postMessage from the popup, or on
// reading popup.closed from the opener.
//
// Both of those break once the popup navigates to accounts.google.com:
// Google's own pages send `Cross-Origin-Opener-Policy: same-origin`, which
// permanently severs the popup's window.opener link (and blocks the opener
// from reading properties like `.closed` on the popup) for the rest of that
// popup's lifetime in modern Chrome/Edge — regardless of any header this
// app sends. Polling our own backend from the opener tab sidesteps that
// entirely; it's a same-origin XHR unaffected by COOP.
//
// Returns { promise, cancel }. Because popup.closed can't be read either,
// there's no way to detect "the user closed the popup without finishing" —
// callers must offer the user an explicit Cancel action that calls cancel().
export function openGoogleAuthPopup(url, state, { timeoutMs = 5 * 60 * 1000, intervalMs = 1500 } = {}) {
  const popup = window.open(url, 'google-auth', 'width=520,height=620,scrollbars=yes');
  let cancelled = false;
  let timer = null;

  const promise = new Promise((resolve, reject) => {
    if (!popup) {
      reject(new Error('POPUP_BLOCKED'));
      return;
    }
    const startedAt = Date.now();
    timer = setInterval(async () => {
      if (cancelled) return;
      if (Date.now() - startedAt > timeoutMs) {
        clearInterval(timer);
        reject(new Error('TIMEOUT'));
        return;
      }
      try {
        const { data } = await api.get('/google/oauth-status', { params: { state } });
        if (data.ready) {
          clearInterval(timer);
          try { popup.close(); } catch { /* COOP may block this — user can close it manually */ }
          resolve();
        }
      } catch {
        // Transient network hiccup while polling — keep trying rather than
        // failing the whole flow over one dropped request.
      }
    }, intervalMs);
  });

  function cancel() {
    cancelled = true;
    if (timer) clearInterval(timer);
    try { popup?.close(); } catch { /* ignore — COOP may block this */ }
  }

  return { promise, cancel };
}
