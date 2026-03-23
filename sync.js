const { getQBClient, getCustomerById } = require('./quickbooksService');
const { createZohoContact, createZohoDeal, deleteZohoContact, deleteZohoDeal } = require('./zohoService');

// ─────────────────────────────────────────
// SYNC SINGLE Customer — Webhook only
// ─────────────────────────────────────────
async function syncSingleCustomer(accessToken, realmId, zohoToken, customerId) {
    console.log(`\n⚡ Webhook Sync for Customer: ${customerId}`);
    const qbClient = getQBClient(accessToken, realmId);

    const customer = await getCustomerById(qbClient, customerId);

    // ✅ Customer is inactive in QB — delete from Zoho
    if (customer.Active === false) {
        console.log(`🗑️ Customer ${customerId} is inactive in QB — deleting from Zoho...`);
        await deleteZohoContact(zohoToken, customerId);
        return { action: 'deleted' };
    }

    // ✅ Customer is active — create or update in Zoho
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

    const invoice = await new Promise((resolve, reject) => {
        qbClient.getInvoice(invoiceId, (err, data) => {
            if (err) return reject(err);
            resolve(data);
        });
    });

    // ✅ Invoice is voided or inactive in QB — delete from Zoho
    if (invoice.PrivateNote === 'Voided' || invoice.Active === false) {
        console.log(`🗑️ Invoice ${invoiceId} is voided/deleted in QB — deleting from Zoho...`);
        await deleteZohoDeal(zohoToken, invoiceId);
        return { action: 'deleted' };
    }

    // ✅ Invoice is active — create or update in Zoho
    const result = await createZohoDeal(zohoToken, invoice);
    console.log(`✅ Invoice synced via webhook`);
    return result;
}

module.exports = { syncSingleCustomer, syncSingleInvoice };
