(function () {
  var statusEl = document.getElementById('status');
  var listEl = document.getElementById('list');

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  API.listForms().then(function (forms) {
    if (!forms.length) {
      statusEl.className = 'notice info';
      statusEl.textContent = 'No forms yet. Click “Build a form” to create one.';
      return;
    }
    statusEl.classList.add('hidden');
    listEl.innerHTML = forms.map(function (f) {
      return '<a class="card form-card" href="form.html?form=' + encodeURIComponent(f.formId) + '">' +
        '<h3>' + esc(f.title) + '</h3>' +
        (f.description ? '<p>' + esc(f.description) + '</p>' : '') +
        '</a>';
    }).join('');
  }).catch(function (err) {
    statusEl.className = 'notice err';
    statusEl.textContent = err.message;
  });
})();
