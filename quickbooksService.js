const QuickBooks = require('node-quickbooks');
require('dotenv').config();

// Create QuickBooks client instance
function getQBClient(accessToken, realmId) {
    return new QuickBooks(
        process.env.QB_CLIENT_ID,
        process.env.QB_CLIENT_SECRET,
        accessToken,
        false,                              // no token secret (OAuth2)
        realmId,
        process.env.QB_ENVIRONMENT === 'sandbox', // true = sandbox
        false,                              // debug mode off
        null,
        '2.0',
        null
    );
}

// Fetch all customers from QuickBooks
async function getCustomers(qbClient) {
    return new Promise((resolve, reject) => {
        qbClient.findCustomers({}, (err, data) => {
            if (err) {
                console.error('Error fetching QB customers:', err);
                return reject(err);
            }
            const customers = data?.QueryResponse?.Customer || [];
            console.log(`✅ Fetched ${customers.length} customers from QuickBooks`);
            resolve(customers);
        });
    });
}

// Fetch all invoices from QuickBooks
async function getInvoices(qbClient) {
    return new Promise((resolve, reject) => {
        qbClient.findInvoices({}, (err, data) => {
            if (err) {
                console.error('Error fetching QB invoices:', err);
                return reject(err);
            }
            const invoices = data?.QueryResponse?.Invoice || [];
            console.log(`✅ Fetched ${invoices.length} invoices from QuickBooks`);
            resolve(invoices);
        });
    });
}

// Fetch all products/services from QuickBooks
async function getProducts(qbClient) {
    return new Promise((resolve, reject) => {
        qbClient.findItems({}, (err, data) => {
            if (err) {
                console.error('Error fetching QB products:', err);
                return reject(err);
            }
            const items = data?.QueryResponse?.Item || [];
            console.log(`✅ Fetched ${items.length} products from QuickBooks`);
            resolve(items);
        });
    });
}

// Fetch single customer by ID (for webhook)
async function getCustomerById(qbClient, customerId) {
    return new Promise((resolve, reject) => {
        qbClient.getCustomer(customerId, (err, data) => {
            if (err) {
                console.error('Error fetching QB customer:', err);
                return reject(err);
            }
            resolve(data);
        });
    });
}

module.exports = {
    getQBClient,
    getCustomers,
    getInvoices,
    getProducts,
    getCustomerById
};