const express = require('express');
const cors = require('cors');
const fs = require('fs');
const { getAuthUrl, getToken, oauthClient } = require('./qbAuth');
const { getZohoAuthUrl, getZohoToken } = require('./zohoAuth');
const { handleWebhook } = require('./webhook');
const { saveTokens, loadTokens } = require('./config/tokens');
require('dotenv').config();

const app = express();

// ─────────────────────────────────────────
// CORS
// ─────────────────────────────────────────
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: false
}));

// ─────────────────────────────────────────
// Raw body for webhook BEFORE express.json()
// ─────────────────────────────────────────
app.use((req, res, next) => {
    if (req.originalUrl === '/qb/webhook') {
        let rawBody = '';
        req.on('data', chunk => rawBody += chunk);
        req.on('end', () => {
            req.rawBody = rawBody;
            try { req.body = JSON.parse(rawBody || '{}'); }
            catch (e) { req.body = {}; }
            next();
        });
    } else {
        express.json()(req, res, next);
    }
});

// ─────────────────────────────────────────
// TOKEN STORE
// ─────────────────────────────────────────
let qbTokens = null;
let zohoTokens = null;
let qbRealmId = null;

// ─────────────────────────────────────────
// LOAD TOKENS ON STARTUP
// ─────────────────────────────────────────
const savedTokens = loadTokens();
if (savedTokens) {
    qbTokens = savedTokens.qbTokens;
    qbRealmId = savedTokens.qbRealmId;
    zohoTokens = savedTokens.zohoTokens;
    global.qbTokens = qbTokens;
    global.qbRealmId = qbRealmId;
    global.zohoTokens = zohoTokens;
    console.log("✅ Tokens loaded — webhook is ready");
} else {
    console.warn("⚠️ No tokens — visit your server URL to connect accounts");
}

// ─────────────────────────────────────────
// WEBHOOK ROUTE
// ─────────────────────────────────────────
app.post('/qb/webhook', handleWebhook);

