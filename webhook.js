const crypto = require('crypto');
const { syncSingleCustomer, syncSingleInvoice } = require('./sync');
const { refreshToken } = require('./qbAuth');
const { refreshZohoToken } = require('./zohoAuth');
const { saveTokens } = require('./config/tokens');

// ─────────────────────────────────────────
// Guard against duplicate events
// ─────────────────────────────────────────
const processedEvents = new Set();

function isDuplicate(eventKey) {
    if (processedEvents.has(eventKey)) return true;
    processedEvents.add(eventKey);
    // Clean up after 10 minutes to avoid memory leak
    setTimeout(() => processedEvents.delete(eventKey), 10 * 60 * 1000);
    return false;
}

// ─────────────────────────────────────────
// Verify signature from QuickBooks
// ─────────────────────────────────────────
function verifySignature(rawBody, signature) {
    if (!process.env.QB_WEBHOOK_VERIFIER_TOKEN) {
        console.warn('⚠️ QB_WEBHOOK_VERIFIER_TOKEN not set — skipping verification');
        return true;
    }
    const hash = crypto
        .createHmac('sha256', process.env.QB_WEBHOOK_VERIFIER_TOKEN)
        .update(rawBody)
        .digest('base64');
    return hash === signature;
}

// ─────────────────────────────────────────
// Auto-refresh QB token if expired
// ─────────────────────────────────────────
async function getValidQBToken() {
    try {
        const refreshed = await refreshToken(global.qbTokens?.refresh_token);
        global.qbTokens = refreshed;
        saveTokens({
            qbTokens: global.qbTokens,
            qbRealmId: global.qbRealmId,
            zohoTokens: global.zohoTokens
        });
        return refreshed.access_token;
    } catch (err) {
        console.error('❌ QB token refresh failed:', err.message);
        return global.qbTokens?.access_token;
    }
}

// ─────────────────────────────────────────
// Auto-refresh Zoho token if expired
// ─────────────────────────────────────────
async function getValidZohoToken() {
    try {
        const refreshed = await refreshZohoToken(global.zohoTokens?.refresh_token);
        global.zohoTokens = { ...global.zohoTokens, ...refreshed };
        saveTokens({
            qbTokens: global.qbTokens,
            qbRealmId: global.qbRealmId,
            zohoTokens: global.zohoTokens
        });
        return refreshed.access_token;
    } catch (err) {
        console.error('❌ Zoho token refresh failed:', err.message);
        return global.zohoTokens?.access_token;
    }
}

// ─────────────────────────────────────────
// MAIN WEBHOOK HANDLER
// ─────────────────────────────────────────
async function handleWebhook(req, res) {
    const signature = req.headers['intuit-signature'];

    if (!signature) {
        console.warn('⚠️ Missing QuickBooks webhook signature');
        return res.status(400).send('Missing signature');
    }

    // Verify the request is from QuickBooks
    if (!verifySignature(req.rawBody || JSON.stringify(req.body), signature)) {
        console.error('❌ Invalid webhook signature — request rejected');
        return res.status(401).send('Unauthorized');
    }

    // ✅ Respond 200 IMMEDIATELY — prevents QuickBooks from retrying
    res.status(200).send('OK');

    // Check tokens are available
    if (!global.qbTokens || !global.qbRealmId || !global.zohoTokens) {
        console.warn('⚠️ Webhook received but accounts not connected. Skipping.');
        return;
    }

    const events = req.body?.eventNotifications;
    if (!events || events.length === 0) {
        console.log('📭 Webhook received with no events');
        return;
    }

    for (const event of events) {
        const entities = event?.dataChangeEvent?.entities || [];

        for (const entity of entities) {

            // ✅ FIX — isDuplicate is now actually called here
            const eventKey = `${entity.name}-${entity.id}-${entity.operation}-${entity.lastUpdated}`;
            if (isDuplicate(eventKey)) {
                console.log(`⏭️ Skipping duplicate: ${eventKey}`);
                continue; // skip this entity, move to next
            }

            console.log(`📥 QB Event: ${entity.operation} ${entity.name} ID: ${entity.id}`);

            // Handle Customer Create and Update
            if (entity.name === 'Customer' &&
                (entity.operation === 'Create' || entity.operation === 'Update')) {
                try {
                    const accessToken = await getValidQBToken();
                    const zohoToken = await getValidZohoToken();

                    await syncSingleCustomer(accessToken, global.qbRealmId, zohoToken, entity.id);
                    console.log(`✅ Auto-synced Customer ID: ${entity.id} (${entity.operation})`);

                } catch (err) {
                    console.error(`❌ Failed to sync Customer ID ${entity.id}:`, err.message);
                }
            }

            // Handle Invoice Create and Update
            if (entity.name === 'Invoice' &&
                (entity.operation === 'Create' || entity.operation === 'Update')) {
                try {
                    const accessToken = await getValidQBToken();
                    const zohoToken = await getValidZohoToken();

                    await syncSingleInvoice(accessToken, global.qbRealmId, zohoToken, entity.id);
                    console.log(`✅ Auto-synced Invoice ID: ${entity.id} (${entity.operation})`);

                } catch (err) {
                    console.error(`❌ Failed to sync Invoice ID ${entity.id}:`, err.message);
                }
            }
        }
    }
}

module.exports = { handleWebhook };