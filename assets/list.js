(function () {
  var statusEl = document.getElementById('status');
  var listEl = document.getElementById('list');
  var CACHE_KEY = 'formmaker.forms.v1';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
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

  // 1) Instant paint from the last known list (stale-while-revalidate).
  var hadCache = false;
  try {
    var cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (cached && cached.length) { hadCache = true; render(cached); }
  } catch (e) { /* ignore corrupt cache */ }

  if (!hadCache) {
    statusEl.className = 'notice info';
    statusEl.textContent = 'Loading forms…';
  }

  // 2) Fetch fresh in the background and update if anything changed.
  API.listForms().then(function (forms) {
    var fresh = JSON.stringify(forms);
    var prev = localStorage.getItem(CACHE_KEY);
    try { localStorage.setItem(CACHE_KEY, fresh); } catch (e) { /* storage full/blocked */ }
    if (fresh !== prev) render(forms);
    else statusEl.classList.add('hidden');
  }).catch(function (err) {
    // Keep showing cached results if we have them; only surface errors otherwise.
    if (!hadCache) {
      statusEl.className = 'notice err';
      statusEl.textContent = err.message;
      statusEl.classList.remove('hidden');
    }
  });
})();
