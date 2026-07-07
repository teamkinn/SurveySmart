const { google } = require('googleapis');
const db = require('../config/db');
const { getClient } = require('./googleAuth');
const { pullFormResponses } = require('./googleFormsSync');

const DEFAULT_INTERVAL_MS = 15 * 60 * 1000;
let running = false;

async function pollOnce() {
  if (running) return;
  running = true;
  try {
    const [surveys] = await db.query(
      'SELECT id, google_form_id, google_refresh_token FROM surveys WHERE google_form_id IS NOT NULL AND google_refresh_token IS NOT NULL'
    );

    for (const survey of surveys) {
      try {
        const client = getClient();
        client.setCredentials({ refresh_token: survey.google_refresh_token });
        const forms = google.forms({ version: 'v1', auth: client });

        const { synced, skipped } = await pullFormResponses(forms, survey.google_form_id, survey.id);
        await db.query('UPDATE surveys SET last_synced_at = NOW() WHERE id = ?', [survey.id]);
        if (synced) {
          console.log(`[form-sync-poller] survey ${survey.id}: +${synced} new (${skipped} already synced)`);
        }
      } catch (e) {
        const reason = e.response?.data?.error || e.code;
        console.error(`[form-sync-poller] survey ${survey.id} failed:`, e.message);
        // The refresh token was revoked or is otherwise permanently invalid —
        // stop retrying with it until the user re-authorizes via manual sync.
        // This UPDATE has its own try/catch so a transient DB hiccup here
        // can't escape and abort the rest of the surveys in this poll cycle.
        if (reason === 'invalid_grant') {
          try {
            await db.query('UPDATE surveys SET google_refresh_token = NULL WHERE id = ?', [survey.id]);
          } catch (cleanupErr) {
            console.error(`[form-sync-poller] survey ${survey.id} token cleanup failed:`, cleanupErr.message);
          }
        }
      }
    }
  } catch (e) {
    // Never let a failure here (e.g. MySQL not reachable yet, especially
    // right after boot) escape as an unhandled rejection — that would crash
    // the whole process, taking the API down along with the poller.
    console.error('[form-sync-poller] pollOnce failed:', e.message);
  } finally {
    running = false;
  }
}

function start() {
  if (process.env.GOOGLE_SYNC_POLL_ENABLED === 'false') return;
  const intervalMs = parseInt(process.env.GOOGLE_SYNC_POLL_INTERVAL_MS, 10) || DEFAULT_INTERVAL_MS;
  setInterval(pollOnce, intervalMs);
  // Run one pass shortly after boot rather than waiting a full interval.
  setTimeout(pollOnce, 30 * 1000);
  console.log(`[form-sync-poller] started, polling every ${Math.round(intervalMs / 1000)}s`);
}

module.exports = { start, pollOnce };
