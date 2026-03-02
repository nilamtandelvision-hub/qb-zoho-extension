const axios = require('axios');

const ZOHO_API_BASE = 'https://www.zohoapis.com/crm/v2';

// Helper: build auth header
function authHeader(token) {
    return { Authorization: `Zoho-oauthtoken ${token}` };
}

// Create a Contact in Zoho CRM from QB Customer
async function createZohoContact(zohoToken, customer) {
    try {
        const contact = {
            data: [
                {
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
                },
            ],
        };

        const response = await axios.post(
            `${ZOHO_API_BASE}/Contacts`,
            contact,
            { headers: authHeader(zohoToken) }
        );

        console.log(`✅ Contact created in Zoho: ${customer.DisplayName}`);
        return response.data;
    } catch (err) {
        console.error(`❌ Failed to create contact: ${customer.DisplayName}`,
            err.response?.data || err.message
        );
        throw err;
    }
}

// Create a Deal in Zoho CRM from QB Invoice
async function createZohoDeal(zohoToken, invoice) {
    try {
        const deal = {
            data: [
                {
                    Deal_Name: `Invoice #${invoice.DocNumber}`,
                    Amount: invoice.TotalAmt || 0,
                    Stage: invoice.Balance === 0 ? 'Closed Won' : 'Needs Analysis',
                    Closing_Date: invoice.DueDate || new Date().toISOString().split('T')[0],
                    Description: `Synced from QuickBooks | QB Invoice ID: ${invoice.Id}`,
                },
            ],
        };

        const response = await axios.post(
            `${ZOHO_API_BASE}/Deals`,
            deal,
            { headers: authHeader(zohoToken) }
        );

        console.log(`✅ Deal created in Zoho: Invoice #${invoice.DocNumber}`);
        return response.data;
    } catch (err) {
        console.error(`❌ Failed to create deal: Invoice #${invoice.DocNumber}`,
            err.response?.data || err.message
        );
        throw err;
    }
}

module.exports = { createZohoContact, createZohoDeal };