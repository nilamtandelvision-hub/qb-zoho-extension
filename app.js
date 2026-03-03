const express = require('express');
const cron = require('node-cron');
const cors = require('cors');
const { getAuthUrl, getToken, oauthClient } = require('./qbAuth');
const { getZohoAuthUrl, getZohoToken } = require('./zohoAuth');
const { syncCustomers, syncInvoices } = require('./sync');
require('dotenv').config();

const app = express();
app.use(cors({
    origin: [
        'https://127.0.0.1:5000',
        'https://localhost:5000',
        'http://localhost:3000'
    ],
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));
app.use(express.json());

// Store tokens temporarily (use a database in production)
let qbTokens = null;
let zohoTokens = null;
let qbRealmId = null;

app.get('/status', (req, res) => {
    res.json({
        qbConnected: qbTokens !== null,
        zohoConnected: zohoTokens !== null,
    });
});


// ─────────────────────────────────────────
// HOME PAGE
// ─────────────────────────────────────────
app.get('/', (req, res) => {
    res.send(`
    <h1>QB ↔ Zoho CRM Connector</h1>
    <p>Status:</p>
    <ul>
      <li>QuickBooks: ${qbTokens ? '✅ Connected' : '❌ Not Connected'}</li>
      <li>Zoho CRM: ${zohoTokens ? '✅ Connected' : '❌ Not Connected'}</li>
    </ul>
    <br/>
    <a href="/qb/auth"><button>Connect QuickBooks</button></a>
    <br/><br/>
    <a href="/zoho/auth"><button>Connect Zoho CRM</button></a>
    <br/><br/>
    <a href="/sync/customers"><button>Sync Customers → Zoho Contacts</button></a>
    <br/><br/>
    <a href="/sync/invoices"><button>Sync Invoices → Zoho Deals</button></a>
  `);
});

// ─────────────────────────────────────────
// QUICKBOOKS AUTH ROUTES
// ─────────────────────────────────────────
app.get('/qb/auth', (req, res) => {
    const authUrl = getAuthUrl();
    console.log('Redirecting to QB Auth:', authUrl);
    res.redirect(authUrl);
});

app.get('/qb/callback', async (req, res) => {
    try {
        const fullUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
        const token = await getToken(fullUrl);

        qbTokens = token;
        qbRealmId = oauthClient.getToken().realmId;

        console.log('✅ QuickBooks Connected! Realm ID:', qbRealmId);
        res.redirect('/');
    } catch (err) {
        console.error('QB Auth Error:', err);
        res.status(500).send('QuickBooks authentication failed. Check console.');
    }
});

// ─────────────────────────────────────────
// ZOHO AUTH ROUTES
// ─────────────────────────────────────────
app.get('/zoho/auth', (req, res) => {
    const authUrl = getZohoAuthUrl();
    console.log('Redirecting to Zoho Auth:', authUrl);
    res.redirect(authUrl);
});

app.get('/zoho/callback', async (req, res) => {
    try {
        const code = req.query.code;
        if (!code) throw new Error('No auth code received from Zoho');

        zohoTokens = await getZohoToken(code);
        console.log('✅ Zoho CRM Connected!');
        res.redirect('/');
    } catch (err) {
        console.error('Zoho Auth Error:', err);
        res.status(500).send('Zoho CRM authentication failed. Check console.');
    }
});

// ─────────────────────────────────────────
// SYNC ROUTES
// ─────────────────────────────────────────
app.get('/sync/customers', async (req, res) => {
    if (!qbTokens || !zohoTokens) {
        return res.send('❌ Please connect both accounts first! <a href="/">Go Back</a>');
    }
    try {
        const result = await syncCustomers(
            qbTokens.access_token,
            qbRealmId,
            zohoTokens.access_token
        );
        res.send(`
      ✅ Customer Sync Complete!
      Created: ${result.created}
      Updated: ${result.updated}
      Failed: ${result.failed}
      <a href="/">Go Back</a>
    `);
    } catch (err) {
        res.status(500).send('Sync failed.');
    }
});

app.get('/sync/invoices', async (req, res) => {
    if (!qbTokens || !zohoTokens) {
        return res.send('❌ Please connect both accounts first! <a href="/">Go Back</a>');
    }
    try {
        const result = await syncInvoices(
            qbTokens.access_token,
            qbRealmId,
            zohoTokens.access_token
        );
        res.send(`
      ✅ Invoice Sync Complete!
      Created: ${result.created}
      Updated: ${result.updated}
      Failed: ${result.failed}
      <a href="/">Go Back</a>
    `);
    } catch (err) {
        res.status(500).send('Sync failed.');
    }
});

cron.schedule('0 */2 * * *', async () => {
    if (qbTokens && zohoTokens) {
        console.log('⏰ Auto sync started...');
        await syncCustomers(qbTokens.access_token, qbRealmId, zohoTokens.access_token);
        await syncInvoices(qbTokens.access_token, qbRealmId, zohoTokens.access_token);
        console.log('⏰ Auto sync complete!');
    }
});

// ─────────────────────────────────────────
// START SERVER
// ─────────────────────────────────────────
const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Server running at http://localhost:${PORT}`);
});