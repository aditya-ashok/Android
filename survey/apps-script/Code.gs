/**
 * IVCS Manager Survey — Google Apps Script backend
 * =================================================
 * Receives submissions from the survey web app and appends them to a
 * Google Sheet, with login validated server-side against a "Users" tab.
 *
 * SETUP (one time, ~2 minutes) — full steps in survey/README.md:
 *   1. Create a new Google Sheet (this becomes your live database).
 *   2. Extensions → Apps Script, paste this whole file, save.
 *   3. Run the `setup` function once (grant permission when asked).
 *      This creates the "Responses" and "Users" tabs and a default
 *      admin account:  admin / ivcs@2026   ← change it in the Users tab!
 *   4. Deploy → New deployment → type "Web app"
 *        Execute as:        Me
 *        Who has access:    Anyone
 *      Copy the /exec URL into survey/config.js → SCRIPT_URL.
 *
 * Add/remove surveyor accounts any time by editing the "Users" tab.
 */

var RESPONSES_SHEET = 'Responses';
var USERS_SHEET = 'Users';
var TOKEN_HOURS = 12;

var RESPONSE_HEADERS = [
  'Submission ID', 'Server Timestamp', 'District', 'Block', 'IVCS Name',
  'In Official List', 'IVCS Manager Name', 'IVCS Manager Phone',
  'Shareholders Count', 'Submitted By', 'Device Time'
];

/** Run this ONCE after pasting the script. */
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var resp = ss.getSheetByName(RESPONSES_SHEET) || ss.insertSheet(RESPONSES_SHEET);
  if (resp.getLastRow() === 0) {
    resp.appendRow(RESPONSE_HEADERS);
    resp.getRange(1, 1, 1, RESPONSE_HEADERS.length).setFontWeight('bold').setBackground('#dcfce7');
    resp.setFrozenRows(1);
  }

  var users = ss.getSheetByName(USERS_SHEET) || ss.insertSheet(USERS_SHEET);
  if (users.getLastRow() === 0) {
    users.appendRow(['Username', 'Password', 'Full Name', 'Role', 'Active']);
    users.getRange(1, 1, 1, 5).setFontWeight('bold').setBackground('#dcfce7');
    users.setFrozenRows(1);
    users.appendRow(['admin', 'ivcs@2026', 'Administrator', 'admin', 'yes']);
  }

  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('SECRET')) {
    props.setProperty('SECRET', Utilities.getUuid() + Utilities.getUuid());
  }
  Logger.log('Setup complete. Default login: admin / ivcs@2026 — change it in the Users tab.');
}

/* ------------------------------------------------------------------ */

function doGet() {
  return json_({ ok: true, service: 'ivcs-survey', time: new Date().toISOString() });
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000); // serialize concurrent surveyors
  try {
    var req = JSON.parse(e.postData.contents);
    switch (req.action) {
      case 'login': return login_(req);
      case 'submit': return submit_(req);
      case 'list': return list_(req);
      default: return json_({ ok: false, error: 'Unknown action' });
    }
  } catch (err) {
    return json_({ ok: false, error: 'Bad request: ' + err.message });
  } finally {
    lock.releaseLock();
  }
}

/* ---------- auth ---------- */

function login_(req) {
  var u = String(req.username || '').trim();
  var p = String(req.password || '');
  if (!u || !p) return json_({ ok: false, error: 'Username and password are required.' });

  var user = findUser_(u);
  if (!user || String(user.password) !== p || String(user.active).toLowerCase() !== 'yes') {
    return json_({ ok: false, error: 'Invalid username or password.' });
  }
  return json_({ ok: true, token: makeToken_(u), name: user.name, role: user.role || 'surveyor' });
}

function findUser_(username) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(USERS_SHEET);
  if (!sheet) return null;
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim().toLowerCase() === username.toLowerCase()) {
      return { username: rows[i][0], password: rows[i][1], name: rows[i][2], role: rows[i][3], active: rows[i][4] };
    }
  }
  return null;
}

function makeToken_(username) {
  var exp = Date.now() + TOKEN_HOURS * 3600 * 1000;
  var body = username + '|' + exp;
  return Utilities.base64EncodeWebSafe(body) + '.' + sign_(body);
}

function checkToken_(token, username) {
  try {
    var parts = String(token).split('.');
    var body = Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString();
    if (sign_(body) !== parts[1]) return false;
    var bits = body.split('|');
    return bits[0].toLowerCase() === String(username).toLowerCase() && Date.now() < Number(bits[1]);
  } catch (e) { return false; }
}

function sign_(text) {
  var secret = PropertiesService.getScriptProperties().getProperty('SECRET');
  var sig = Utilities.computeHmacSha256Signature(text, secret);
  return Utilities.base64EncodeWebSafe(sig);
}

/* ---------- data ---------- */

function submit_(req) {
  if (!checkToken_(req.token, req.username)) {
    return json_({ ok: false, error: 'Session expired — please log in again.' });
  }
  var r = req.record || {};
  var required = ['id', 'district', 'block', 'ivcs', 'managerName', 'managerPhone', 'shareholders'];
  for (var i = 0; i < required.length; i++) {
    if (r[required[i]] === undefined || r[required[i]] === null || r[required[i]] === '') {
      return json_({ ok: false, error: 'Missing field: ' + required[i] });
    }
  }
  if (!/^[6-9]\d{9}$/.test(String(r.managerPhone))) {
    return json_({ ok: false, error: 'Phone number must be a valid 10-digit mobile number.' });
  }

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(RESPONSES_SHEET);

  // Idempotent: a retried submission with the same ID is not duplicated.
  if (sheet.getLastRow() > 1) {
    var found = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1)
      .createTextFinder(String(r.id)).matchEntireCell(true).findNext();
    if (found) return json_({ ok: true, duplicate: true });
  }

  sheet.appendRow([
    String(r.id), new Date(), String(r.district), String(r.block), String(r.ivcs),
    String(r.ivcsListed || 'Yes'), String(r.managerName), "'" + String(r.managerPhone),
    Number(r.shareholders), String(req.username), String(r.deviceTime || '')
  ]);
  return json_({ ok: true });
}

function list_(req) {
  if (!checkToken_(req.token, req.username)) {
    return json_({ ok: false, error: 'Session expired — please log in again.' });
  }
  var user = findUser_(String(req.username));
  if (!user || String(user.role).toLowerCase() !== 'admin') {
    return json_({ ok: false, error: 'Only admin can list all responses.' });
  }
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(RESPONSES_SHEET);
  var rows = sheet.getDataRange().getValues();
  return json_({ ok: true, headers: rows[0], rows: rows.slice(1) });
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
