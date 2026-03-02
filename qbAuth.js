const OAuthClient = require('intuit-oauth');
require('dotenv').config();

const oauthClient = new OAuthClient({
    clientId: process.env.QB_CLIENT_ID,
    clientSecret: process.env.QB_CLIENT_SECRET,
    environment: process.env.QB_ENVIRONMENT,
    redirectUri: process.env.QB_REDIRECT_URI,
});

// Generate QuickBooks Auth URL
function getAuthUrl() {
    return oauthClient.authorizeUri({
        scope: [OAuthClient.scopes.Accounting],
        state: 'qb_state_123',
    });
}

// Exchange auth code for access token
async function getToken(fullUrl) {
    try {
        const authResponse = await oauthClient.createToken(fullUrl);
        return authResponse.getJson();
    } catch (err) {
        console.error('QB Token Error:', err);
        throw err;
    }
}

// Refresh access token when expired
async function refreshToken(refreshToken) {
    try {
        oauthClient.setToken({ refresh_token: refreshToken });
        const response = await oauthClient.refresh();
        return response.getJson();
    } catch (err) {
        console.error('QB Refresh Error:', err);
        throw err;
    }
}

module.exports = { oauthClient, getAuthUrl, getToken, refreshToken };