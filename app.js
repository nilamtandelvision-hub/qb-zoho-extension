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
        body { font-family: Arial, sans-serif; max-width: 500px;
               margin: 40px auto; padding: 20px; }
        h1 { color: #0070C0; text-align: center; }
        .status { padding: 12px; border-radius: 8px; margin: 8px 0;
                  font-weight: bold; }
        .connected { background: #d4edda; color: #155724; }
        .disconnected { background: #f8d7da; color: #721c24; }
        button { padding: 12px 20px; margin: 8px 0; width: 100%;
                 background: #0070C0; color: white; border: none;
                 border-radius: 8px; cursor: pointer; font-size: 15px; }
        button:hover { background: #005a9e; }
        .section { margin: 20px 0; padding: 15px;
                   border: 1px solid #ddd; border-radius: 10px; }
        .subtitle { text-align: center; color: #666; margin-top: -10px; }
        .both-connected { background: #d4edda; color: #155724;
                          padding: 12px; border-radius: 8px;
                          text-align: center; font-weight: bold;
                          margin-top: 10px; }
      </style>
    </head>
    <body>
      <h1>⚡ QB ↔ Zoho CRM</h1>
      <p class="subtitle">QuickBooks Sync for Zoho CRM</p>

      <div class="section">
        <h3>🔌 Connection Status</h3>
        <div class="status ${qbTokens ? 'connected' : 'disconnected'}">
          QuickBooks: ${qbTokens ? '✅ Connected' : '❌ Not Connected'}
        </div>
        <div class="status ${zohoTokens ? 'connected' : 'disconnected'}">
          Zoho CRM: ${zohoTokens ? '✅ Connected' : '❌ Not Connected'}
        </div>
        ${qbTokens && zohoTokens ?
            '<div class="both-connected">🎉 Both connected! Sync is active.</div>'
            : ''}
      </div>

      <div class="section">
        <h3>🔑 Connect Accounts</h3>
        ${!qbTokens ?
            '<a href="/qb/auth"><button>🔗 Connect QuickBooks</button></a>' :
            '<button style="background:#28a745;">✅ QuickBooks Connected</button>'
        }
        ${!zohoTokens ?
            '<a href="/zoho/auth"><button style="background:#e44d26;">🔗 Connect Zoho CRM</button></a>' :
            '<button style="background:#28a745;">✅ Zoho CRM Connected</button>'
        }
        ${qbTokens || zohoTokens ?
            '<a href="/disconnect"><button style="background:#dc3545;">🔌 Disconnect All</button></a>'
            : ''}
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