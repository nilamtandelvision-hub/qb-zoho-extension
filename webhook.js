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
// Refresh QB token ONLY when needed
// ─────────────────────────────────────────
async function refreshQBToken() {
    console.log('🔄 Refreshing QB access token...');
    const refreshed = await refreshToken(global.qbTokens?.refresh_token);
    global.qbTokens = refreshed;
    saveTokens({
        qbTokens: global.qbTokens,
        qbRealmId: global.qbRealmId,
        zohoTokens: global.zohoTokens
    });
    console.log('✅ QB token refreshed successfully');
    return refreshed.access_token;
}

// ─────────────────────────────────────────
// Refresh Zoho token ONLY when needed
// ─────────────────────────────────────────
async function refreshZohoTokenIfNeeded() {
    console.log('🔄 Refreshing Zoho access token...');
    const refreshed = await refreshZohoToken(global.zohoTokens?.refresh_token);
    global.zohoTokens = { ...global.zohoTokens, ...refreshed };
    saveTokens({
        qbTokens: global.qbTokens,
        qbRealmId: global.qbRealmId,
        zohoTokens: global.zohoTokens
    });
    console.log('✅ Zoho token refreshed successfully');
    return refreshed.access_token;
}

// ─────────────────────────────────────────
// Check if error is a 401 token expired error
// ─────────────────────────────────────────
function isTokenExpiredError(err) {
    return err?.response?.status === 401 ||
        err?.status === 401 ||
        err?.message?.includes('401') ||
        err?.message?.includes('Unauthorized') ||
        err?.message?.includes('Token expired') ||
        err?.message?.includes('invalid_token');
}

// ─────────────────────────────────────────
// Sync Customer with auto-retry on 401
// ─────────────────────────────────────────
async function syncCustomerWithRetry(entity) {
    const qbToken = global.qbTokens?.access_token;
    const zohoToken = global.zohoTokens?.access_token;
    const realmId = global.qbRealmId;

    try {
        // ✅ Try with existing token first — no unnecessary refresh
        await syncSingleCustomer(qbToken, realmId, zohoToken, entity.id);
        console.log(`✅ Auto-synced Customer ID: ${entity.id} (${entity.operation})`);

    } catch (err) {
        if (isTokenExpiredError(err)) {
            // Token expired — refresh ONCE and retry
            console.log(`⚠️ Token expired for Customer ${entity.id} — refreshing...`);
            try {
                const newQBToken = await refreshQBToken();
                await syncSingleCustomer(newQBToken, realmId, zohoToken, entity.id);
                console.log(`✅ Auto-synced Customer ID: ${entity.id} (after token refresh)`);
            } catch (retryErr) {
                console.error(`❌ Customer sync failed after token refresh:`, retryErr.message);
            }
        } else {
            console.error(`❌ Customer sync failed:`, err.message);
        }
    }
}

// ─────────────────────────────────────────
// Sync Invoice with auto-retry on 401
// ─────────────────────────────────────────
async function syncInvoiceWithRetry(entity) {
    const qbToken = global.qbTokens?.access_token;
    const zohoToken = global.zohoTokens?.access_token;
    const realmId = global.qbRealmId;

    try {
        // ✅ Try with existing token first — no unnecessary refresh
        await syncSingleInvoice(qbToken, realmId, zohoToken, entity.id);
        console.log(`✅ Auto-synced Invoice ID: ${entity.id} (${entity.operation})`);

    } catch (err) {
        if (isTokenExpiredError(err)) {
            // Token expired — refresh ONCE and retry
            console.log(`⚠️ Token expired for Invoice ${entity.id} — refreshing...`);
            try {
                const newQBToken = await refreshQBToken();
                await syncSingleInvoice(newQBToken, realmId, zohoToken, entity.id);
                console.log(`✅ Auto-synced Invoice ID: ${entity.id} (after token refresh)`);
            } catch (retryErr) {
                console.error(`❌ Invoice sync failed after token refresh:`, retryErr.message);
            }
        } else {
            console.error(`❌ Invoice sync failed:`, err.message);
        }
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

    if (!verifySignature(req.rawBody || JSON.stringify(req.body), signature)) {
        console.error('❌ Invalid webhook signature — request rejected');
        return res.status(401).send('Unauthorized');
    }

    // ✅ Respond 200 IMMEDIATELY
    res.status(200).send('OK');

    if (!global.qbTokens || !global.qbRealmId || !global.zohoTokens) {
        console.warn('⚠️ Webhook received but accounts not connected. Skipping.');
        return;
    }

    const events = req.body?.eventNotifications;
    if (!events || events.length === 0) return;

    for (const event of events) {
        const entities = event?.dataChangeEvent?.entities || [];

        for (const entity of entities) {
            // Skip duplicate events
            const eventKey = `${entity.name}-${entity.id}-${entity.operation}-${entity.lastUpdated}`;
            if (isDuplicate(eventKey)) {
                console.log(`⏭️ Skipping duplicate: ${eventKey}`);
                continue;
            }

            console.log(`📥 QB Event: ${entity.operation} ${entity.name} ID: ${entity.id}`);

            // Customer
            if (entity.name === 'Customer' &&
                (entity.operation === 'Create' || entity.operation === 'Update')) {
                await syncCustomerWithRetry(entity);
            }

            // Invoice
            if (entity.name === 'Invoice' &&
                (entity.operation === 'Create' || entity.operation === 'Update')) {
                await syncInvoiceWithRetry(entity);
            }
        }
    }
}

module.exports = { handleWebhook };