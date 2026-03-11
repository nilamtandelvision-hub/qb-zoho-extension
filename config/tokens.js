const fs = require("fs");
const path = require("path");

const TOKEN_FILE = path.join(__dirname, "tokens.json");

function saveTokens(data) {
    fs.writeFileSync(TOKEN_FILE, JSON.stringify(data, null, 2));
}

function loadTokens() {
    if (!fs.existsSync(TOKEN_FILE)) return null;
    return JSON.parse(fs.readFileSync(TOKEN_FILE));
}

module.exports = { saveTokens, loadTokens };