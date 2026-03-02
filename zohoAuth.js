const axios = require('axios');
require('dotenv').config();

// Generate Zoho Auth URL
function getZohoAuthUrl() {
    const params = new URLSearchParams({
        client_id: process.env.ZOHO_CLIENT_ID,
        redirect_uri: process.env.ZOHO_REDIRECT_URI,
        response_type: 'code',
        scope: 'ZohoCRM.modules.ALL',
        access_type: 'offline', // needed to get refresh token
    });
    return `https://accounts.zoho.com/oauth/v2/auth?${params.toString()}`;
}

// Exchange auth code for access token
async function getZohoToken(authCode) {
    try {
        const response = await axios.post(
            'https://accounts.zoho.com/oauth/v2/token',
            null,
            {
                params: {
                    code: authCode,
                    client_id: process.env.ZOHO_CLIENT_ID,
                    client_secret: process.env.ZOHO_CLIENT_SECRET,
                    redirect_uri: process.env.ZOHO_REDIRECT_URI,
                    grant_type: 'authorization_code',
                },
            }
        );
        return response.data;
    } catch (err) {
        console.error('Zoho Token Error:', err.response?.data || err.message);
        throw err;
    }
}

// Refresh Zoho access token when expired
async function refreshZohoToken(refreshToken) {
    try {
        const response = await axios.post(
            'https://accounts.zoho.com/oauth/v2/token',
            null,
            {
                params: {
                    refresh_token: refreshToken,
                    client_id: process.env.ZOHO_CLIENT_ID,
                    client_secret: process.env.ZOHO_CLIENT_SECRET,
                    grant_type: 'refresh_token',
                },
            }
        );
        return response.data;
    } catch (err) {
        console.error('Zoho Refresh Error:', err.response?.data || err.message);
        throw err;
    }
}

module.exports = { getZohoAuthUrl, getZohoToken, refreshZohoToken };