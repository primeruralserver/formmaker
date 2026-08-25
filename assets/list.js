(function () {
  var statusEl = document.getElementById('status');
  var listEl = document.getElementById('list');
  var CACHE_KEY = 'formmaker.forms.v1';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function slim(forms) {
    // Normalise to just what the list needs, so cache/live/API compare equal.
    return (forms || []).map(function (f) {
      return { formId: f.formId, title: f.title, description: f.description || '' };
    });
  }

  function render(forms) {
    if (!forms || !forms.length) {
      listEl.innerHTML = '';
      statusEl.className = 'notice info';
      statusEl.textContent = 'No forms yet. Click “Build a form” to create one.';
      statusEl.classList.remove('hidden');
      return;
    }
    statusEl.classList.add('hidden');
    listEl.innerHTML = forms.map(function (f) {
      return '<a class="card form-card" href="form.html?form=' + encodeURIComponent(f.formId) + '">' +
        '<h3>' + esc(f.title) + '</h3>' +
        (f.description ? '<p>' + esc(f.description) + '</p>' : '') +
        '</a>';
    }).join('');
  }

  var shown = null; // JSON string of what's currently rendered

  function show(forms) {
    var slimmed = slim(forms);
    var key = JSON.stringify(slimmed);
    if (key === shown) return;
    shown = key;
    render(slimmed);
    try { localStorage.setItem(CACHE_KEY, key); } catch (e) {}
  }

  // 1) Instant paint from the static GitHub catalog (CDN, no Apps Script).
  //    Fall back to localStorage if the catalog isn't reachable.
  API.getCatalog()
    .then(function (cat) { show(cat.forms); })
    .catch(function () {
      try {
        var cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
        if (cached && cached.length) show(cached);
        else { statusEl.className = 'notice info'; statusEl.textContent = 'Loading forms…'; }
      } catch (e) {}
    });

  // 2) Comparison check: reconcile against the live list so a form created
  //    since the last catalog sync still appears (at current Apps Script speed).
  API.listForms()
    .then(function (forms) { show(forms); })
    .catch(function (err) {
      if (shown === null) {
        statusEl.className = 'notice err';
        statusEl.textContent = err.message;
        statusEl.classList.remove('hidden');
      }
    });
})();
