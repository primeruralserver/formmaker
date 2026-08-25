(function () {
  var statusEl = document.getElementById('status');
  var card = document.getElementById('formCard');
  var fieldsEl = document.getElementById('fields');
  var formMsg = document.getElementById('formMsg');
  var submitBtn = document.getElementById('submitBtn');
  var theForm = document.getElementById('theForm');

  var schema = [];
  var formId = new URLSearchParams(location.search).get('form');

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  if (!formId) {
    statusEl.className = 'notice err';
    statusEl.textContent = 'No form specified.';
    return;
  }

  var painted = false;

  function paint(form) {
    // Don't repaint if the user has already started filling the form.
    if (painted && formTouched()) return;
    schema = form.schema || [];
    statusEl.classList.add('hidden');
    card.classList.remove('hidden');
    document.getElementById('title').textContent = form.title || 'Form';
    document.title = form.title || 'Form';
    var desc = document.getElementById('description');
    if (form.description) { desc.textContent = form.description; desc.classList.remove('hidden'); }
    else { desc.classList.add('hidden'); }
    renderFields();
    painted = true;
  }

  function formTouched() {
    // Any non-empty control means the visitor started answering.
    var els = theForm.querySelectorAll('input, textarea, select');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if ((el.type === 'checkbox' || el.type === 'radio') && el.checked) return true;
      if (el.type !== 'checkbox' && el.type !== 'radio' && el.value) return true;
    }
    var star = fieldsEl.querySelector('.stars[data-value]:not([data-value="0"])');
    return !!star;
  }

  // 1) Instant render from the static catalog if this form is already cached.
  API.getCatalog().then(function (cat) {
    var hit = (cat.forms || []).filter(function (f) { return f.formId === formId; })[0];
    if (hit && !painted) paint(hit);
  }).catch(function () { /* no catalog — the live fetch below covers it */ });

  // 2) Live fetch: renders a form newer than the last sync, and refreshes an
  //    edited schema. Only surfaces an error if nothing was painted from cache.
  API.getForm(formId).then(function (form) {
    paint(form);
  }).catch(function (err) {
    if (!painted) {
      statusEl.className = 'notice err';
      statusEl.textContent = err.message;
    }
  });

  function renderFields() {
    fieldsEl.innerHTML = schema.map(function (f) {
      var label = '<label class="field-label">' + esc(f.label) +
        (f.required ? '<span class="req">*</span>' : '') + '</label>';
      return '<div data-fid="' + esc(f.id) + '">' + label + control(f) + '</div>';
    }).join('');

    // wire up star ratings
    fieldsEl.querySelectorAll('.stars').forEach(function (starWrap) {
      starWrap.addEventListener('click', function (e) {
        var star = e.target.closest('.star');
        if (!star) return;
        var val = Number(star.dataset.val);
        starWrap.dataset.value = val;
        starWrap.querySelectorAll('.star').forEach(function (s) {
          s.classList.toggle('on', Number(s.dataset.val) <= val);
        });
      });
    });
  }

  function control(f) {
    var name = 'f_' + f.id;
    switch (f.type) {
      case 'textarea':
        return '<textarea name="' + name + '"></textarea>';
      case 'number':
        return '<input type="number" name="' + name + '" ' + minmax(f) + ' />';
      case 'email':
        return '<input type="email" name="' + name + '" />';
      case 'date':
        return '<input type="date" name="' + name + '" />';
      case 'file':
        return '<input type="file" name="' + name + '" />';
      case 'dropdown':
        return '<select name="' + name + '"><option value="">— Select —</option>' +
          f.options.map(function (o) { return '<option>' + esc(o) + '</option>'; }).join('') + '</select>';
      case 'radio':
        return '<div class="choices">' + f.options.map(function (o, i) {
          return '<label class="choice"><input type="radio" name="' + name + '" value="' + esc(o) + '" /> ' + esc(o) + '</label>';
        }).join('') + '</div>';
      case 'checkboxes':
        return '<div class="choices">' + f.options.map(function (o) {
          return '<label class="choice"><input type="checkbox" name="' + name + '" value="' + esc(o) + '" /> ' + esc(o) + '</label>';
        }).join('') + '</div>';
      case 'rating':
        var max = Number(f.max) || 5;
        var stars = '';
        for (var i = 1; i <= max; i++) stars += '<span class="star" data-val="' + i + '">★</span>';
        return '<div class="stars" data-value="0">' + stars + '</div>';
      default: // text
        return '<input type="text" name="' + name + '" />';
    }
  }

  function minmax(f) {
    var s = '';
    if (f.min !== '' && f.min != null) s += 'min="' + esc(f.min) + '" ';
    if (f.max !== '' && f.max != null) s += 'max="' + esc(f.max) + '" ';
    return s;
  }

  function readValue(f) {
    var name = 'f_' + f.id;
    if (f.type === 'checkboxes') {
      return Array.prototype.slice.call(theForm.querySelectorAll('input[name="' + name + '"]:checked'))
        .map(function (el) { return el.value; });
    }
    if (f.type === 'radio') {
      var checked = theForm.querySelector('input[name="' + name + '"]:checked');
      return checked ? checked.value : '';
    }
    if (f.type === 'rating') {
      var wrap = fieldsEl.querySelector('[data-fid="' + f.id + '"] .stars');
      var v = Number(wrap.dataset.value || 0);
      return v ? v : '';
    }
    if (f.type === 'file') {
      var input = theForm.querySelector('input[name="' + name + '"]');
      return input.files && input.files[0] ? input.files[0] : null;
    }
    var el = theForm.querySelector('[name="' + name + '"]');
    return el ? el.value.trim() : '';
  }

  function isEmpty(v) {
    if (v == null) return true;
    if (Array.isArray(v)) return v.length === 0;
    return String(v).trim() === '';
  }

  theForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    formMsg.innerHTML = '';
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting…';

    try {
      var values = {};
      // First pass: validate + collect, uploading files as we go.
      for (var i = 0; i < schema.length; i++) {
        var f = schema[i];
        var raw = readValue(f);

        if (f.required && isEmpty(raw)) {
          throw new Error('Please fill in “' + f.label + '”.');
        }
        if (f.type === 'email' && !isEmpty(raw) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) {
          throw new Error('“' + f.label + '” must be a valid email address.');
        }
        if (f.type === 'file' && raw) {
          submitBtn.textContent = 'Uploading file…';
          values[f.id] = await API.uploadFile(raw);
        } else if (f.type === 'file') {
          values[f.id] = '';
        } else {
          values[f.id] = raw;
        }
      }

      submitBtn.textContent = 'Submitting…';
      await API.submitEntry(formId, values);

      card.querySelector('#fields').classList.add('hidden');
      theForm.querySelector('.row.end').classList.add('hidden');
      formMsg.innerHTML = '<div class="notice ok">Thanks! Your response has been recorded.</div>';
    } catch (err) {
      formMsg.innerHTML = '<div class="notice err">' + esc(err.message) + '</div>';
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit';
    }
  });
})();
