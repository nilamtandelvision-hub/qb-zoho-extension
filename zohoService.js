const axios = require('axios');

const ZOHO_API_BASE = 'https://www.zohoapis.com/crm/v2';

// Helper: build auth header
function authHeader(token) {
    return { Authorization: `Zoho-oauthtoken ${token}` };
}



// ─────────────────────────────────────────
// UPSERT Contact (NO DUPLICATES EVER)
// ─────────────────────────────────────────
async function createZohoContact(zohoToken, customer) {
    const payload = {
        data: [
            {
                First_Name: customer.GivenName || "",
                Last_Name: customer.FamilyName || customer.DisplayName || "Unknown",
                Email: customer.PrimaryEmailAddr?.Address || "",
                Phone: customer.PrimaryPhone?.FreeFormNumber || "",

                Mailing_Street: customer.BillAddr?.Line1 || "",
                Mailing_City: customer.BillAddr?.City || "",
                Mailing_State: customer.BillAddr?.CountrySubDivisionCode || "",
                Mailing_Zip: customer.BillAddr?.PostalCode || "",

                // 🔑 KEY FIELD
                QuickBooks_Customer_ID: customer.Id
            }
        ],
        duplicate_check_fields: ["QuickBooks_Customer_ID"]
    };

    const response = await axios.post(
        `${ZOHO_API_BASE}/Contacts/upsert`,
        payload,
        { headers: authHeader(zohoToken) }
    );

    const action = response.data.data[0].details.action;
    console.log(`✅ Contact ${action.toUpperCase()}: ${customer.DisplayName}`);

    return { action };
}

// ─────────────────────────────────────────
// UPSERT Deal (NO DUPLICATES EVER)
// ─────────────────────────────────────────
async function createZohoDeal(zohoToken, invoice) {
    const payload = {
        data: [
            {
                Deal_Name: `Invoice #${invoice.DocNumber}`,
                Amount: invoice.TotalAmt || 0,
                Stage: invoice.Balance === 0 ? "Closed Won" : "Needs Analysis",
                Closing_Date:
                    invoice.DueDate || new Date().toISOString().split("T")[0],

                // 🔑 KEY FIELD
                QuickBooks_Invoice_ID: invoice.Id
            }
        ],
        duplicate_check_fields: ["QuickBooks_Invoice_ID"]
    };

    const response = await axios.post(
        `${ZOHO_API_BASE}/Deals/upsert`,
        payload,
        { headers: authHeader(zohoToken) }
    );

    const action = response.data.data[0].details.action;
    console.log(`✅ Deal ${action.toUpperCase()}: Invoice #${invoice.DocNumber}`);

    return { action };
}

module.exports = {
    createZohoContact,
    createZohoDeal
};