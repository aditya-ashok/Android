// ====================================================================
// IVCS Survey configuration
// ====================================================================
//
// SCRIPT_URL — paste your Google Apps Script "Web app" URL here to
// enable real-time capture into Google Sheets with server-side login.
// Follow the setup steps in survey/README.md (takes ~2 minutes).
//
// While SCRIPT_URL is empty the app runs in DEMO MODE: login is checked
// against LOCAL_USERS below and entries are stored on the device only
// (still exportable as CSV from the Records tab).
// ====================================================================

const CONFIG = {
  SCRIPT_URL: "", // e.g. "https://script.google.com/macros/s/AKfyc.../exec"

  // Demo-mode users only. Once SCRIPT_URL is set these are IGNORED —
  // real accounts live in the "Users" tab of your Google Sheet.
  LOCAL_USERS: [
    { username: "admin", password: "ivcs@2026", name: "Administrator", role: "admin" }
  ]
};