// ─────────────────────────────────────────
// STATUS ROUTE
// ─────────────────────────────────────────
app.get('/status', (req, res) => {
    res.json({
        qbConnected: qbTokens !== null,
        zohoConnected: zohoTokens !== null,
        webhookActive: qbTokens !== null && zohoTokens !== null,
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
        body { font-family: Arial, sans-serif; max-width: 500px; margin: 40px auto; padding: 20px; }
        h1 { color: #0070C0; text-align: center; }
        .status { padding: 12px; border-radius: 8px; margin: 8px 0; font-weight: bold; }
        .connected { background: #d4edda; color: #155724; }
        .disconnected { background: #f8d7da; color: #721c24; }
        button { padding: 12px 20px; margin: 8px 0; width: 100%; background: #0070C0;
                 color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 15px; }
        button:hover { background: #005a9e; }
        .section { margin: 20px 0; padding: 15px; border: 1px solid #ddd; border-radius: 10px; }
        .subtitle { text-align: center; color: #666; margin-top: -10px; }
        .badge { padding: 12px; border-radius: 8px; text-align: center; margin-top: 10px; font-size: 14px; }
        .active { background: #d4edda; color: #155724; font-weight: bold; }
        .info { background: #cce5ff; color: #004085; }
        .warn { background: #fff3cd; color: #856404; font-size: 13px; }
      </style>
    </head>
    <body>
      <h1>⚡ QB ↔ Zoho CRM</h1>
      <p class="subtitle">Auto-Sync via Webhooks</p>

      <div class="section">
        <h3>🔌 Connection Status</h3>
        <div class="status ${qbTokens ? 'connected' : 'disconnected'}">
          QuickBooks: ${qbTokens ? '✅ Connected' : '❌ Not Connected'}
        </div>
        <div class="status ${zohoTokens ? 'connected' : 'disconnected'}">
          Zoho CRM: ${zohoTokens ? '✅ Connected' : '❌ Not Connected'}
        </div>
        ${qbTokens && zohoTokens ? `
          <div class="badge active">⚡ Auto-sync ACTIVE — customers & invoices sync instantly</div>
          <div class="badge warn">⚠️ Copy tokens to Render env vars → <a href="/tokens">View Tokens</a></div>
        ` : ''}
      </div>

      <div class="section">
        <h3>🔑 Connect Accounts</h3>
        ${!qbTokens ?
            '<a href="/qb/auth"><button>🔗 Connect QuickBooks</button></a>' :
            '<button style="background:#28a745;" disabled>✅ QuickBooks Connected</button>'
        }
        ${!zohoTokens ?
            '<a href="/zoho/auth"><button style="background:#e44d26;">🔗 Connect Zoho CRM</button></a>' :
            '<button style="background:#28a745;" disabled>✅ Zoho CRM Connected</button>'
        }
        ${qbTokens && zohoTokens ?
            '<a href="/tokens"><button style="background:#6f42c1;">📋 View Tokens for Render</button></a>' : ''}
        ${qbTokens || zohoTokens ?
            '<a href="/disconnect"><button style="background:#dc3545;">🔌 Disconnect All</button></a>' : ''}
      </div>
    </body>
    </html>
  `);
});

// ─────────────────────────────────────────
// TOKENS PAGE
// ─────────────────────────────────────────
app.get('/tokens', (req, res) => {
    if (!qbTokens || !zohoTokens) {
        return res.send('❌ Not connected yet. <a href="/">Go Back</a>');
    }
    res.send(`
        <html><body style="font-family:monospace; padding:20px;">
        <h2>📋 Copy these to Render Environment Variables</h2>
        <p style="color:red;">⚠️ Keep these secret — do not share!</p>
        <table border="1" cellpadding="8" style="border-collapse:collapse;">
            <tr><th>Key</th><th>Value</th></tr>
            <tr><td>QB_ACCESS_TOKEN</td><td>${qbTokens.access_token}</td></tr>
            <tr><td>QB_REFRESH_TOKEN</td><td>${qbTokens.refresh_token}</td></tr>
            <tr><td>QB_REALM_ID</td><td>${qbRealmId}</td></tr>
            <tr><td>ZOHO_ACCESS_TOKEN</td><td>${zohoTokens.access_token}</td></tr>
            <tr><td>ZOHO_REFRESH_TOKEN</td><td>${zohoTokens.refresh_token}</td></tr>
        </table>
        <br/>
        <p>1. Copy each value into Render → Environment Variables</p>
        <p>2. Click Save — Render restarts automatically</p>
        <p>3. Tokens survive every restart ✅</p>
        <a href="/">← Go Back</a>
        </body></html>
    `);
});

// ─────────────────────────────────────────
// DISCONNECT
// ─────────────────────────────────────────
app.get('/disconnect', (req, res) => {
    qbTokens = null;
    zohoTokens = null;
    qbRealmId = null;
    global.qbTokens = null;
    global.qbRealmId = null;
    global.zohoTokens = null;
    if (fs.existsSync('./config/tokens.json')) {
        fs.unlinkSync('./config/tokens.json');
        console.log("🗑️ tokens.json removed");
    }
    console.log('🔌 Disconnected all accounts');
    res.redirect('/');
});

// ─────────────────────────────────────────
// QUICKBOOKS AUTH
// ─────────────────────────────────────────
app.get('/qb/auth', (req, res) => {
    res.redirect(getAuthUrl());
});

app.get('/qb/callback', async (req, res) => {
    try {
        const fullUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
        const token = await getToken(fullUrl);
        qbTokens = token;
        qbRealmId = req.query.realmId;
        global.qbTokens = qbTokens;
        global.qbRealmId = qbRealmId;
        saveTokens({ qbTokens, qbRealmId, zohoTokens });
        console.log('\n🔑 QB_ACCESS_TOKEN =', qbTokens.access_token);
        console.log('🔑 QB_REFRESH_TOKEN =', qbTokens.refresh_token);
        console.log('🔑 QB_REALM_ID =', qbRealmId);
        console.log('✅ QuickBooks Connected! Realm ID:', qbRealmId);
        res.redirect('/');
    } catch (err) {
        console.error('QB Auth Error:', err);
        res.status(500).send('QuickBooks authentication failed.');
    }
});

// ─────────────────────────────────────────
// ZOHO AUTH
// ─────────────────────────────────────────
app.get('/zoho/auth', (req, res) => {
    res.redirect(getZohoAuthUrl());
});

app.get('/zoho/callback', async (req, res) => {
    try {
        const code = req.query.code;
        if (!code) throw new Error('No auth code received from Zoho');
        zohoTokens = await getZohoToken(code);
        global.zohoTokens = zohoTokens;
        saveTokens({ qbTokens, qbRealmId, zohoTokens });
        console.log('\n🔑 ZOHO_ACCESS_TOKEN =', zohoTokens.access_token);
        console.log('🔑 ZOHO_REFRESH_TOKEN =', zohoTokens.refresh_token);
        console.log('✅ Zoho CRM Connected!');
        res.redirect('/');
    } catch (err) {
        console.error('Zoho Auth Error:', err);
        res.status(500).send('Zoho CRM authentication failed.');
    }
});

// ─────────────────────────────────────────
// KEEP RENDER AWAKE — ping every 10 minutes
// ─────────────────────────────────────────
setInterval(async () => {
    try {
        const response = await fetch('https://qb-zoho-extension.onrender.com/status');
        console.log(' Keep-alive ping:', response.status);
    } catch (err) {
        console.log('⚠️ Keep-alive ping failed:', err.message);
    }
}, 10 * 60 * 1000);

// ─────────────────────────────────────────
// START SERVER
// ─────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 Server running on port ${PORT}`);
    console.log(`📡 Webhook ready at: POST /qb/webhook`);
});