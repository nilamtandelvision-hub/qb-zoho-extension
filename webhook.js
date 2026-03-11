const crypto = require('crypto');
const { syncSingleCustomer } = require('./sync');
const { refreshToken } = require('./qbAuth');
const { refreshZohoToken } = require('./zohoAuth');

// ─────────────────────────────────────────
// FIX #2 — Verify signature from QuickBooks
// Prevents fake/malicious webhook requests
// ─────────────────────────────────────────
function verifySignature(rawBody, signature) {
    if (!process.env.QB_WEBHOOK_VERIFIER_TOKEN) {
        console.warn('⚠️ QB_WEBHOOK_VERIFIER_TOKEN not set — skipping verification');
        return true; // allow through if token not configured yet
    }
    const hash = crypto
        .createHmac('sha256', process.env.QB_WEBHOOK_VERIFIER_TOKEN)
        .update(rawBody)
        .digest('base64');
    return hash === signature;
}

// ─────────────────────────────────────────
// FIX #5 — Auto-refresh QB token if expired
// ─────────────────────────────────────────
async function getValidQBToken() {
    try {
        const refreshed = await refreshToken(global.qbTokens?.refresh_token);
        global.qbTokens = refreshed;
        return refreshed.access_token;
    } catch (err) {
        console.error('❌ QB token refresh failed:', err.message);
        // Fall back to existing token
        return global.qbTokens?.access_token;
    }
}

// ─────────────────────────────────────────
// FIX #5 — Auto-refresh Zoho token if expired
// ─────────────────────────────────────────
async function getValidZohoToken() {
    try {
        const refreshed = await refreshZohoToken(global.zohoTokens?.refresh_token);
        global.zohoTokens = { ...global.zohoTokens, ...refreshed };
        return refreshed.access_token;
    } catch (err) {
        console.error('❌ Zoho token refresh failed:', err.message);
        // Fall back to existing token
        return global.zohoTokens?.access_token;
    }
}

// ─────────────────────────────────────────
// MAIN WEBHOOK HANDLER
// ─────────────────────────────────────────
async function handleWebhook(req, res) {
    const signature = req.headers['intuit-signature'];

    // FIX #2 — Verify the request is from QuickBooks
    if (!verifySignature(req.rawBody || JSON.stringify(req.body), signature)) {
        console.error('❌ Invalid webhook signature — request rejected');
        return res.status(401).send('Unauthorized');
    }

    // FIX #3 — Respond 200 IMMEDIATELY before any processing
    // QuickBooks requires response within 3 seconds or marks as failed
    res.status(200).send('Webhook received');

    // Check tokens available
    if (!global.qbTokens || !global.qbRealmId || !global.zohoTokens) {
        console.warn('⚠️ Webhook received but accounts not connected. Skipping.');
        return;
    }

    const events = req.body?.eventNotifications;
    if (!events || events.length === 0) {
        console.log('📭 Webhook received with no events');
        return;
    }

    // Process events asynchronously after responding
    for (const event of events) {
        const entities = event?.dataChangeEvent?.entities || [];

        for (const entity of entities) {
            console.log(`📥 QB Event: ${entity.operation} ${entity.name} ID: ${entity.id}`);

            // FIX #4 — Handle both Create AND Update operations
            if (entity.name === 'Customer' &&
                (entity.operation === 'Create' || entity.operation === 'Update')) {

                try {
                    // FIX #5 — Refresh tokens before using them
                    const accessToken = await getValidQBToken();
                    const zohoToken = await getValidZohoToken();
                    const realmId = global.qbRealmId;

                    await syncSingleCustomer(accessToken, realmId, zohoToken, entity.id);
                    console.log(`✅ Auto-synced Customer ID: ${entity.id} (${entity.operation})`);

                } catch (err) {
                    console.error(`❌ Failed to sync Customer ID ${entity.id}:`, err.message);
                }
            }
        }
    }
}

module.exports = { handleWebhook };