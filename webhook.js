const crypto = require('crypto');
const { syncSingleCustomer, syncSingleInvoice } = require('./sync');
const { deleteZohoContact, deleteZohoDeal } = require('./zohoService');
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
// Refresh QB token and save to global + file + Render
// ─────────────────────────────────────────
// ─────────────────────────────────────────
// Refresh QB token and save to global + file + Render
// ─────────────────────────────────────────
async function refreshQBToken() {
    console.log('🔄 Refreshing QB access token...');
    try {
        const refreshed = await refreshToken(global.qbTokens?.refresh_token);
        global.qbTokens = {
            ...global.qbTokens,
            access_token: refreshed.access_token,
            refresh_token: refreshed.refresh_token,
            expires_in: refreshed.expires_in,
        };
        await saveTokens({
            qbTokens: global.qbTokens,
            qbRealmId: global.qbRealmId,
            zohoTokens: global.zohoTokens
        });
        console.log('✅ QB token refreshed and saved');
    } catch (err) {
        // ✅ If refresh token is invalid — clear tokens and alert
        if (err.message?.includes('invalid') ||
            err.message?.includes('Authorize') ||
            err.message?.includes('401')) {
            console.error('🚨 QB refresh token EXPIRED — re-authorization required!');
            console.error('🚨 Visit https://qb-zoho-extension.onrender.com to reconnect QuickBooks');
            global.qbTokens = null; // clear so status shows disconnected
        }
        throw err;
    }
}

// ─────────────────────────────────────────
// Refresh Zoho token and save to global + file + Render
// ─────────────────────────────────────────
async function refreshZohoTokenIfNeeded() {
    console.log('🔄 Refreshing Zoho access token...');
    const refreshed = await refreshZohoToken(global.zohoTokens?.refresh_token);
    global.zohoTokens = {
        ...global.zohoTokens,
        access_token: refreshed.access_token,
    };
    await saveTokens({
        qbTokens: global.qbTokens,
        qbRealmId: global.qbRealmId,
        zohoTokens: global.zohoTokens
    });
    console.log('✅ Zoho token refreshed and saved');
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
// Sync Customer — Create/Update with retry
// ─────────────────────────────────────────
async function syncCustomerWithRetry(entity) {
    try {
        await syncSingleCustomer(
            global.qbTokens?.access_token,
            global.qbRealmId,
            global.zohoTokens?.access_token,
            entity.id
        );
        console.log(`✅ Customer ${entity.id} synced (${entity.operation})`);
    } catch (err) {
        if (isTokenExpiredError(err)) {
            console.log(`⚠️ Token expired for Customer ${entity.id} — refreshing...`);
            try {
                await refreshQBToken();
                await syncSingleCustomer(
                    global.qbTokens?.access_token,
                    global.qbRealmId,
                    global.zohoTokens?.access_token,
                    entity.id
                );
                console.log(`✅ Customer ${entity.id} synced after token refresh`);
            } catch (retryErr) {
                console.error(`❌ Customer sync failed after refresh:`, retryErr.message);
            }
        } else {
            console.error(`❌ Customer sync failed:`, err.message);
        }
    }
}

// ─────────────────────────────────────────
// Delete Customer — with Zoho token retry
// ─────────────────────────────────────────
async function deleteCustomerWithRetry(entity) {
    try {
        await deleteZohoContact(
            global.zohoTokens?.access_token,
            entity.id
        );
    } catch (err) {
        if (isTokenExpiredError(err)) {
            console.log(`⚠️ Zoho token expired for delete Customer ${entity.id} — refreshing...`);
            try {
                await refreshZohoTokenIfNeeded();
                await deleteZohoContact(
                    global.zohoTokens?.access_token,
                    entity.id
                );
                console.log(`✅ Customer ${entity.id} deleted after token refresh`);
            } catch (retryErr) {
                console.error(`❌ Customer delete failed after refresh:`, retryErr.message);
            }
        } else {
            console.error(`❌ Customer delete failed:`, err.message);
        }
    }
}

// ─────────────────────────────────────────
// Sync Invoice — Create/Update with retry
// ─────────────────────────────────────────
async function syncInvoiceWithRetry(entity) {
    try {
        await syncSingleInvoice(
            global.qbTokens?.access_token,
            global.qbRealmId,
            global.zohoTokens?.access_token,
            entity.id
        );
        console.log(`✅ Invoice ${entity.id} synced (${entity.operation})`);
    } catch (err) {
        if (isTokenExpiredError(err)) {
            console.log(`⚠️ Token expired for Invoice ${entity.id} — refreshing...`);
            try {
                await refreshQBToken();
                await syncSingleInvoice(
                    global.qbTokens?.access_token,
                    global.qbRealmId,
                    global.zohoTokens?.access_token,
                    entity.id
                );
                console.log(`✅ Invoice ${entity.id} synced after token refresh`);
            } catch (retryErr) {
                console.error(`❌ Invoice sync failed after refresh:`, retryErr.message);
            }
        } else {
            console.error(`❌ Invoice sync failed:`, err.message);
        }
    }
}

// ─────────────────────────────────────────
// Delete Invoice — with Zoho token retry
// ─────────────────────────────────────────
async function deleteInvoiceWithRetry(entity) {
    try {
        await deleteZohoDeal(
            global.zohoTokens?.access_token,
            entity.id
        );
    } catch (err) {
        if (isTokenExpiredError(err)) {
            console.log(`⚠️ Zoho token expired for delete Invoice ${entity.id} — refreshing...`);
            try {
                await refreshZohoTokenIfNeeded();
                await deleteZohoDeal(
                    global.zohoTokens?.access_token,
                    entity.id
                );
                console.log(`✅ Invoice ${entity.id} deleted after token refresh`);
            } catch (retryErr) {
                console.error(`❌ Invoice delete failed after refresh:`, retryErr.message);
            }
        } else {
            console.error(`❌ Invoice delete failed:`, err.message);
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

    // ✅ Respond 200 IMMEDIATELY — QB requires fast response
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
            const eventKey = `${entity.name}-${entity.id}-${entity.operation}-${entity.lastUpdated}`;
            if (isDuplicate(eventKey)) {
                console.log(`⏭️ Skipping duplicate: ${eventKey}`);
                continue;
            }

            console.log(`📥 QB Event: ${entity.operation} ${entity.name} ID: ${entity.id}`);

            // ── Customer ──
            if (entity.name === 'Customer') {
                if (entity.operation === 'Create' || entity.operation === 'Update') {
                    await syncCustomerWithRetry(entity);
                }
                if (entity.operation === 'Delete') {
                    await deleteCustomerWithRetry(entity);
                }
            }

            // ── Invoice ──
            if (entity.name === 'Invoice') {
                if (entity.operation === 'Create' || entity.operation === 'Update') {
                    await syncInvoiceWithRetry(entity);
                }
                if (entity.operation === 'Delete') {
                    await deleteInvoiceWithRetry(entity);
                }
            }
        }
    }
}

module.exports = { handleWebhook };