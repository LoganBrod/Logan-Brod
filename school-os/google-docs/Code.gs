/**
 * 中文 Checker for Google Docs.
 *
 * Adds a 中文 menu to the document. The sidebar checks the selection (or the whole document)
 * against everything in your own Chinese material, highlights what you have not learned right
 * in the text, and applies corrections that were verified to use only what you have learned.
 *
 * All the work happens on your School OS site; this script only sends the text there with the
 * key from Settings and paints the results into the document. Setup: README → "Chinese checker
 * in Google Docs".
 */

var COLORS = { unknown: "#fbd5d5", fresh: "#fdeeb8" };

function onOpen() {
  DocumentApp.getUi()
    .createMenu("中文")
    .addItem("Open checker", "showSidebar")
    .addItem("Clear highlights", "clearHighlights")
    .addSeparator()
    .addItem("Settings", "showSettings")
    .addToUi();
}

function onInstall() { onOpen(); }

function showSidebar() {
  DocumentApp.getUi().showSidebar(HtmlService.createHtmlOutputFromFile("Sidebar").setTitle("中文 Checker"));
}

function showSettings() {
  var ui = DocumentApp.getUi();
  var props = PropertiesService.getUserProperties();
  var site = ui.prompt("School OS site", "Your Vercel address, e.g. https://school-os-xxxx.vercel.app\n(now: " + (props.getProperty("site") || "not set") + ")", ui.ButtonSet.OK_CANCEL);
  if (site.getSelectedButton() !== ui.Button.OK) return;
  var key = ui.prompt("Key", "From the 中文 page on your site → \"Use it inside Google Docs\". Starts with sos_zh_.", ui.ButtonSet.OK_CANCEL);
  if (key.getSelectedButton() !== ui.Button.OK) return;
  var s = site.getResponseText().trim().replace(/\/+$/, "");
  if (s && !/^https?:\/\//.test(s)) s = "https://" + s;
  if (s) props.setProperty("site", s);
  if (key.getResponseText().trim()) props.setProperty("key", key.getResponseText().trim());
  ui.alert("Saved. Open 中文 → Open checker.");
}

/** Calls the School OS Chinese API. */
function api_(body) {
  var props = PropertiesService.getUserProperties();
  var site = props.getProperty("site"), key = props.getProperty("key");
  if (!site || !key) throw new Error("Not set up yet: 中文 → Settings.");
  var res = UrlFetchApp.fetch(site + "/api/chinese", {
    method: "post", contentType: "application/json", muteHttpExceptions: true,
    headers: { Authorization: "Bearer " + key },
    payload: JSON.stringify(body),
  });
  var code = res.getResponseCode(), text = res.getContentText();
  var data;
  try { data = JSON.parse(text); } catch (e) { throw new Error("The site answered " + code + (code === 401 ? ": the key is wrong or the password changed. 中文 → Settings." : ".")); }
  if (data.error) throw new Error(data.error);
  return data;
}

/** The text to work on: the selection if there is one, else the whole document. */
function target_() {
  var doc = DocumentApp.getActiveDocument();
  var sel = doc.getSelection();
  if (sel) {
    var parts = [];
    sel.getRangeElements().forEach(function (r) {
      var el = r.getElement();
      if (el.editAsText) {
        var t = el.asText().getText();
        parts.push(r.isPartial() ? t.substring(r.getStartOffset(), r.getEndOffsetInclusive() + 1) : t);
      }
    });
    var text = parts.join("\n").trim();
    if (text) return { text: text, scope: "selection" };
  }
  return { text: doc.getBody().getText(), scope: "document" };
}

/** Sidebar: check, highlight, and return the report. */
function checkDocument() {
  var t = target_();
  if (!t.text.trim()) throw new Error("The document is empty.");
  var data = api_({ op: "check", text: t.text });
  clearHighlights();
  var counts = paint_(data.result.flagged);
  return { scope: t.scope, result: data.result, painted: counts };
}

/** Sidebar: ask for a verified correction. Nothing changes in the document until a change is applied. */
function fixDocument() {
  var t = target_();
  if (!t.text.trim()) throw new Error("The document is empty.");
  var data = api_({ op: "fix", text: t.text });
  data.scope = t.scope;
  return data;
}

/** Sidebar: apply one change, keeping formatting around it. */
function applyChange(original, corrected) {
  var body = DocumentApp.getActiveDocument().getBody();
  var hit = body.findText(escape_(original));
  if (!hit) return false;
  var el = hit.getElement().asText();
  var start = hit.getStartOffset(), end = hit.getEndOffsetInclusive();
  el.deleteText(start, end);
  el.insertText(start, corrected);
  el.setBackgroundColor(start, start + corrected.length - 1, null);
  return true;
}

/** Sidebar: mark a word as learned on the School OS side. */
function allowWord(word) {
  api_({ op: "allow", word: word });
  var body = DocumentApp.getActiveDocument().getBody();
  var hit = null;
  while ((hit = body.findText(escape_(word), hit))) {
    hit.getElement().asText().setBackgroundColor(hit.getStartOffset(), hit.getEndOffsetInclusive(), null);
  }
  return true;
}

/** Paints every flagged word in the document. */
function paint_(flagged) {
  var body = DocumentApp.getActiveDocument().getBody();
  var n = 0;
  (flagged || []).forEach(function (f) {
    var color = f.status === "unknown" ? COLORS.unknown : COLORS.fresh;
    var hit = null;
    while ((hit = body.findText(escape_(f.word), hit))) {
      hit.getElement().asText().setBackgroundColor(hit.getStartOffset(), hit.getEndOffsetInclusive(), color);
      n++;
    }
  });
  return n;
}

/** Removes only this checker's highlights, never the student's own. */
function clearHighlights() {
  var body = DocumentApp.getActiveDocument().getBody();
  var mine = {}; mine[COLORS.unknown] = 1; mine[COLORS.fresh] = 1;
  var walk = function (el) {
    if (el.getType() === DocumentApp.ElementType.TEXT) {
      var text = el.asText(), len = text.getText().length;
      for (var i = 0; i < len; i++) {
        var c = text.getBackgroundColor(i);
        if (c && mine[c.toLowerCase()]) {
          var j = i; while (j + 1 < len && text.getBackgroundColor(j + 1) === c) j++;
          text.setBackgroundColor(i, j, null); i = j;
        }
      }
      return;
    }
    if (el.getNumChildren) for (var k = 0; k < el.getNumChildren(); k++) walk(el.getChild(k));
  };
  walk(body);
}

function escape_(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
