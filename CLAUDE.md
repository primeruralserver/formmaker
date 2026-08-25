# Form Builder → Google Sheets

Static form-builder web app on **GitHub Pages** that talks to a **Google Apps Script Web App**, storing everything in a **Google Sheet**. Building a form creates a new sheet tab; each submission appends a row to that tab.

## Live locations
- **Site:** https://primeruralserver.github.io/formmaker/
- **Repo:** https://github.com/primeruralserver/formmaker (public, `main` branch, Pages from root)
- **GitHub account:** `primeruralserver` (gh CLI authenticated; git author `DeimiwanDylan` / minha.primehub@gmail.com)
- **Apps Script `/exec` URL:** stored in `config.js` (`window.APP_CONFIG.API_URL`). Public by design.

## Architecture
```
GitHub Pages (static)            Apps Script Web App        Google Sheet + Drive
index.html  list forms  ─GET──▶  listForms / export  ──▶    _Forms registry tab
form.html   fill+submit ─POST─▶  submitEntry         ──▶    <form> tab (append row)
admin.html  build form  ─POST─▶  createForm          ──▶    new tab + registry row
                                 uploadFile          ──▶    Drive folder → link
```

## Key files
- `appscript/Code.gs` — backend (deploy as Web App: Execute as Me, Access Anyone). Actions: `listForms`, `getForm`, `export`, `ping` (GET); `createForm`, `updateForm`, `deleteForm`, `submitEntry`, `uploadFile` (POST). Config via Script Properties: `SHEET_ID`, `ADMIN_PASSPHRASE`, `DRIVE_FOLDER_ID`.
- `config.js` — the one value to edit: the `/exec` URL.
- `assets/api.js` — client wrapper. **POSTs use `Content-Type: text/plain`** on purpose so they're CORS "simple requests" (Apps Script can't answer preflight). `getCatalog()` fetches the static CDN catalog.
- `index.html` + `assets/list.js`, `form.html` + `assets/form.js`, `admin.html` + `assets/builder.js`, `assets/styles.css`.
- `data/catalog.json` — static cache of all active forms + schemas, served instantly by Pages CDN.
- `.github/workflows/sync-forms.yml` — refreshes `catalog.json` from `?action=export` every ~15 min + on manual dispatch; commit-if-changed.

## How it fits together (important behaviors)
- **Auth:** building/editing forms needs the admin passphrase (checked server-side against `ADMIN_PASSPHRASE`). Submissions are open. Passphrase held only in-memory in the builder.
- **Speed / caching (two layers):**
  1. Server: `listForms`/`export` cached in Apps Script `CacheService`; busted on any create/update/delete (`bustFormsCache_`).
  2. Static catalog: `index.html`/`form.html` paint **instantly** from `data/catalog.json` (CDN), then run a background **comparison check** against the live Web App so a form created since the last sync still appears at normal speed.
- **Field types:** text, textarea, number (min/max), email, date, dropdown, radio, checkboxes (joined with `, `), rating (stars), file (uploaded to Drive, cell holds link).
- **Delete is a soft delete** (registry `active=false`); tab + responses preserved.
- **Mobile:** responsive — 16px inputs (no iOS zoom), 44px touch targets, `@media (max-width:600px)` stacks builder rows + full-width buttons.

## Deploying changes
- **Frontend (HTML/CSS/JS, catalog):** commit + push to `main`. GitHub Pages auto-rebuilds. Verify build:
  `gh api "repos/primeruralserver/formmaker/pages/builds/latest" --jq '{status,commit}'` (wait for `status=built` on the new commit sha), then curl the live file with a cache-buster.
- **Backend (`Code.gs`):** ⚠️ **manual step — I cannot do this from here** (no `clasp` linkage; deploy lives in the Apps Script editor under the user's Google account). User must: paste updated `Code.gs` → Save → Deploy ▸ Manage deployments ▸ Edit (pencil) ▸ **New version** ▸ Deploy (keeps the same `/exec` URL). After they say done, verify with:
  `curl -sL "$API?action=export"` (expect `ok:true`).
- **Force a catalog sync:** `gh workflow run "sync-forms.yml" --ref main` (repo workflow permissions already set to write).

## Useful verification commands
```bash
API=$(grep -oE "https://script.google.com/macros/s/[^']+/exec" config.js)
curl -sL "$API?action=listForms"          # live forms
curl -sL "$action?action=export"          # full catalog (all schemas)
curl -s "https://primeruralserver.github.io/formmaker/data/catalog.json?cb=$(date +%s)"
```

## Environment / gotchas
- Windows + PowerShell primary; Bash tool available. `cd "C:/Feedback form"` before git.
- Git shows harmless `LF will be replaced by CRLF` warnings — ignore.
- Apps Script has an unavoidable per-request latency floor (cold start + `/exec` redirect); the static catalog is the mitigation, not a backend tweak.

## Open / offered but not done
- **Instant catalog propagation on form create** (new form instant for everyone within seconds vs ≤15 min) — needs a GitHub token in Apps Script Script Properties.
- **`clasp` CLI setup** for one-command backend deploys — needs interactive `clasp login` + script ID from the user.
