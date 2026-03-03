const { getQBClient, getCustomers, getInvoices } = require('./quickbooksService');
const { createZohoContact, createZohoDeal } = require('./zohoService');

// ─────────────────────────────────────────
// SYNC QB Customers → Zoho Contacts
// ─────────────────────────────────────────
async function syncCustomers(accessToken, realmId, zohoToken) {
    console.log('\n🔄 Starting Customer Sync...');
    const qbClient = getQBClient(accessToken, realmId);
    const customers = await getCustomers(qbClient);

    let created = 0;
    let updated = 0;
    let failed = 0;

    for (const customer of customers) {
        try {
            const result = await createZohoContact(zohoToken, customer);
            if (result.action === 'created') created++;
            if (result.action === 'updated') updated++;
        } catch (err) {
            failed++;
        }
    }

    console.log(`\n📊 Customer Sync Done!`);
    console.log(`   ✅ Created: ${created}`);
    console.log(`   🔄 Updated: ${updated}`);
    console.log(`   ❌ Failed:  ${failed}`);

    return { created, updated, failed };
}

// ─────────────────────────────────────────
// SYNC QB Invoices → Zoho Deals
// ─────────────────────────────────────────
async function syncInvoices(accessToken, realmId, zohoToken) {
    console.log('\n🔄 Starting Invoice Sync...');
    const qbClient = getQBClient(accessToken, realmId);
    const invoices = await getInvoices(qbClient);

    let created = 0;
    let updated = 0;
    let failed = 0;

    for (const invoice of invoices) {
        try {
            const result = await createZohoDeal(zohoToken, invoice);
            if (result.action === 'created') created++;
            if (result.action === 'updated') updated++;
        } catch (err) {
            failed++;
        }
    }

    console.log(`\n📊 Invoice Sync Done!`);
    console.log(`   ✅ Created: ${created}`);
    console.log(`   🔄 Updated: ${updated}`);
    console.log(`   ❌ Failed:  ${failed}`);

    return { created, updated, failed };
}

module.exports = { syncCustomers, syncInvoices };