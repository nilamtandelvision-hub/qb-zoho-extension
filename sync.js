const { getQBClient, getCustomers, getInvoices } = require('./quickbooksService');
const { createZohoContact, createZohoDeal } = require('./zohoService');

// Sync QB Customers → Zoho Contacts
async function syncCustomers(accessToken, realmId, zohoToken) {
    console.log('\n🔄 Starting Customer Sync...');
    const qbClient = getQBClient(accessToken, realmId);
    const customers = await getCustomers(qbClient);

    let success = 0;
    let failed = 0;

    for (const customer of customers) {
        try {
            await createZohoContact(zohoToken, customer);
            success++;
        } catch (err) {
            failed++;
        }
    }

    console.log(`\n📊 Customer Sync Done! ✅ ${success} synced | ❌ ${failed} failed`);
}

// Sync QB Invoices → Zoho Deals
async function syncInvoices(accessToken, realmId, zohoToken) {
    console.log('\n🔄 Starting Invoice Sync...');
    const qbClient = getQBClient(accessToken, realmId);
    const invoices = await getInvoices(qbClient);

    let success = 0;
    let failed = 0;

    for (const invoice of invoices) {
        try {
            await createZohoDeal(zohoToken, invoice);
            success++;
        } catch (err) {
            failed++;
        }
    }

    console.log(`\n📊 Invoice Sync Done! ✅ ${success} synced | ❌ ${failed} failed`);
}

module.exports = { syncCustomers, syncInvoices };