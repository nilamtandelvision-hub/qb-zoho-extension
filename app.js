const express = require('express');
const cron = require('node-cron');
const cors = require('cors');
const { getAuthUrl, getToken, oauthClient } = require('./qbAuth');           // qbAuth.js
const { getZohoAuthUrl, getZohoToken } = require('./zohoAuth');         // zohoAuth.js
const { syncCustomers, syncInvoices } = require('./sync');             // sync.js
require('dotenv').config();

const app = express();

app.use(cors({ origin: '*', methods: ['GET', 'POST'], allowedHeaders: ['Content-Type', 'Authorization'] }));
app.use(express.json());

// ─────────────────────────────────────────────────────────
//  IN-MEMORY TOKEN STORE
// ─────────────────────────────────────────────────────────
let qbTokens = null;
let zohoTokens = null;
let qbRealmId = null;

// ─────────────────────────────────────────────────────────
//  HOME PAGE
//  ✅ STEP 1 ONLY — Connect QuickBooks here (one-time)
//  Zoho CRM is auto-connected inside the widget — no button needed
//  All sync buttons live in the Zoho CRM widget (frontend)
// ─────────────────────────────────────────────────────────
app.get('/', (req, res) => {
    const qbOk = qbTokens !== null;

    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>QB ↔ Zoho Setup</title>
  <style>
    * { box-sizing:border-box; margin:0; padding:0; }
    body { font-family:'Segoe UI',Arial,sans-serif; background:#f0f4f8; min-height:100vh;
           display:flex; align-items:center; justify-content:center; padding:20px; }
    .card { background:white; border-radius:14px; padding:36px 32px; max-width:420px;
            width:100%; box-shadow:0 4px 24px rgba(0,0,0,0.10); }
    .header { text-align:center; margin-bottom:28px; }
    .header .icon { font-size:36px; margin-bottom:8px; }
    .header h1 { font-size:20px; color:#0070C0; font-weight:700; }
    .header p  { font-size:13px; color:#888; margin-top:4px; }
    .step-label { font-size:10px; font-weight:700; color:#999; text-transform:uppercase;
                  letter-spacing:0.8px; margin-bottom:12px; }
    .status-row { display:flex; align-items:center; justify-content:space-between;
                  padding:12px 14px; border-radius:10px; border:1.5px solid #e0e0e0;
                  margin-bottom:10px; background:#fafafa; }
    .status-row.connected    { background:#f0fff4; border-color:#28a745; }
    .status-row.disconnected { background:#fff5f5; border-color:#f0d0d0; }
    .status-row.auto         { background:#f0f4ff; border-color:#a0b4f0; }
    .status-row .name  { font-size:14px; font-weight:600; color:#333; }
    .status-row .badge { font-size:12px; font-weight:600; }
    .status-row.connected    .badge { color:#28a745; }
    .status-row.disconnected .badge { color:#dc3545; }
    .status-row.auto         .badge { color:#3355cc; }
    hr.divider { border:none; border-top:1.5px solid #f0f0f0; margin:22px 0; }
    .btn { display:block; width:100%; padding:13px 16px; border:none; border-radius:9px;
           font-size:14px; font-weight:600; cursor:pointer; text-align:center;
           text-decoration:none; margin-bottom:10px; transition:opacity 0.2s, transform 0.2s; }
    .btn:hover { opacity:0.88; transform:translateY(-1px); }
    .btn-blue { background:#0070C0; color:white; }
    .btn-done { background:#e8f5e9; color:#2e7d32; border:1.5px solid #a5d6a7; cursor:default; }
    .btn-done:hover { opacity:1; transform:none; }
    .note { margin-top:22px; background:#fffbea; border:1.5px solid #ffe082;
            border-radius:9px; padding:12px 14px; font-size:12px; color:#7a5f00; line-height:1.6; }
    .note strong { display:block; margin-bottom:4px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <div class="icon">⚡</div>
      <h1>QuickBooks ↔ Zoho CRM</h1>
      <p>One-time setup. Connect QuickBooks to get started.</p>
    </div>

    <div class="step-label">🔌 Connection Status</div>
    <div class="status-row ${qbOk ? 'connected' : 'disconnected'}">
      <span class="name">🏦 QuickBooks</span>
      <span class="badge">${qbOk ? '✅ Connected' : '❌ Not Connected'}</span>
    </div>
    <div class="status-row auto">
      <span class="name">🔗 Zoho CRM</span>
      <span class="badge">🔵 Auto-connected in widget</span>
    </div>

    <hr class="divider"/>

    <div class="step-label">🔑 Step 1 — Connect QuickBooks</div>
    ${qbOk
            ? `<div class="btn btn-done">✅ QuickBooks Connected</div>`
            : `<a href="/qb/auth" class="btn btn-blue">🔑 Connect QuickBooks</a>`
        }

    <div class="note">
      <strong>ℹ️ Why no Zoho CRM button?</strong>
      Zoho CRM connects automatically inside the widget — you are already logged into Zoho CRM when you open the widget, so no separate login is needed.<br/><br/>
      <strong>✅ After connecting QuickBooks:</strong>
      Open the <strong>QuickBooks Sync widget</strong> inside Zoho CRM to sync your data.
    </div>
  </div>
</body>
</html>`);
});

// ─────────────────────────────────────────────────────────
//  STATUS API — polled by widget every 30s
// ─────────────────────────────────────────────────────────
app.get('/status', (req, res) => {
    res.json({
        qbConnected: qbTokens !== null,
        zohoConnected: zohoTokens !== null,
    });
});

// ─────────────────────────────────────────────────────────
//  QUICKBOOKS AUTH
// ─────────────────────────────────────────────────────────
app.get('/qb/auth', (req, res) => {
    res.redirect(getAuthUrl());
});

app.get('/qb/callback', async (req, res) => {
    try {
        const fullUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
        qbTokens = await getToken(fullUrl);
        qbRealmId = oauthClient.getToken().realmId;
        console.log('✅ QuickBooks Connected! Realm ID:', qbRealmId);
        res.send(`<!DOCTYPE html><html><body style="font-family:Arial;text-align:center;padding:40px">
          <h2>✅ QuickBooks Connected!</h2><p>You can close this window.</p>
          <script>
            if(window.opener){window.opener.postMessage('qb_connected','*');setTimeout(()=>window.close(),1500);}
            else{setTimeout(()=>{window.location='/';},1500);}
          </script>
        </body></html>`);
    } catch (err) {
        console.error('QB Auth Error:', err);
        res.status(500).send('QuickBooks authentication failed.');
    }
});

// ─────────────────────────────────────────────────────────
//  ZOHO AUTH
// ─────────────────────────────────────────────────────────
app.get('/zoho/auth', (req, res) => {
    res.redirect(getZohoAuthUrl());
});

app.get('/zoho/callback', async (req, res) => {
    try {
        const code = req.query.code;
        if (!code) throw new Error('No auth code from Zoho');
        zohoTokens = await getZohoToken(code);
        console.log('✅ Zoho CRM Connected!');
        res.send(`<!DOCTYPE html><html><body style="font-family:Arial;text-align:center;padding:40px">
          <h2>✅ Zoho CRM Connected!</h2><p>You can close this window.</p>
          <script>
            if(window.opener){window.opener.postMessage('zoho_connected','*');setTimeout(()=>window.close(),1500);}
            else{setTimeout(()=>{window.location='/';},1500);}
          </script>
        </body></html>`);
    } catch (err) {
        console.error('Zoho Auth Error:', err);
        res.status(500).send('Zoho CRM authentication failed.');
    }
});

// ─────────────────────────────────────────────────────────
//  SYNC ROUTES — triggered by widget buttons only
// ─────────────────────────────────────────────────────────
app.get('/sync/customers', async (req, res) => {
    if (!qbTokens || !zohoTokens)
        return res.status(401).json({ error: 'Both accounts must be connected first.' });
    try {
        const result = await syncCustomers(qbTokens.access_token, qbRealmId, zohoTokens.access_token);
        res.json(result); // { created, updated, failed }
    } catch (err) {
        console.error('Customer Sync Error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/sync/invoices', async (req, res) => {
    if (!qbTokens || !zohoTokens)
        return res.status(401).json({ error: 'Both accounts must be connected first.' });
    try {
        const result = await syncInvoices(qbTokens.access_token, qbRealmId, zohoTokens.access_token);
        res.json(result); // { created, updated, failed }
    } catch (err) {
        console.error('Invoice Sync Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────────────────
//  AUTO SYNC every 2 hours
// ─────────────────────────────────────────────────────────
cron.schedule('0 */2 * * *', async () => {
    if (qbTokens && zohoTokens) {
        console.log('⏰ Auto sync started...');
        await syncCustomers(qbTokens.access_token, qbRealmId, zohoTokens.access_token);
        await syncInvoices(qbTokens.access_token, qbRealmId, zohoTokens.access_token);
        console.log('⏰ Auto sync complete!');
    } else {
        console.log('⏰ Auto sync skipped — not connected.');
    }
});

// ─────────────────────────────────────────────────────────
//  START
// ─────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 Server running on port ${PORT}`);
    console.log(`   Visit your backend URL to connect QB + Zoho accounts`);
});