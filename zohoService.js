const axios = require('axios');

const ZOHO_API_BASE = 'https://www.zohoapis.com/crm/v2';

// Helper: build auth header
function authHeader(token) {
    return { Authorization: `Zoho-oauthtoken ${token}` };
}

// ─────────────────────────────────────────
// SEARCH if contact already exists in Zoho
// ─────────────────────────────────────────
async function searchZohoContact(zohoToken, email, qbId) {
    try {
        // Search by email first
        if (email) {
            const response = await axios.get(
                `${ZOHO_API_BASE}/Contacts/search?criteria=(Email:equals:${email})`,
                { headers: authHeader(zohoToken) }
            );
            if (response.data?.data?.length > 0) {
                return response.data.data[0]; // Return existing contact
            }
        }

        // Search by QB ID in description
        const response = await axios.get(
            `${ZOHO_API_BASE}/Contacts/search?criteria=(Description:contains:QB ID: ${qbId})`,
            { headers: authHeader(zohoToken) }
        );
        if (response.data?.data?.length > 0) {
            return response.data.data[0];
        }

        return null; // Not found
    } catch (err) {
        return null; // If search fails, assume not found
    }
}

// ─────────────────────────────────────────
// SEARCH if deal already exists in Zoho
// ─────────────────────────────────────────
async function searchZohoDeal(zohoToken, invoiceNumber) {
    try {
        const response = await axios.get(
            `${ZOHO_API_BASE}/Deals/search?criteria=(Deal_Name:equals:Invoice #${invoiceNumber})`,
            { headers: authHeader(zohoToken) }
        );
        if (response.data?.data?.length > 0) {
            return response.data.data[0]; // Return existing deal
        }
        return null;
    } catch (err) {
        return null;
    }
}

// ─────────────────────────────────────────
// CREATE or UPDATE Contact (Upsert)
// ─────────────────────────────────────────
async function createZohoContact(zohoToken, customer) {
    try {
        const contactData = {
            First_Name: customer.GivenName || '',
            Last_Name: customer.FamilyName || customer.DisplayName || 'Unknown',
            Email: customer.PrimaryEmailAddr?.Value || '',
            Phone: customer.PrimaryPhone?.FreeFormNumber || '',
            Account_Name: customer.CompanyName || '',
            Mailing_Street: customer.BillAddr?.Line1 || '',
            Mailing_City: customer.BillAddr?.City || '',
            Mailing_State: customer.BillAddr?.CountrySubDivisionCode || '',
            Mailing_Zip: customer.BillAddr?.PostalCode || '',
            Description: `Synced from QuickBooks | QB ID: ${customer.Id}`,
        };

        // ── Check if contact already exists ──
        const existing = await searchZohoContact(
            zohoToken,
            contactData.Email,
            customer.Id
        );

        if (existing) {
            // ── UPDATE existing contact ──
            const response = await axios.put(
                `${ZOHO_API_BASE}/Contacts/${existing.id}`,
                { data: [contactData] },
                { headers: authHeader(zohoToken) }
            );
            console.log(`🔄 Contact UPDATED in Zoho: ${customer.DisplayName}`);
            return { action: 'updated', data: response.data };
        } else {
            // ── CREATE new contact ──
            const response = await axios.post(
                `${ZOHO_API_BASE}/Contacts`,
                { data: [contactData] },
                { headers: authHeader(zohoToken) }
            );
            console.log(`✅ Contact CREATED in Zoho: ${customer.DisplayName}`);
            return { action: 'created', data: response.data };
        }
    } catch (err) {
        console.error(
            `❌ Failed contact: ${customer.DisplayName}`,
            err.response?.data || err.message
        );
        throw err;
    }
}

// ─────────────────────────────────────────
// CREATE or UPDATE Deal (Upsert)
// ─────────────────────────────────────────
async function createZohoDeal(zohoToken, invoice) {
    try {
        const dealData = {
            Deal_Name: `Invoice #${invoice.DocNumber}`,
            Amount: invoice.TotalAmt || 0,
            Stage: invoice.Balance === 0 ? 'Closed Won' : 'Needs Analysis',
            Closing_Date: invoice.DueDate || new Date().toISOString().split('T')[0],
            Description: `Synced from QuickBooks | QB Invoice ID: ${invoice.Id}`,
        };

        // ── Check if deal already exists ──
        const existing = await searchZohoDeal(zohoToken, invoice.DocNumber);

        if (existing) {
            // ── UPDATE existing deal ──
            const response = await axios.put(
                `${ZOHO_API_BASE}/Deals/${existing.id}`,
                { data: [dealData] },
                { headers: authHeader(zohoToken) }
            );
            console.log(`🔄 Deal UPDATED in Zoho: Invoice #${invoice.DocNumber}`);
            return { action: 'updated', data: response.data };
        } else {
            // ── CREATE new deal ──
            const response = await axios.post(
                `${ZOHO_API_BASE}/Deals`,
                { data: [dealData] },
                { headers: authHeader(zohoToken) }
            );
            console.log(`✅ Deal CREATED in Zoho: Invoice #${invoice.DocNumber}`);
            return { action: 'created', data: response.data };
        }
    } catch (err) {
        console.error(
            `❌ Failed deal: Invoice #${invoice.DocNumber}`,
            err.response?.data || err.message
        );
        throw err;
    }
}

module.exports = {
    createZohoContact,
    createZohoDeal
};