# Form Builder → Google Sheets

A no-build static form builder hosted on **GitHub Pages** that talks to a **Google Apps Script Web App**, storing everything in a **Google Sheet**.

- Building a form **creates a new tab** in the sheet.
- Each submission **appends a row** to that form's tab.
- Form definitions live in a `_Forms` registry tab, so any visitor can open and fill a form.
- Building/editing forms requires an **admin passphrase**; submissions are open.

## How it works

```
GitHub Pages (static)                 Apps Script Web App            Google Sheet + Drive
─────────────────────                 ───────────────────            ────────────────────
index.html  list forms   ── GET ───▶  listForms / getForm   ──▶      _Forms registry tab
form.html   fill + submit ── POST ──▶  submitEntry           ──▶      <form> tab (append row)
admin.html  build a form  ── POST ──▶  createForm            ──▶      new tab + registry row
                                       uploadFile            ──▶      Drive folder → link
```

## Files

| Path | Purpose |
|------|---------|
| `appscript/Code.gs` | The Apps Script backend (paste into an Apps Script project). |
| `config.js` | Holds your Web App `/exec` URL — the one value you must edit. |
| `index.html` / `assets/list.js` | Lists available forms. |
| `form.html` / `assets/form.js` | Renders a form and submits responses. |
| `admin.html` / `assets/builder.js` | Passphrase-gated form builder. |
| `assets/api.js` | Client wrapper for the Web App. |
| `assets/styles.css` | Shared styling. |

## Setup

### 1. Create the Google Sheet and Drive folder
1. Create a new Google Sheet. From its URL copy the **Sheet ID** (the long id between `/d/` and `/edit`).
2. Create a Drive folder for file uploads. Open it and copy the **folder ID** from the URL.

### 2. Create the Apps Script project
1. Go to <https://script.google.com> ▸ **New project**.
2. Delete the default code and paste the contents of `appscript/Code.gs`.
3. Open **Project Settings** (gear icon) ▸ **Script Properties** ▸ add three properties:
   - `SHEET_ID` = your Sheet ID
   - `ADMIN_PASSPHRASE` = a secret of your choice (needed to build forms)
   - `DRIVE_FOLDER_ID` = your upload folder ID
4. (Optional) Run the `test_` function once to authorize the script and auto-create the `_Forms` tab. Approve the permission prompts (Sheets + Drive).

### 3. Deploy the Web App
1. **Deploy ▸ New deployment ▸** select type **Web app**.
2. Set **Execute as: Me** and **Who has access: Anyone**.
3. Click **Deploy**, authorize if asked, and **copy the Web app URL** (ends with `/exec`).

> Whenever you change `Code.gs`, use **Deploy ▸ Manage deployments ▸ Edit ▸ Version: New version** so the `/exec` URL serves the latest code.

### 4. Point the frontend at your Web App
Edit `config.js` and replace the placeholder with your `/exec` URL:

```js
window.APP_CONFIG = { API_URL: 'https://script.google.com/macros/s/XXXX/exec' };
```

### 5. Publish to GitHub Pages
1. Create a GitHub repo and push these files to the `main` branch (repo root).
2. Repo **Settings ▸ Pages ▸ Build and deployment**: Source = **Deploy from a branch**, Branch = **main**, Folder = **/ (root)**.
3. Open the published URL. `index.html` lists forms; `admin.html` builds them.

## Using it
- Visit **`admin.html`**, enter the passphrase, add fields, and **Save**. A new tab appears in your sheet and the form gets a shareable link.
- Share **`form.html?form=<formId>`** (the builder shows the link after saving).
- Responses land as rows in the form's tab. Uploaded files are saved to your Drive folder and the cell holds a link.

## Field types
Short text · Long text · Number (optional min/max) · Email · Date · Dropdown · Single choice (radio) · Multiple choice (checkboxes, joined with `, ` in the cell) · Rating/scale (stars) · File upload (Drive link).

## Fast loading (static catalog cache)
Apps Script has an unavoidable per-request latency (cold start + the `/exec` redirect). To make loading feel instant, the app keeps a **static catalog** of forms that GitHub Pages serves from its CDN:

- `data/catalog.json` holds every active form and its schema.
- `index.html` and `form.html` paint **instantly** from `catalog.json` (no Apps Script call), then do a background **comparison check** against the live Web App. A form created since the last sync still shows up — at normal Apps Script speed — while everything already in the catalog is instant.
- The **`Sync forms catalog`** GitHub Action (`.github/workflows/sync-forms.yml`) refreshes `catalog.json` from the `export` endpoint every ~15 minutes and on demand (Actions tab → Run workflow). It only commits when something changed, so a newly created form moves into the "instant" tier on the next sync.
- Server-side, `listForms`/`export` results are cached in Apps Script `CacheService` and busted automatically on any create/edit/delete.

> Requires the `export` action in `Code.gs` — redeploy the Web App (new version) after updating the script. The Action reads your `/exec` URL straight from `config.js`, so there's nothing else to configure.

## Notes & limits
- The passphrase is a shared secret compared server-side over HTTPS — enough to stop casual tampering, not a full auth system. Upgrade to Google Sign-In later if needed.
- Deleting a form is a **soft delete** (marked inactive); its tab and responses are kept.
- Apps Script quotas apply (Drive/UrlFetch/execution time) but are ample for feedback-form use.
- POST requests are sent as `text/plain` on purpose — this makes them CORS "simple requests" so the browser skips a preflight that Apps Script can't answer.

## Local testing
Serve the folder over HTTP (not `file://`) so `fetch` works, e.g.:

```
python -m http.server 8000
```

Then open <http://localhost:8000/>. The `/exec` endpoint allows any origin, so localhost works too.
