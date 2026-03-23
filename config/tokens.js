// config/tokens.js
const fs = require("fs");
const path = require("path");
const axios = require("axios");

const TOKEN_FILE = path.join(__dirname, "tokens.json");

async function saveTokens(data) {
    // 1. Always save to file (works locally)
    try {
        fs.writeFileSync(TOKEN_FILE, JSON.stringify(data, null, 2));
    } catch (err) {
        console.warn("⚠️ Could not save tokens.json:", err.message);
    }

    // 2. On Render — update env vars via API so they survive restarts
    if (process.env.RENDER_API_KEY && process.env.RENDER_SERVICE_ID) {
        try {
            await axios.put(
                `https://api.render.com/v1/services/${process.env.RENDER_SERVICE_ID}/env-vars`,
                [
                    { key: 'QB_ACCESS_TOKEN', value: data.qbTokens?.access_token || '' },
                    { key: 'QB_REFRESH_TOKEN', value: data.qbTokens?.refresh_token || '' },
                    { key: 'QB_REALM_ID', value: data.qbRealmId || '' },
                    { key: 'ZOHO_ACCESS_TOKEN', value: data.zohoTokens?.access_token || '' },
                    { key: 'ZOHO_REFRESH_TOKEN', value: data.zohoTokens?.refresh_token || '' },
                ],
                {
                    headers: {
                        'Authorization': `Bearer ${process.env.RENDER_API_KEY}`,
                        'Content-Type': 'application/json'
                    }
                }
            );
            console.log("✅ Tokens saved to Render env vars");
        } catch (err) {
            console.warn("⚠️ Could not update Render env vars:", err.message);
        }
    }
}

function loadTokens() {
    if (fs.existsSync(TOKEN_FILE)) {
        try {
            const data = JSON.parse(fs.readFileSync(TOKEN_FILE));
            console.log("✅ Tokens loaded from tokens.json");
            return data;
        } catch (err) {
            console.warn("⚠️ Failed to parse tokens.json");
        }
    }

    if (process.env.QB_ACCESS_TOKEN && process.env.QB_REALM_ID && process.env.ZOHO_ACCESS_TOKEN) {
        console.log("✅ Tokens loaded from environment variables");
        return {
            qbTokens: {
                access_token: process.env.QB_ACCESS_TOKEN,
                refresh_token: process.env.QB_REFRESH_TOKEN,
            },
            qbRealmId: process.env.QB_REALM_ID,
            zohoTokens: {
                access_token: process.env.ZOHO_ACCESS_TOKEN,
                refresh_token: process.env.ZOHO_REFRESH_TOKEN,
            }
        };
    }

    console.warn("⚠️ No saved tokens found");
    return null;
}

module.exports = { saveTokens, loadTokens };