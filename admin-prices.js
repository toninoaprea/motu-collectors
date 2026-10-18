// ============================================================
// MOTU COLLECTORS — ADMIN: PREZZI (USD) con esporta/importa CSV
// I prezzi si pubblicano in prices.js: { "<id pezzo o variante>": { l: loose, m: MOC } }
// ============================================================
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var box = $('prSerie'); if (!box || !window.MOTU_CATALOG) return;
  var A = function () { return window.MotuAdmin; };
  var CATALOG = window.MOTU_CATALOG, PAGE = 150;
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };

  // prezzi correnti: partono da quelli pubblicati (catalogo già con prices.js applicato) e si modificano qui
  var cur = {};      // id -> {l, m}  (valore mostrato)
  var base = {};     // id -> {l, m}  (valore pubblicato, per capire cosa è cambiato)
  var rows = [];     // {id, serie, sub, name, variant, year, retail}
  var shown = 0, filtered = [];

  function build() {
    Object.keys(CATALOG).forEach(function (serie) {
      Object.keys(CATALOG[serie]).forEach(function (sub) {
        CATALOG[serie][sub].forEach(function (it) {
          var vs = it.variants || [];
          rows.push({ id: it.id, serie: serie, sub: sub, name: it.name, variant: '', year: it.year, retail: it.priceRetail });
          setBase(it);
          vs.forEach(function (v) {
            rows.push({ id: v.id, serie: serie, sub: sub, name: it.name, variant: v.name, year: it.year, retail: it.priceRetail });
            setBase(v);
          });
        });
      });
    });
  }
  function setBase(o) {
    var l = Number(o.priceLoose) || 0, m = Number(o.priceMOC) || 0;
    base[o.id] = { l: l, m: m }; cur[o.id] = { l: l, m: m };
  }
  function changed(id) { return cur[id].l !== base[id].l || cur[id].m !== base[id].m; }
  function nChanged() { return Object.keys(cur).filter(changed).length; }
  function num(v) {   // accetta 12,5 / 12.5 / $12.50 / vuoto
    if (v == null) return null;
    var t = String(v).replace(/[^0-9,.\-]/g, '').trim();
    if (!t) return null;
    if (t.indexOf(',') >= 0 && t.indexOf('.') >= 0) t = t.replace(/\./g, '').replace(',', '.');   // 1.234,56
    else t = t.replace(',', '.');
    var n = parseFloat(t);
    return isNaN(n) || n < 0 ? null : Math.round(n * 100) / 100;
  }

  // ── filtri / tabella ──
  function fillSelects() {
    $('prSerie').innerHTML = '<option value="">ALL SERIES</option>' + Object.keys(CATALOG).map(function (s) { return '<option value="' + esc(s) + '">' + esc(s) + '</option>'; }).join('');
    fillSub();
  }
  function fillSub() {
    var s = $('prSerie').value;
    $('prSub').innerHTML = '<option value="">ALL SUBCATEGORIES</option>' + (s ? Object.keys(CATALOG[s]).map(function (x) { return '<option value="' + esc(x) + '">' + esc(x) + '</option>'; }).join('') : '');
    $('prSub').disabled = !s;
  }
  function apply() {
    var s = $('prSerie').value, sub = $('prSub').value, q = $('prSearch').value.trim().toLowerCase(), miss = $('prMissing').checked;
    filtered = rows.filter(function (r) {
      if (s && r.serie !== s) return false;
      if (sub && r.sub !== sub) return false;
      if (q && (r.name + ' ' + r.variant).toLowerCase().indexOf(q) < 0) return false;
      if (miss && (cur[r.id].l > 0 || cur[r.id].m > 0)) return false;
      return true;
    });
    draw(true);
  }
  function rowHtml(r) {
    var c = cur[r.id], ch = changed(r.id);
    return '<tr data-id="' + esc(r.id) + '"><td>' + esc(r.name) + (r.variant ? ' <span class="pr-var">– ' + esc(r.variant) + '</span>' : '') + '<span class="pr-sub">' + esc(r.serie + ' · ' + r.sub) + '</span></td>' +
      '<td>' + esc(r.year && r.year !== '-' ? r.year : '-') + '</td>' +
      '<td class="n">' + (r.retail > 0 ? '$' + r.retail : '-') + '</td>' +
      '<td class="n"><input inputmode="decimal" data-k="l" class="' + (ch ? 'chg' : '') + '" value="' + (c.l > 0 ? c.l : '') + '"></td>' +
      '<td class="n"><input inputmode="decimal" data-k="m" class="' + (ch ? 'chg' : '') + '" value="' + (c.m > 0 ? c.m : '') + '"></td></tr>';
  }
  function draw(reset) {
    var body = $('prBody');
    if (reset) { body.innerHTML = ''; shown = 0; }
    var next = filtered.slice(shown, shown + PAGE);
    body.insertAdjacentHTML('beforeend', next.map(rowHtml).join(''));
    shown += next.length;
    $('prMore').hidden = shown >= filtered.length;
    $('prMore').textContent = 'SHOW MORE (' + (filtered.length - shown) + ')';
    count();
  }
  function count() {
    var withP = rows.filter(function (r) { return cur[r.id].l > 0 || cur[r.id].m > 0; }).length;
    $('prCount').textContent = filtered.length + ' rows · ' + withP + ' / ' + rows.length + ' with a price · ' + nChanged() + ' unpublished changes';
  }

  // ── CSV ──
  function download(name, text) {
    var blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' }), a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  }
  function q(v) { v = String(v == null ? '' : v); return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function dec(n) { return n > 0 ? String(n).replace('.', ',') : ''; }   // Excel italiano: virgola decimale
  function exportCsv() {
    var list = filtered.length ? filtered : rows;
    var lines = ['id;series;subcategory;name;variant;year;retail_usd;loose_usd;moc_usd'];
    list.forEach(function (r) {
      lines.push([r.id, r.serie, r.sub, r.name, r.variant, r.year, dec(r.retail), dec(cur[r.id].l), dec(cur[r.id].m)].map(q).join(';'));
    });
    download('motu-prices.csv', lines.join('\r\n'));
    A().setMsg($('prMsg'), 'Exported ' + list.length + ' rows (' + ($('prSerie').value || 'all series') + '). Fill in loose_usd and moc_usd, keep the id column, then import.', 'ok');
  }
  function parseCsv(text) {
    text = text.replace(/^﻿/, '');
    var first = text.split(/\r?\n/)[0] || '', delim = first.indexOf(';') >= 0 ? ';' : (first.indexOf('\t') >= 0 ? '\t' : ',');
    var out = [], row = [], f = '', inq = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (inq) { if (ch === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else inq = false; } else f += ch; }
      else if (ch === '"') inq = true;
      else if (ch === delim) { row.push(f); f = ''; }
      else if (ch === '\n') { row.push(f.replace(/\r$/, '')); out.push(row); row = []; f = ''; }
      else f += ch;
    }
    if (f || row.length) { row.push(f.replace(/\r$/, '')); out.push(row); }
    return out.filter(function (r) { return r.some(function (x) { return String(x).trim(); }); });
  }
  function importCsv(text) {
    var t = parseCsv(text);
    if (t.length < 2) return A().setMsg($('prMsg'), 'The file is empty.', 'err');
    var head = t[0].map(function (h) { return h.trim().toLowerCase(); });
    var iId = head.indexOf('id'), iL = head.indexOf('loose_usd'), iM = head.indexOf('moc_usd');
    if (iId < 0 || (iL < 0 && iM < 0)) return A().setMsg($('prMsg'), 'Columns not found: the file needs "id" and "loose_usd" / "moc_usd" (use the exported file).', 'err');
    var upd = 0, unknown = 0, bad = 0;
    t.slice(1).forEach(function (r) {
      var id = (r[iId] || '').trim();
      if (!cur[id]) { if (id) unknown++; return; }
      var touched = false;
      [['l', iL], ['m', iM]].forEach(function (p) {
        if (p[1] < 0) return;
        var raw = (r[p[1]] || '').trim();
        if (!raw) return;
        var n = num(raw);
        if (n == null) { bad++; return; }
        if (cur[id][p[0]] !== n) { cur[id][p[0]] = n; touched = true; }
      });
      if (touched) upd++;
    });
    apply();
    A().setMsg($('prMsg'), 'Imported: ' + upd + ' rows updated' + (unknown ? ', ' + unknown + ' unknown ids skipped' : '') + (bad ? ', ' + bad + ' invalid values skipped' : '') + '. Check the table, then press PUBLISH PRICES.', upd ? 'ok' : '');
  }

  // ── pubblicazione: prices.js ──
  var busy = false;
  async function publish() {
    if (busy) return;
    var M = A(), msg = $('prMsg');
    if (!M.token()) return M.setMsg(msg, 'Add the GitHub token first (step 1).', 'err');
    var map = {};
    Object.keys(cur).forEach(function (id) {
      var c = cur[id]; if (!(c.l > 0 || c.m > 0)) return;
      map[id] = {}; if (c.l > 0) map[id].l = c.l; if (c.m > 0) map[id].m = c.m;
    });
    var js = '// File generato dal pannello admin (sezione PRICES) - non modificare a mano\nwindow.MOTU_PRICES = ' + JSON.stringify(map) + ';\n';
    busy = true; $('prPublish').disabled = true; M.setMsg(msg, 'Publishing…');
    try {
      var sha;
      try { sha = (await M.gh('/contents/prices.js?ref=' + M.BRANCH)).sha; } catch (e) { if (e.status !== 404) throw e; }
      await M.gh('/contents/prices.js', { method: 'PUT', body: JSON.stringify({ message: 'Prices: ' + Object.keys(map).length + ' items', content: M.utf8b64(js), branch: M.BRANCH, sha: sha }) });
      Object.keys(cur).forEach(function (id) { base[id] = { l: cur[id].l, m: cur[id].m }; });
      apply();
      M.setMsg(msg, 'Published! ' + Object.keys(map).length + ' priced items. The new values will be live on the site in 1–2 minutes.', 'ok');
    } catch (e) {
      M.setMsg(msg, e.status === 401 || e.status === 403 ? 'GitHub refused: ' + e.message + ' — check the token and its permissions.' : (e.message || 'Error'), 'err');
    }
    busy = false; $('prPublish').disabled = false;
  }

  build(); fillSelects(); apply();
  $('prSerie').addEventListener('change', function () { fillSub(); apply(); });
  $('prSub').addEventListener('change', apply);
  var t = null;
  $('prSearch').addEventListener('input', function () { clearTimeout(t); t = setTimeout(apply, 180); });
  $('prMissing').addEventListener('change', apply);
  $('prMore').addEventListener('click', function () { draw(false); });
  $('prExport').addEventListener('click', exportCsv);
  $('prPublish').addEventListener('click', publish);
  $('prImport').addEventListener('click', function () { $('prFile').click(); });
  $('prFile').addEventListener('change', function () {
    var f = this.files[0]; if (!f) return;
    var rd = new FileReader(); rd.onload = function () { importCsv(String(rd.result)); }; rd.readAsText(f); this.value = '';
  });
  $('prBody').addEventListener('change', function (e) {
    var inp = e.target.closest('input[data-k]'); if (!inp) return;
    var id = inp.closest('tr').getAttribute('data-id'), n = num(inp.value);
    cur[id][inp.getAttribute('data-k')] = n == null ? 0 : n;
    inp.value = cur[id][inp.getAttribute('data-k')] > 0 ? cur[id][inp.getAttribute('data-k')] : '';
    var tr = inp.closest('tr'), ch = changed(id);
    tr.querySelectorAll('input').forEach(function (x) { x.classList.toggle('chg', ch); });
    count();
  });
  window.addEventListener('beforeunload', function (e) { if (nChanged()) { e.preventDefault(); e.returnValue = ''; } });
})();
