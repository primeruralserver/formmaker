// Thin client for the Apps Script Web App.
//
// POST bodies are sent as text/plain so the browser treats them as "simple
// requests" and skips the CORS preflight (Apps Script cannot answer OPTIONS).
// The /exec endpoint returns JSON with Access-Control-Allow-Origin: * via its
// googleusercontent redirect, which fetch follows transparently.

(function () {
  function apiUrl() {
    var url = window.APP_CONFIG && window.APP_CONFIG.API_URL;
    if (!url || url.indexOf('PASTE_YOUR') === 0) {
      throw new Error('API_URL is not configured. Edit config.js and set your Apps Script /exec URL.');
    }
    return url;
  }

  async function get(action, params) {
    var qs = new URLSearchParams(Object.assign({ action: action }, params || {}));
    var res = await fetch(apiUrl() + '?' + qs.toString(), { method: 'GET' });
    return handle(res);
  }

  async function post(payload) {
    var res = await fetch(apiUrl(), {
      method: 'POST',
      // text/plain avoids a CORS preflight; the server JSON.parses the body.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });
    return handle(res);
  }

  async function handle(res) {
    var data;
    try {
      data = await res.json();
    } catch (e) {
      throw new Error('Server returned an unexpected response. Check the deployment URL and access settings.');
    }
    if (!data.ok) throw new Error(data.error || 'Request failed.');
    return data;
  }

  function readFileAsBase64(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        // strip the "data:<mime>;base64," prefix
        var result = String(reader.result);
        resolve(result.slice(result.indexOf(',') + 1));
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  window.API = {
    listForms: function () {
      return get('listForms').then(function (d) { return d.forms; });
    },
    getForm: function (formId) {
      return get('getForm', { formId: formId }).then(function (d) { return d.form; });
    },
    submitEntry: function (formId, values) {
      return post({ action: 'submitEntry', formId: formId, values: values });
    },
    createForm: function (form, pass) {
      return post({ action: 'createForm', pass: pass, title: form.title, description: form.description, schema: form.schema })
        .then(function (d) { return d.form; });
    },
    updateForm: function (formId, form, pass) {
      return post({ action: 'updateForm', pass: pass, formId: formId, title: form.title, description: form.description, schema: form.schema })
        .then(function (d) { return d.form; });
    },
    deleteForm: function (formId, pass) {
      return post({ action: 'deleteForm', pass: pass, formId: formId });
    },
    uploadFile: async function (file) {
      var data = await readFileAsBase64(file);
      var d = await post({ action: 'uploadFile', fileName: file.name, mimeType: file.type, data: data });
      return d.url;
    }
  };
})();
