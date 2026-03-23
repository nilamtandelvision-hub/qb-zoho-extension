const OAuthClient = require('intuit-oauth');

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
async function refreshToken(currentRefreshToken) {
    try {
        oauthClient.setToken({ refresh_token: currentRefreshToken });
        const response = await oauthClient.refresh();
        const tokens = response.getJson();
        // QB always returns a new refresh_token — must save it
        return {
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token || currentRefreshToken,
            expires_in: tokens.expires_in,
        };
    } catch (err) {
        console.error('QB Refresh Error:', err.response?.data || err.message);
        throw err;
    }
}

module.exports = { oauthClient, getAuthUrl, getToken, refreshToken };