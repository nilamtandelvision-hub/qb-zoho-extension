const axios = require('axios');

const ZOHO_API_BASE = 'https://www.zohoapis.com/crm/v2';

function authHeader(token) {
    return {
        Authorization: `Zoho-oauthtoken ${token}`,
        'Content-Type': 'application/json'
    };
}

// ─────────────────────────────────────────
// Build contact data from QB customer
// ─────────────────────────────────────────
function buildContactData(customer) {
    return {
        First_Name: customer.GivenName || "",
        Last_Name: customer.FamilyName || customer.DisplayName || "Unknown",
        Email: customer.PrimaryEmailAddr?.Address || "",
        Phone: customer.PrimaryPhone?.FreeFormNumber || "",
        Mailing_Street: customer.BillAddr?.Line1 || "",
        Mailing_City: customer.BillAddr?.City || "",
        Mailing_State: customer.BillAddr?.CountrySubDivisionCode || "",
        Mailing_Zip: customer.BillAddr?.PostalCode || "",
        QuickBooks_Customer_ID: String(customer.Id)
    };
}

// ─────────────────────────────────────────
// Search contact in Zoho by QB Customer ID
// ─────────────────────────────────────────
async function findContactByQBId(zohoToken, qbCustomerId) {
    try {
        const res = await axios.get(
            `${ZOHO_API_BASE}/Contacts/search?criteria=(QuickBooks_Customer_ID:equals:${qbCustomerId})`,
            { headers: authHeader(zohoToken) }
        );
        return res.data?.data?.[0] || null;
    } catch (err) {
        return null;
    }
}

// ─────────────────────────────────────────
// Search contact in Zoho by Email
// ─────────────────────────────────────────
async function findContactByEmail(zohoToken, email) {
    if (!email) return null;
    try {
        const res = await axios.get(
            `${ZOHO_API_BASE}/Contacts/search?email=${encodeURIComponent(email)}`,
            { headers: authHeader(zohoToken) }
        );
        return res.data?.data?.[0] || null;
    } catch (err) {
        return null;
    }
}

// ─────────────────────────────────────────
// Update existing contact by ID
// ─────────────────────────────────────────
async function updateContact(zohoToken, contactId, data) {
    const res = await axios.put(
        `${ZOHO_API_BASE}/Contacts/${contactId}`,
        { data: [data] },
        { headers: authHeader(zohoToken) }
    );
    return res.data?.data?.[0];
}

// ─────────────────────────────────────────
// UPSERT Contact — NO DUPLICATES
// 1. Search by QuickBooks_Customer_ID
// 2. If not found, search by Email
// 3. If found → UPDATE existing record
// 4. If not found → CREATE new record
// ─────────────────────────────────────────
async function createZohoContact(zohoToken, customer) {
    const contactData = buildContactData(customer);
    const qbId = String(customer.Id);
    const email = customer.PrimaryEmailAddr?.Address || "";
    const displayName = customer.DisplayName || customer.Id;

    try {
        // ── Step 1: Search by QB Customer ID ──
        let existing = await findContactByQBId(zohoToken, qbId);

        // ── Step 2: Fallback search by Email ──
        if (!existing && email) {
            existing = await findContactByEmail(zohoToken, email);
            if (existing) {
                console.log(`📧 Found existing contact by email: ${displayName}`);
            }
        }

        if (existing) {
            // ── Step 3: UPDATE existing contact ──
            const result = await updateContact(zohoToken, existing.id, contactData);
            console.log(`✅ Contact UPDATED: ${displayName} (ID: ${existing.id})`);
            return { action: 'updated' };

        } else {
            // ── Step 4: CREATE new contact ──
            const res = await axios.post(
                `${ZOHO_API_BASE}/Contacts`,
                { data: [contactData] },
                { headers: authHeader(zohoToken) }
            );
            const result = res.data?.data?.[0];
            console.log(`✅ Contact CREATED: ${displayName}`);
            return { action: 'created' };
        }

    } catch (err) {
        console.error('❌ Zoho Contact Error:', err.response?.data || err.message);
        throw err;
    }
}

// ─────────────────────────────────────────
// Build deal data from QB invoice
// ─────────────────────────────────────────
function buildDealData(invoice) {
    return {
        Deal_Name: `Invoice #${invoice.DocNumber || invoice.Id}`,
        Amount: invoice.TotalAmt || 0,
        Stage: invoice.Balance === 0 ? "Closed Won" : "Needs Analysis",
        Closing_Date: invoice.DueDate || new Date().toISOString().split("T")[0],
        QuickBooks_Invoice_ID: String(invoice.Id)
    };
}

// ─────────────────────────────────────────
// Search deal by QB Invoice ID
// ─────────────────────────────────────────
async function findDealByQBId(zohoToken, qbInvoiceId) {
    try {
        const res = await axios.get(
            `${ZOHO_API_BASE}/Deals/search?criteria=(QuickBooks_Invoice_ID:equals:${qbInvoiceId})`,
            { headers: authHeader(zohoToken) }
        );
        return res.data?.data?.[0] || null;
    } catch (err) {
        return null;
    }
}

// ─────────────────────────────────────────
// UPSERT Deal — NO DUPLICATES
// ─────────────────────────────────────────
async function createZohoDeal(zohoToken, invoice) {
    const dealData = buildDealData(invoice);
    const qbId = String(invoice.Id);
    const docNumber = invoice.DocNumber || invoice.Id;

    try {
        // Search by QB Invoice ID first
        const existing = await findDealByQBId(zohoToken, qbId);

        if (existing) {
            // UPDATE existing deal
            await axios.put(
                `${ZOHO_API_BASE}/Deals/${existing.id}`,
                { data: [dealData] },
                { headers: authHeader(zohoToken) }
            );
            console.log(`✅ Deal UPDATED: Invoice #${docNumber}`);
            return { action: 'updated' };

        } else {
            // CREATE new deal
            await axios.post(
                `${ZOHO_API_BASE}/Deals`,
                { data: [dealData] },
                { headers: authHeader(zohoToken) }
            );
            console.log(`✅ Deal CREATED: Invoice #${docNumber}`);
            return { action: 'created' };
        }

    } catch (err) {
        console.error('❌ Zoho Deal Error:', err.response?.data || err.message);
        throw err;
    }
}

module.exports = { createZohoContact, createZohoDeal };