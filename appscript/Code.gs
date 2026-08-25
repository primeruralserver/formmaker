/**
 * Form Builder → Google Sheets — Apps Script Web App backend.
 *
 * Deploy: Deploy ▸ New deployment ▸ Web app
 *   - Execute as: Me
 *   - Who has access: Anyone
 * Copy the /exec URL into config.js on the frontend.
 *
 * Script Properties (Project Settings ▸ Script Properties):
 *   SHEET_ID          - id of the target Google Sheet
 *   ADMIN_PASSPHRASE  - secret required to create/edit/delete forms
 *   DRIVE_FOLDER_ID   - Drive folder where uploaded files are stored
 */

var REGISTRY_TAB = '_Forms';
var REGISTRY_HEADER = ['formId', 'title', 'description', 'tabName', 'schemaJson', 'createdAt', 'active'];

/* ------------------------------------------------------------------ *
 * Routing
 * ------------------------------------------------------------------ */

function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) || '';
    switch (action) {
      case 'listForms':
        return jsonOut_({ ok: true, forms: listForms_() });
      case 'getForm':
        return jsonOut_({ ok: true, form: getForm_(e.parameter.formId) });
      case 'ping':
        return jsonOut_({ ok: true, pong: true });
      default:
        return jsonOut_({ ok: false, error: 'Unknown action: ' + action });
    }
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err && err.message || err) });
  }
}

function doPost(e) {
  try {
    var body = {};
    if (e && e.postData && e.postData.contents) {
      body = JSON.parse(e.postData.contents);
    }
    var action = body.action || '';
    switch (action) {
      case 'createForm':
        requirePass_(body.pass);
        return jsonOut_({ ok: true, form: createForm_(body) });
      case 'updateForm':
        requirePass_(body.pass);
        return jsonOut_({ ok: true, form: updateForm_(body) });
      case 'deleteForm':
        requirePass_(body.pass);
        return jsonOut_({ ok: true, deleted: deleteForm_(body.formId) });
      case 'submitEntry':
        return jsonOut_({ ok: true, row: submitEntry_(body) });
      case 'uploadFile':
        return jsonOut_({ ok: true, url: uploadFile_(body) });
      default:
        return jsonOut_({ ok: false, error: 'Unknown action: ' + action });
    }
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err && err.message || err) });
  }
}

/* ------------------------------------------------------------------ *
 * Form registry operations
 * ------------------------------------------------------------------ */

function listForms_() {
  var sheet = ensureRegistry_();
  var values = sheet.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var row = rowToObj_(values[i]);
    if (String(row.active) === 'false') continue;
    out.push({ formId: row.formId, title: row.title, description: row.description });
  }
  return out;
}

function getForm_(formId) {
  var rec = findFormRow_(formId);
  if (!rec) throw new Error('Form not found: ' + formId);
  var row = rowToObj_(rec.values);
  return {
    formId: row.formId,
    title: row.title,
    description: row.description,
    schema: JSON.parse(row.schemaJson || '[]')
  };
}

function createForm_(body) {
  validateSchema_(body.schema);
  var ss = getSpreadsheet_();
  var formId = 'frm_' + shortId_();
  var tabName = uniqueTabName_(ss, body.title || 'Form');

  // Create the entry tab with a header row derived from field labels.
  var tab = ss.insertSheet(tabName);
  var header = ['Timestamp'].concat(body.schema.map(function (f) { return f.label; }));
  tab.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold');
  tab.setFrozenRows(1);

  var registry = ensureRegistry_();
  registry.appendRow([
    formId,
    body.title || '',
    body.description || '',
    tabName,
    JSON.stringify(body.schema),
    new Date().toISOString(),
    true
  ]);

  return { formId: formId, tabName: tabName };
}

function updateForm_(body) {
  validateSchema_(body.schema);
  var rec = findFormRow_(body.formId);
  if (!rec) throw new Error('Form not found: ' + body.formId);
  var registry = ensureRegistry_();
  var row = rowToObj_(rec.values);

  // Keep existing tab; refresh header to match new schema labels.
  var ss = getSpreadsheet_();
  var tab = ss.getSheetByName(row.tabName);
  if (tab) {
    var header = ['Timestamp'].concat(body.schema.map(function (f) { return f.label; }));
    tab.getRange(1, 1, 1, Math.max(header.length, tab.getLastColumn()))
       .clearContent();
    tab.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold');
  }

  var colIndex = REGISTRY_HEADER.indexOf('title') + 1;
  registry.getRange(rec.rowNumber, colIndex).setValue(body.title || '');
  registry.getRange(rec.rowNumber, REGISTRY_HEADER.indexOf('description') + 1).setValue(body.description || '');
  registry.getRange(rec.rowNumber, REGISTRY_HEADER.indexOf('schemaJson') + 1).setValue(JSON.stringify(body.schema));
  return { formId: body.formId };
}

function deleteForm_(formId) {
  var rec = findFormRow_(formId);
  if (!rec) throw new Error('Form not found: ' + formId);
  var registry = ensureRegistry_();
  // Soft delete: flag inactive so submissions/history are preserved.
  registry.getRange(rec.rowNumber, REGISTRY_HEADER.indexOf('active') + 1).setValue(false);
  return formId;
}

