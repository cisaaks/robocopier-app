/**
 * Google Apps Script template for RoboCopier telemetry.
 *
 * Setup:
 * 1. Create a new Google Sheet. Title it whatever you want, e.g. "RoboCopier Roster".
 * 2. In the first row, set headers:
 *      A: timestamp     B: username     C: hostname     D: version     E: event     F: platform
 * 3. Extensions menu -> Apps Script.
 * 4. Delete the default code, paste the function below.
 * 5. Save the script (give it a name like "RoboCopier telemetry").
 * 6. Deploy menu -> New deployment -> Type: Web app.
 *    - Description: "RoboCopier telemetry"
 *    - Execute as: Me
 *    - Who has access: Anyone
 *    - Deploy. Authorize. Copy the deployment URL.
 * 7. Paste the deployment URL into src/core/telemetry.js (the TELEMETRY_URL constant).
 * 8. Rebuild the app. Each launch will append a row to the sheet.
 *
 * Privacy note: the app sends username, hostname, version, platform - no document
 * content, no file paths, no operation details. Tell coworkers this is happening.
 */

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    sheet.appendRow([
      data.timestamp || new Date().toISOString(),
      data.username  || '',
      data.hostname  || '',
      data.version   || '',
      data.event     || '',
      data.platform  || '',
    ]);
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Optional health check
function doGet() {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, service: 'robocopier-telemetry' }))
    .setMimeType(ContentService.MimeType.JSON);
}
