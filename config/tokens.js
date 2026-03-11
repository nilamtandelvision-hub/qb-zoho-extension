const fs = require("fs");
const path = require("path");

const TOKEN_FILE = path.join(__dirname, "tokens.json");

// ─────────────────────────────────────────
// SAVE tokens to file (works locally)
// ─────────────────────────────────────────
function saveTokens(data) {
    try {
        fs.writeFileSync(TOKEN_FILE, JSON.stringify(data, null, 2));
    } catch (err) {
        console.warn("⚠️ Could not save tokens to file:", err.message);
    }
}

// ─────────────────────────────────────────
// LOAD tokens — tries file first, then env vars
// Render resets filesystem on restart, so env vars
// are the only reliable storage on Render
// ─────────────────────────────────────────
function loadTokens() {
    // 1. Try file first (works locally)
    if (fs.existsSync(TOKEN_FILE)) {
        try {
            const data = JSON.parse(fs.readFileSync(TOKEN_FILE));
            console.log("✅ Tokens loaded from tokens.json");
            return data;
        } catch (err) {
            console.warn("⚠️ Failed to parse tokens.json");
        }
    }

    // 2. Fall back to environment variables (works on Render after restart)
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

    console.warn("⚠️ No saved tokens found — please connect accounts");
    return null;
}

module.exports = { saveTokens, loadTokens };