// telemetry.js - fire-and-forget POST to a Google Apps Script endpoint on launch.
// Lets Cris see a live roster of who's running the app and which version they're on.
//
// To set up:
// 1. Create a new Google Sheet with columns: timestamp, username, hostname, version, event
// 2. Tools -> Apps Script. Paste in the doPost handler from `telemetry-script-template.js`
//    (a sibling reference file in this folder).
// 3. Deploy as web app, "Anyone with link", copy the deployment URL.
// 4. Paste the URL into TELEMETRY_URL below, rebuild, ship.
// 5. If you leave it empty, telemetry is silently disabled.

const os = require('os');
const https = require('https');

const TELEMETRY_URL = ''; // <-- paste your Google Apps Script deployment URL here

function report({ version, event }) {
  return new Promise((resolve) => {
    if (!TELEMETRY_URL) return resolve(); // disabled

    const payload = JSON.stringify({
      timestamp: new Date().toISOString(),
      username: os.userInfo().username || 'unknown',
      hostname: os.hostname() || 'unknown',
      version: version || 'unknown',
      event:   event || 'launch',
      platform: process.platform,
    });

    let url;
    try { url = new URL(TELEMETRY_URL); }
    catch { return resolve(); }

    const opts = {
      method: 'POST',
      hostname: url.hostname,
      path:     url.pathname + (url.search || ''),
      port:     url.port || 443,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      timeout:  5000,
    };

    const req = https.request(opts, (res) => {
      res.on('data', () => {});
      res.on('end', resolve);
    });
    req.on('error', () => resolve());
    req.on('timeout', () => { req.destroy(); resolve(); });
    req.write(payload);
    req.end();
  });
}

module.exports = { report };
