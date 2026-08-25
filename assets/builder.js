(function () {
  var fieldsEl = document.getElementById('fields');
  var msg = document.getElementById('msg');
  var saveBtn = document.getElementById('saveBtn');

  var TYPES = {
    text: 'Short text', textarea: 'Long text', number: 'Number', email: 'Email',
    date: 'Date', dropdown: 'Dropdown', radio: 'Single choice', checkboxes: 'Multiple choice',
    rating: 'Rating / scale', file: 'File upload'
  };
  var HAS_OPTIONS = { dropdown: 1, radio: 1, checkboxes: 1 };

  var fields = []; // { uid, type, label, required, options, min, max }
  var seq = 1;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function addField(type) {
    fields.push({
      uid: 'u' + (seq++),
      type: type,
      label: '',
      required: false,
      options: HAS_OPTIONS[type] ? 'Option 1\nOption 2' : '',
      min: '',
      max: type === 'rating' ? '5' : ''
    });
    render();
  }

  function render() {
    if (!fields.length) {
      fieldsEl.innerHTML = '<div class="notice info">No fields yet. Add one below.</div>';
      return;
    }
    fieldsEl.innerHTML = fields.map(function (f, idx) {
      var rows = '';
      rows += '<div class="row">' +
        '<span class="tag">' + esc(TYPES[f.type]) + '</span>' +
        '<input type="text" data-uid="' + f.uid + '" data-k="label" placeholder="Question label" value="' + esc(f.label) + '" />' +
        '<label class="choice"><input type="checkbox" data-uid="' + f.uid + '" data-k="required" ' + (f.required ? 'checked' : '') + ' /> required</label>' +
        '</div>';

      if (HAS_OPTIONS[f.type]) {
        rows += '<div class="row"><textarea data-uid="' + f.uid + '" data-k="options" placeholder="One option per line">' + esc(f.options) + '</textarea></div>';
      }
      if (f.type === 'number') {
        rows += '<div class="row">' +
          '<input type="number" data-uid="' + f.uid + '" data-k="min" placeholder="min (optional)" value="' + esc(f.min) + '" />' +
          '<input type="number" data-uid="' + f.uid + '" data-k="max" placeholder="max (optional)" value="' + esc(f.max) + '" />' +
          '</div>';
      }
      if (f.type === 'rating') {
        rows += '<div class="row"><input type="number" min="2" max="10" data-uid="' + f.uid + '" data-k="max" placeholder="stars (e.g. 5)" value="' + esc(f.max) + '" /></div>';
      }

      rows += '<div class="row end">' +
        '<button class="btn ghost small" type="button" data-move="up" data-uid="' + f.uid + '" ' + (idx === 0 ? 'disabled' : '') + '>↑</button>' +
        '<button class="btn ghost small" type="button" data-move="down" data-uid="' + f.uid + '" ' + (idx === fields.length - 1 ? 'disabled' : '') + '>↓</button>' +
        '<button class="btn ghost small" type="button" data-remove="' + f.uid + '" style="color:var(--danger)">Remove</button>' +
        '</div>';

      return '<div class="builder-field">' + rows + '</div>';
    }).join('');
  }

  function find(uid) { return fields.filter(function (f) { return f.uid === uid; })[0]; }

  // Delegated input handling keeps state in sync with the DOM.
  fieldsEl.addEventListener('input', function (e) {
    var el = e.target;
    var uid = el.getAttribute('data-uid');
    var k = el.getAttribute('data-k');
    if (!uid || !k) return;
    var f = find(uid);
    if (!f) return;
    f[k] = el.type === 'checkbox' ? el.checked : el.value;
  });

  fieldsEl.addEventListener('click', function (e) {
    var rm = e.target.getAttribute('data-remove');
    if (rm) {
      fields = fields.filter(function (f) { return f.uid !== rm; });
      render();
      return;
    }
    var move = e.target.getAttribute('data-move');
    if (move) {
      var uid = e.target.getAttribute('data-uid');
      var i = fields.findIndex(function (f) { return f.uid === uid; });
      var j = move === 'up' ? i - 1 : i + 1;
      if (j < 0 || j >= fields.length) return;
      var tmp = fields[i]; fields[i] = fields[j]; fields[j] = tmp;
      render();
    }
  });

  document.getElementById('addField').addEventListener('click', function () {
    addField(document.getElementById('newType').value);
  });

  function buildSchema() {
    return fields.map(function (f, i) {
      var out = { id: f.uid, type: f.type, label: String(f.label).trim(), required: !!f.required };
      if (HAS_OPTIONS[f.type]) {
        out.options = String(f.options).split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
      }
      if (f.type === 'number') { out.min = f.min; out.max = f.max; }
      if (f.type === 'rating') { out.max = f.max || '5'; }
      return out;
    });
  }

  function validate(title, schema) {
    if (!title.trim()) return 'Please enter a form title.';
    if (!schema.length) return 'Add at least one field.';
    for (var i = 0; i < schema.length; i++) {
      var f = schema[i];
      if (!f.label) return 'Field ' + (i + 1) + ' needs a label.';
      if (HAS_OPTIONS[f.type] && (!f.options || !f.options.length)) {
        return 'Field “' + f.label + '” needs at least one option.';
      }
    }
    return null;
  }

  saveBtn.addEventListener('click', async function () {
    msg.innerHTML = '';
    var pass = document.getElementById('pass').value;
    var title = document.getElementById('title').value;
    var description = document.getElementById('description').value;
    var schema = buildSchema();

    if (!pass) { msg.innerHTML = '<div class="notice err">Enter the admin passphrase.</div>'; return; }
    var problem = validate(title, schema);
    if (problem) { msg.innerHTML = '<div class="notice err">' + esc(problem) + '</div>'; return; }

    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';
    try {
      var res = await API.createForm({ title: title, description: description, schema: schema }, pass);
      var link = 'form.html?form=' + encodeURIComponent(res.formId);
      msg.innerHTML = '<div class="notice ok">Form created! ' +
        'Share this link: <a href="' + link + '">' + link + '</a> — ' +
        'a “' + esc(res.tabName) + '” tab was added to your sheet.</div>';
      saveBtn.textContent = 'Saved';
    } catch (err) {
      msg.innerHTML = '<div class="notice err">' + esc(err.message) + '</div>';
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save form';
    }
  });

  render();
})();
