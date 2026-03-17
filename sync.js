const { getQBClient, getCustomerById } = require('./quickbooksService');
const { createZohoContact, createZohoDeal } = require('./zohoService');

// ─────────────────────────────────────────
// SYNC SINGLE Customer — Webhook only
// ─────────────────────────────────────────
async function syncSingleCustomer(accessToken, realmId, zohoToken, customerId) {
    console.log(`\n⚡ Webhook Sync for Customer: ${customerId}`);
    const qbClient = getQBClient(accessToken, realmId);
    // No try/catch here — let error bubble up to webhook.js retry logic
    const customer = await getCustomerById(qbClient, customerId);
    const result = await createZohoContact(zohoToken, customer);
    console.log(`✅ Customer synced via webhook`);
    return result;
}

// ─────────────────────────────────────────
// SYNC SINGLE Invoice — Webhook only
// ─────────────────────────────────────────
async function syncSingleInvoice(accessToken, realmId, zohoToken, invoiceId) {
    console.log(`\n⚡ Webhook Sync for Invoice: ${invoiceId}`);
    const qbClient = getQBClient(accessToken, realmId);
    // No try/catch here — let error bubble up to webhook.js retry logic
    const invoice = await new Promise((resolve, reject) => {
        qbClient.getInvoice(invoiceId, (err, data) => {
            if (err) return reject(err);
            resolve(data);
        });
    });
    const result = await createZohoDeal(zohoToken, invoice);
    console.log(`✅ Invoice synced via webhook`);
    return result;
}

module.exports = { syncSingleCustomer, syncSingleInvoice };