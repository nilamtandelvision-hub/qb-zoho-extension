const express = require('express');
const cron = require('node-cron');
const cors = require('cors');
const { getAuthUrl, getToken, oauthClient } = require('./qbAuth');
const { getZohoAuthUrl, getZohoToken } = require('./zohoAuth');
const { syncCustomers, syncInvoices } = require('./sync');
require('dotenv').config();

const app = express();

// ─────────────────────────────────────────
// CORS — Allow all origins for public use
// ─────────────────────────────────────────
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: false
}));
app.use(express.json());

// Store tokens temporarily
let qbTokens = null;
let zohoTokens = null;
let qbRealmId = null;

// ─────────────────────────────────────────
// STATUS ROUTE
// ─────────────────────────────────────────
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
    <html>
    <head>
      <title>QB ↔ Zoho Connector</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 600px;
               margin: 40px auto; padding: 20px; }
        h1 { color: #0070C0; }
        .status { padding: 10px; border-radius: 5px; margin: 5px 0; }
        .connected { background: #d4edda; color: #155724; }
        .disconnected { background: #f8d7da; color: #721c24; }
        button { padding: 10px 20px; margin: 8px 0; width: 100%;
                 background: #0070C0; color: white; border: none;
                 border-radius: 5px; cursor: pointer; font-size: 14px; }
        .section { margin: 20px 0; padding: 15px;
                   border: 1px solid #ddd; border-radius: 8px; }
      </style>
    </head>
    <body>
      <h1>⚡ QB ↔ Zoho CRM Connector</h1>
      <div class="section">
        <h3>🔌 Connection Status</h3>
        <div class="status ${qbTokens ? 'connected' : 'disconnected'}">
          QuickBooks: ${qbTokens ? '✅ Connected' : '❌ Not Connected'}
        </div>
        <div class="status ${zohoTokens ? 'connected' : 'disconnected'}">
          Zoho CRM: ${zohoTokens ? '✅ Connected' : '❌ Not Connected'}
        </div>
      </div>
      <div class="section">
        <h3>🔑 Step 1 — Connect</h3>
        <a href="/qb/auth"><button>Connect QuickBooks</button></a>
        <a href="/zoho/auth"><button>Connect Zoho CRM</button></a>
      </div>
      <div class="section">
        <h3>🔄 Step 2 — Sync</h3>
        <a href="/sync/customers"><button>Sync Customers → Contacts</button></a>
        <a href="/sync/invoices"><button>Sync Invoices → Deals</button></a>
      </div>
      <div class="section">
        <h3>⏰ Auto Sync</h3>
        <p>Runs every 2 hours automatically.</p>
      </div>
    </body>
    </html>
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
        res.status(500).send('QuickBooks authentication failed.');
    }
});

// ─────────────────────────────────────────
// DISCONNECT ROUTE
// ─────────────────────────────────────────
app.get('/disconnect', (req, res) => {
    qbTokens = null;
    zohoTokens = null;
    qbRealmId = null;
    console.log('🔌 Disconnected from QuickBooks and Zoho CRM');
    res.send(`
        <html>
        <body style="font-family:Arial; text-align:center; padding:40px;">
            <h2>✅ Successfully Disconnected</h2>
            <p>QuickBooks Sync has been disconnected.</p>
            <a href="/">Go Back</a>
        </body>
        </html>
    `);
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
        res.status(500).send('Zoho CRM authentication failed.');
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
            ✅ Customer Sync Complete! <br/>
            ✅ Created: ${result.created} <br/>
            🔄 Updated: ${result.updated} <br/>
            ❌ Failed: ${result.failed} <br/>
            <a href="/">Go Back</a>
        `);
    } catch (err) {
        console.error('Sync Error:', err);
        res.status(500).send('Sync failed. Check console for details.');
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
            ✅ Invoice Sync Complete! <br/>
            ✅ Created: ${result.created} <br/>
            🔄 Updated: ${result.updated} <br/>
            ❌ Failed: ${result.failed} <br/>
            <a href="/">Go Back</a>
        `);
    } catch (err) {
        console.error('Sync Error:', err);
        res.status(500).send('Sync failed. Check console for details.');
    }
});

// ─────────────────────────────────────────
// AUTO SYNC EVERY 2 HOURS
// ─────────────────────────────────────────
cron.schedule('0 */2 * * *', async () => {
    if (qbTokens && zohoTokens) {
        console.log('⏰ Auto sync started...');
        await syncCustomers(qbTokens.access_token, qbRealmId, zohoTokens.access_token);
        await syncInvoices(qbTokens.access_token, qbRealmId, zohoTokens.access_token);
        console.log('⏰ Auto sync complete!');
    } else {
        console.log('⏰ Auto sync skipped - accounts not connected.');
    }
});

// ─────────────────────────────────────────
// START SERVER
// ─────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 Server running on port ${PORT}`);
});