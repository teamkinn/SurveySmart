const { google } = require('googleapis');

const tokenStore = new Map();

function getClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/auth/google/callback'
  );
}

function storeTokens(state, tokens) { tokenStore.set(state, tokens); }
function getTokens(state)           { return tokenStore.get(state); }
function removeTokens(state)        { tokenStore.delete(state); }

module.exports = { getClient, storeTokens, getTokens, removeTokens };
