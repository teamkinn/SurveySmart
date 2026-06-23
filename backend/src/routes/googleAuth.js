const router = require('express').Router();
const { getClient, storeTokens } = require('../services/googleAuth');

// GET /auth/google/callback
router.get('/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code || !state) return res.status(400).send('Missing code or state');
  try {
    const client = getClient();
    const { tokens } = await client.getToken(code);
    storeTokens(state, tokens);
    res.send(`<!DOCTYPE html><html><body><script>
      if (window.opener) {
        window.opener.postMessage({ type: 'google-oauth-done', state: '${state}' }, '*');
      }
      window.close();
    </script></body></html>`);
  } catch (e) {
    console.error('Google OAuth error:', e.message);
    res.status(500).send('Google authorization failed. Please close this window and try again.');
  }
});

module.exports = router;