/* ------------------------------------------------------------------ *
 * Submissions
 * ------------------------------------------------------------------ */

function submitEntry_(body) {
  var rec = findFormRow_(body.formId);
  if (!rec) throw new Error('Form not found: ' + body.formId);
  var row = rowToObj_(rec.values);
  if (String(row.active) === 'false') throw new Error('This form is no longer accepting responses.');

  var schema = JSON.parse(row.schemaJson || '[]');
  var values = body.values || {};
  var record = [new Date()];

  for (var i = 0; i < schema.length; i++) {
    var field = schema[i];
    var val = values[field.id];

    if (field.required && isEmpty_(val)) {
      throw new Error('Missing required field: ' + field.label);
    }
    record.push(formatValue_(field, val));
  }

  var ss = getSpreadsheet_();
  var tab = ss.getSheetByName(row.tabName);
  if (!tab) throw new Error('Entry tab missing for form: ' + body.formId);
  tab.appendRow(record);
  return record.length;
}

function formatValue_(field, val) {
  if (isEmpty_(val)) return '';
  if (field.type === 'checkboxes' && Array.isArray(val)) {
    return val.join(', ');
  }
  return val;
}

/* ------------------------------------------------------------------ *
 * File uploads
 * ------------------------------------------------------------------ */

function uploadFile_(body) {
  var folderId = prop_('DRIVE_FOLDER_ID');
  if (!folderId) throw new Error('DRIVE_FOLDER_ID script property is not set.');
  if (!body.data) throw new Error('No file data provided.');

  // body.data is a base64 string (without the data: URL prefix).
  var bytes = Utilities.base64Decode(body.data);
  var blob = Utilities.newBlob(bytes, body.mimeType || 'application/octet-stream', body.fileName || 'upload');
  var folder = DriveApp.getFolderById(folderId);
  var file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return file.getUrl();
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

function getSpreadsheet_() {
  var id = prop_('SHEET_ID');
  if (!id) throw new Error('SHEET_ID script property is not set.');
  return SpreadsheetApp.openById(id);
}

function ensureRegistry_() {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(REGISTRY_TAB);
  if (!sheet) {
    sheet = ss.insertSheet(REGISTRY_TAB);
    sheet.getRange(1, 1, 1, REGISTRY_HEADER.length).setValues([REGISTRY_HEADER]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function findFormRow_(formId) {
  if (!formId) return null;
  var sheet = ensureRegistry_();
  var values = sheet.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]) === String(formId)) {
      return { rowNumber: i + 1, values: values[i] };
    }
  }
  return null;
}

function rowToObj_(rowValues) {
  var obj = {};
  for (var i = 0; i < REGISTRY_HEADER.length; i++) {
    obj[REGISTRY_HEADER[i]] = rowValues[i];
  }
  return obj;
}

function uniqueTabName_(ss, title) {
  var base = String(title).replace(/[\[\]\*\/\\\?:]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90) || 'Form';
  var name = base;
  var n = 2;
  while (ss.getSheetByName(name) || name === REGISTRY_TAB) {
    name = base + ' (' + n + ')';
    n++;
  }
  return name;
}

function validateSchema_(schema) {
  if (!Array.isArray(schema) || schema.length === 0) {
    throw new Error('A form must have at least one field.');
  }
  var allowed = { text: 1, textarea: 1, number: 1, email: 1, date: 1, dropdown: 1, radio: 1, checkboxes: 1, rating: 1, file: 1 };
  for (var i = 0; i < schema.length; i++) {
    var f = schema[i];
    if (!f.id || !f.type || !f.label) throw new Error('Each field needs id, type and label.');
    if (!allowed[f.type]) throw new Error('Unsupported field type: ' + f.type);
    if ((f.type === 'dropdown' || f.type === 'radio' || f.type === 'checkboxes')) {
      if (!Array.isArray(f.options) || f.options.length === 0) {
        throw new Error('Field "' + f.label + '" needs at least one option.');
      }
    }
  }
}

function requirePass_(pass) {
  var expected = prop_('ADMIN_PASSPHRASE');
  if (!expected) throw new Error('ADMIN_PASSPHRASE script property is not set.');
  if (String(pass) !== String(expected)) throw new Error('Invalid passphrase.');
}

function isEmpty_(v) {
  if (v === null || v === undefined) return true;
  if (Array.isArray(v)) return v.length === 0;
  return String(v).trim() === '';
}

function shortId_() {
  return Utilities.getUuid().replace(/-/g, '').slice(0, 8);
}

function prop_(key) {
  return PropertiesService.getScriptProperties().getProperty(key);
}

function jsonOut_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ------------------------------------------------------------------ *
 * Optional: run once in the editor to verify configuration.
 * ------------------------------------------------------------------ */
function test_() {
  ensureRegistry_();
  Logger.log('Registry ready. Forms: ' + JSON.stringify(listForms_()));
}
