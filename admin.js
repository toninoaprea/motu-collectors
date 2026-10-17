// ============================================================
// MOTU COLLECTORS — ADMIN: caricamento foto direttamente su GitHub
// Elabora le foto nel browser e le pubblica nel repository con un solo commit.
// ============================================================
(function () {
  var REPO = 'toninoaprea/motu-collectors', BRANCH = 'main', TOKEN_KEY = 'motu_gh_token';
  var MAX_SIDE = 1000, WEBP_Q = 0.8, SHELF_H = 360, THUMB_PX = 240;
  var SLOT_NAMES = ['1 · Blister', '2 · Front', '3 · Back', '4 · Extra', '5 · Extra'];
  var $ = function (id) { return document.getElementById(id); };

  var picked = null;                 // { id, name, serie, sub, item }
  var photosMap = {};                // copia di window.MOTU_PHOTOS
  var slotFiles = [null, null, null, null, null];
  var shelfFile = null;
  var frontImg = null;               // immagine usata per il ritaglio testa
  var crop = { cx: 0.5, cy: 0.2, size: 0.27 };
  var busy = false;

  function setMsg(el, t, kind) { el.textContent = t || ''; el.className = 'adm-msg' + (kind ? ' ' + kind : ''); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function whenCloud(cb) { if (window.MotuCloud) cb(); else window.addEventListener('motu-cloud-ready', cb, { once: true }); }
  function token() { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; } }

  // ── accesso ──
  whenCloud(function () {
    window.MotuCloud.onChange(function (st) {
      var gate = $('admGate'), app = $('admApp');
      if (!st.ready) return;
      if (st.admin) { gate.hidden = true; app.hidden = false; init(); }
      else {
        app.hidden = true; gate.hidden = false;
        gate.innerHTML = st.user ? 'This page is for the site admin only.' : 'Please <a href="login.html?next=admin.html">log in</a> as admin.';
      }
    });
  });

  var inited = false;
  function init() {
    if (inited) return; inited = true;
    photosMap = JSON.parse(JSON.stringify(window.MOTU_PHOTOS || {}));
    $('admToken').value = token() ? '••••••••••••••••' : '';
    $('admSaveToken').addEventListener('click', saveToken);
    $('admForget').addEventListener('click', function () { try { localStorage.removeItem(TOKEN_KEY); } catch (e) {} $('admToken').value = ''; setMsg($('admTokenMsg'), 'Token removed from this browser.'); });
    var sel = $('admSerie');
    sel.innerHTML = '<option value="ALL">All series</option>' + Object.keys(window.MOTU_CATALOG).map(function (s) { return '<option value="' + esc(s) + '">' + esc(s) + '</option>'; }).join('');
    sel.addEventListener('change', search);
    $('admSearch').addEventListener('input', search);
    $('admPublish').addEventListener('click', publish);
    $('admCropSize').addEventListener('input', function () { crop.size = parseInt(this.value, 10) / 100; drawCrop(); });
    var cv = $('admCrop');
    function pt(e) { var r = cv.getBoundingClientRect(); crop.cx = (e.clientX - r.left) / r.width; crop.cy = (e.clientY - r.top) / r.height; drawCrop(); }
    cv.addEventListener('pointerdown', function (e) { cv.setPointerCapture(e.pointerId); pt(e); cv.onpointermove = pt; });
    cv.addEventListener('pointerup', function () { cv.onpointermove = null; });
    buildSlots();
    if (token()) checkToken(token());
  }

  // ── token GitHub ──
  async function gh(path, opt) {
    opt = opt || {};
    var r = await fetch('https://api.github.com/repos/' + REPO + path, Object.assign({}, opt, {
      headers: Object.assign({ Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + token(), 'X-GitHub-Api-Version': '2022-11-28' }, opt.headers || {})
    }));
    if (!r.ok) { var t = ''; try { t = (await r.text()).slice(0, 200); } catch (e) {} var err = new Error('GitHub ' + r.status + ': ' + t); err.status = r.status; throw err; }
    return r.status === 204 ? null : r.json();
  }
  async function saveToken() {
    var v = $('admToken').value.trim();
    if (!v || /^•+$/.test(v)) return setMsg($('admTokenMsg'), 'Paste the token first.', 'err');
    try { localStorage.setItem(TOKEN_KEY, v); } catch (e) { return setMsg($('admTokenMsg'), 'This browser cannot store the token.', 'err'); }
    $('admToken').value = '••••••••••••••••';
    checkToken(v);
  }
  async function checkToken() {
    setMsg($('admTokenMsg'), 'Checking…');
    try {
      var r = await gh('');
      if (r.permissions && r.permissions.push === false) setMsg($('admTokenMsg'), 'Connected, but this token cannot write. Give it Contents: Read and write.', 'err');
      else setMsg($('admTokenMsg'), 'Connected to ' + REPO + '.', 'ok');
    } catch (e) { setMsg($('admTokenMsg'), e.status === 401 ? 'Token not valid or expired.' : e.message, 'err'); }
  }

  // ── ricerca personaggio ──
  function search() {
    var q = $('admSearch').value.trim().toLowerCase();
    var serie = $('admSerie').value;
    var box = $('admResults');
    if (q.length < 2 && serie === 'ALL') { box.innerHTML = ''; return; }
    var res = q.length >= 2 ? (window.motuSearchAll(q) || []) : [];
    if (q.length < 2) {   // solo filtro serie: elenca tutta la serie
      Object.keys(window.MOTU_CATALOG[serie] || {}).forEach(function (sub) {
        window.MOTU_CATALOG[serie][sub].forEach(function (it) { res.push(Object.assign({}, it, { serie: serie, sub: sub })); });
      });
    }
    if (serie !== 'ALL') res = res.filter(function (r) { return r.serie === serie; });
    res.sort(function (a, b) {
      var an = a.name.toLowerCase(), bn = b.name.toLowerCase();
      var ar = an === q ? 0 : an.indexOf(q) === 0 ? 1 : 2, br = bn === q ? 0 : bn.indexOf(q) === 0 ? 1 : 2;
      return ar - br;
    });
    var total = res.length; res = res.slice(0, 80);
    box.innerHTML = (res.length ? res.map(function (r, i) {
      return '<button class="adm-res" data-i="' + i + '"><b>' + esc(r.name) + '</b><small>' + esc(r.serie + ' · ' + r.sub + ' · ' + r.id) + '</small></button>';
    }).join('') : '<p class="adm-hint">No results.</p>') + (total > 80 ? '<p class="adm-hint">' + total + ' results: narrow with the series filter.</p>' : '');
    box._res = res;
  }
  $('admResults').addEventListener('click', function (e) {
    var b = e.target.closest('.adm-res'); if (!b) return;
    var r = this._res[parseInt(b.dataset.i, 10)];
    pick(r);
  });

  function existing() {
    var p = photosMap[picked.id] || {};
    var it = picked.item;
    return { images: p.images || it.images || (it.image ? [it.image] : []), preview: p.preview || it.preview || '', thumb: p.thumb || it.thumb || '' };
  }
  function bySlot(images) {
    var out = {};
    images.forEach(function (u, i) { var m = /-(\d)\.webp/.exec(u.split('?')[0]); out[m ? parseInt(m[1], 10) : i + 1] = u; });
    return out;
  }

  function pick(r) {
    picked = { id: r.id, name: r.name, serie: r.serie, sub: r.sub, item: r };
    slotFiles = [null, null, null, null, null]; shelfFile = null; frontImg = null;
    var p = $('admPicked'); p.hidden = false;
    p.innerHTML = '<b>' + esc(r.name) + '</b><br>' + esc(r.serie + ' · ' + r.sub) + ' · <code>' + esc(r.id) + '</code>';
    $('admResults').innerHTML = ''; $('admSearch').value = ''; $('admSerie').value = 'ALL';
    $('admUpload').hidden = false; setMsg($('admMsg'), '');
    renderSlots();
    loadFrontFromExisting();
  }

  // ── slot foto ──
  function makeSlot(host, label, accept, onFile) {
    var inp = document.createElement('input'); inp.type = 'file'; inp.accept = accept; inp.hidden = true;
    host.appendChild(inp);
    host.addEventListener('click', function (e) { if (e.target !== inp) inp.click(); });
    inp.addEventListener('change', function () { if (inp.files[0]) onFile(inp.files[0]); inp.value = ''; });
    ['dragenter', 'dragover'].forEach(function (ev) { host.addEventListener(ev, function (e) { e.preventDefault(); host.classList.add('drag'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { host.addEventListener(ev, function (e) { e.preventDefault(); host.classList.remove('drag'); }); });
    host.addEventListener('drop', function (e) { var f = e.dataTransfer.files[0]; if (f) onFile(f); });
  }
  function buildSlots() {
    var wrap = $('admSlots'); wrap.innerHTML = '';
    SLOT_NAMES.forEach(function (n, i) {
      var d = document.createElement('div'); d.className = 'adm-slot'; d.id = 'admSlot' + i; wrap.appendChild(d);
      makeSlot(d, n, 'image/*', function (f) { slotFiles[i] = f; renderSlots(); if (i === 1) loadFrontFromFile(f); });
    });
    var sh = $('admShelfSlot');
    makeSlot(sh, 'Shelf', 'image/png,image/webp', function (f) { shelfFile = f; renderSlots(); autoHead(); });
  }
  function slotHtml(label, src, isNew) {
    return (src ? '<img src="' + esc(src) + '" alt="">' : '') + '<span>' + esc(label) + (isNew ? ' · NEW' : '') + '</span>' + (src ? '' : 'click or drop');
  }
  function fill(el, html, isNew) {
    var inp = el.querySelector('input');
    el.innerHTML = html; if (inp) el.appendChild(inp);
    el.classList.toggle('new', !!isNew);
  }
  function renderSlots() {
    if (!picked) return;
    var ex = existing(), map = bySlot(ex.images);
    SLOT_NAMES.forEach(function (n, i) {
      var f = slotFiles[i];
      fill($('admSlot' + i), slotHtml(n, f ? URL.createObjectURL(f) : (map[i + 1] || ''), !!f), !!f);
    });
    var sh = $('admShelfSlot');
    sh.classList.add('checker');
    fill(sh, slotHtml('Shelf', shelfFile ? URL.createObjectURL(shelfFile) : ex.preview, !!shelfFile), !!shelfFile);
  }

  // ── ritaglio testa ──
  function loadImg(src) {
    return new Promise(function (res, rej) { var im = new Image(); im.onload = function () { res(im); }; im.onerror = rej; im.src = src; });
  }
  function loadFrontFromFile(f) { loadImg(URL.createObjectURL(f)).then(setFront).catch(function () {}); }
  function loadFrontFromExisting() {
    var map = bySlot(existing().images), u = map[2];
    if (u) loadImg(u).then(setFront).catch(function () { setFront(null); }); else setFront(null);
  }
  function setFront(im) { frontImg = im; crop = { cx: 0.5, cy: 0.17, size: 0.27 }; $('admCropSize').value = 27; autoHead(); }

  async function autoHead() {
    if (frontImg && shelfFile) {
      try {
        var sh = await loadImg(URL.createObjectURL(shelfFile));
        var W = 220, H = Math.round(W * frontImg.naturalHeight / frontImg.naturalWidth);
        var c = document.createElement('canvas'); c.width = W; c.height = H;
        var ctx = c.getContext('2d', { willReadFrequently: true }); ctx.drawImage(sh, 0, 0, W, H);
        var d = ctx.getImageData(0, 0, W, H).data;
        var x0 = W, x1 = 0, y0 = H, y1 = 0;
        for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 20) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        if (x1 > x0 && y1 > y0 && Math.abs(sh.naturalWidth / sh.naturalHeight - frontImg.naturalWidth / frontImg.naturalHeight) < 0.03) {
          var bh = y1 - y0, minW = Math.max(bh * 0.10, 4), top = y0, cx = (x0 + x1) / 2;
          for (var yy = y0; yy < y0 + bh * 0.6; yy += 2) {
            var best = 0, bs = 0, run = 0, st = 0;
            for (var xx = x0; xx <= x1; xx++) {
              if (d[(yy * W + xx) * 4 + 3] > 20) { if (!run) st = xx; run++; if (run > best) { best = run; bs = st; } } else run = 0;
            }
            if (best >= minW) { top = yy; cx = bs + best / 2; break; }
          }
          var s = 0.27 * bh;
          crop = { cx: cx / W, cy: (top - 0.02 * bh + s / 2) / H, size: s / H };
          $('admCropSize').value = Math.round(crop.size * 100);
        }
      } catch (e) { /* resta il valore di default */ }
    }
    drawCrop();
  }
  function cropRect(W, H) {
    var s = Math.min(crop.size * H, W, H);
    var left = Math.max(0, Math.min(crop.cx * W - s / 2, W - s));
    var top = Math.max(0, Math.min(crop.cy * H - s / 2, H - s));
    return { left: left, top: top, s: s };
  }
  function drawCrop() {
    var cv = $('admCrop'), pv = $('admCropPrev');
    if (!frontImg) { cv.width = 300; cv.height = 120; var c0 = cv.getContext('2d'); c0.clearRect(0, 0, 300, 120); c0.fillStyle = '#888'; c0.font = '14px sans-serif'; c0.fillText('Add a front photo (slot 2)', 40, 64); pv.getContext('2d').clearRect(0, 0, 120, 120); return; }
    var maxW = Math.min(380, cv.parentElement.clientWidth || 380);
    var sc = maxW / frontImg.naturalWidth;
    cv.width = Math.round(frontImg.naturalWidth * sc); cv.height = Math.round(frontImg.naturalHeight * sc);
    var ctx = cv.getContext('2d'); ctx.drawImage(frontImg, 0, 0, cv.width, cv.height);
    var r = cropRect(cv.width, cv.height);
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.drawImage(frontImg, r.left / sc, r.top / sc, r.s / sc, r.s / sc, r.left, r.top, r.s, r.s);
    ctx.strokeStyle = '#c4161c'; ctx.lineWidth = 2; ctx.strokeRect(r.left, r.top, r.s, r.s);
    var pc = pv.getContext('2d'); pc.clearRect(0, 0, 120, 120);
    pc.drawImage(frontImg, r.left / sc, r.top / sc, r.s / sc, r.s / sc, 0, 0, 120, 120);
  }

  // ── elaborazione immagini ──
  function toBlob(canvas, type, q) { return new Promise(function (res) { canvas.toBlob(res, type, q); }); }
  function fileToImg(f) { return loadImg(URL.createObjectURL(f)); }
  async function photoBlob(f) {
    var im = await fileToImg(f), sc = Math.min(1, MAX_SIDE / Math.max(im.naturalWidth, im.naturalHeight));
    var c = document.createElement('canvas'); c.width = Math.round(im.naturalWidth * sc); c.height = Math.round(im.naturalHeight * sc);
    c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
    return toBlob(c, 'image/webp', WEBP_Q);
  }
  async function shelfBlob(f) {
    var im = await fileToImg(f), W = im.naturalWidth, H = im.naturalHeight;
    var c = document.createElement('canvas'); c.width = W; c.height = H;
    var ctx = c.getContext('2d', { willReadFrequently: true }); ctx.drawImage(im, 0, 0);
    var d = ctx.getImageData(0, 0, W, H).data, x0 = W, x1 = 0, y0 = H, y1 = 0;
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 20) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 <= x0) throw new Error('The shelf PNG looks empty (no transparent background found).');
    var w = x1 - x0 + 1, h = y1 - y0 + 1, sc = Math.min(1, SHELF_H / h);
    var o = document.createElement('canvas'); o.width = Math.round(w * sc); o.height = Math.round(h * sc);
    o.getContext('2d').drawImage(c, x0, y0, w, h, 0, 0, o.width, o.height);
    return toBlob(o, 'image/png');
  }
  async function thumbBlob() {
    var W = frontImg.naturalWidth, H = frontImg.naturalHeight, r = cropRect(W, H);
    var c = document.createElement('canvas'); c.width = c.height = THUMB_PX;
    c.getContext('2d').drawImage(frontImg, r.left, r.top, r.s, r.s, 0, 0, THUMB_PX, THUMB_PX);
    return toBlob(c, 'image/webp', 0.82);
  }
  function b64(blob) {
    return new Promise(function (res, rej) { var fr = new FileReader(); fr.onload = function () { res(String(fr.result).split(',')[1]); }; fr.onerror = rej; fr.readAsDataURL(blob); });
  }
  function utf8b64(str) { var b = new TextEncoder().encode(str), s = ''; b.forEach(function (x) { s += String.fromCharCode(x); }); return btoa(s); }

  // ── pubblicazione (un solo commit) ──
  async function publish() {
    if (busy || !picked) return;
    var msg = $('admMsg');
    if (!token()) return setMsg(msg, 'Add the GitHub token first (step 1).', 'err');
    var anyNew = slotFiles.some(Boolean) || shelfFile;
    var frontNow = slotFiles[1] || bySlot(existing().images)[2];
    if (!anyNew) return setMsg(msg, 'Choose at least one new photo.', 'err');
    busy = true; $('admPublish').disabled = true; $('admProgress').hidden = false;
    var bar = $('admBar'), steps = 0, total = 6 + slotFiles.filter(Boolean).length + 2;
    function tick(t) { steps++; bar.style.width = Math.min(100, Math.round(steps / total * 100)) + '%'; setMsg(msg, t); }
    try {
      var id = picked.id, v = Date.now().toString(36).slice(-6), files = [];
      var ex = existing(), map = bySlot(ex.images), entry = { images: [], preview: ex.preview, thumb: ex.thumb };

      tick('Processing photos…');
      for (var i = 0; i < 5; i++) {
        var path = 'img/characters/' + id + '-' + (i + 1) + '.webp';
        if (slotFiles[i]) { files.push({ path: path, b64: await b64(await photoBlob(slotFiles[i])) }); entry.images.push(path + '?v=' + v); tick('Processing photos…'); }
        else if (map[i + 1]) entry.images.push(map[i + 1]);
      }
      if (shelfFile) { var sp = 'img/characters/' + id + '-shelf.png'; files.push({ path: sp, b64: await b64(await shelfBlob(shelfFile)) }); entry.preview = sp + '?v=' + v; }
      if (frontImg && frontNow) { var tp = 'img/characters/' + id + '-thumb.webp'; files.push({ path: tp, b64: await b64(await thumbBlob()) }); entry.thumb = tp + '?v=' + v; }
      tick('Reading photos.js…');

      var map2 = {};
      try {
        var cur = await gh('/contents/photos.js?ref=' + BRANCH);
        var txt = new TextDecoder().decode(Uint8Array.from(atob(cur.content.replace(/\s/g, '')), function (c) { return c.charCodeAt(0); }));
        map2 = JSON.parse(txt.slice(txt.indexOf('{', txt.indexOf('MOTU_PHOTOS')), txt.lastIndexOf('}') + 1));
      } catch (e) { if (e.status !== 404) throw e; }
      map2[id] = entry;
      var js = '// File generato da prepara_foto.py / pannello admin - non modificare a mano\nwindow.MOTU_PHOTOS = ' + JSON.stringify(map2, null, 1) + ';\n';
      files.push({ path: 'photos.js', b64: utf8b64(js) });

      tick('Uploading to GitHub…');
      var ref = await gh('/git/ref/heads/' + BRANCH);
      var parent = ref.object.sha;
      var pc = await gh('/git/commits/' + parent);
      var tree = [];
      for (var k = 0; k < files.length; k++) {
        var bl = await gh('/git/blobs', { method: 'POST', body: JSON.stringify({ content: files[k].b64, encoding: 'base64' }) });
        tree.push({ path: files[k].path, mode: '100644', type: 'blob', sha: bl.sha });
      }
      tick('Creating commit…');
      var nt = await gh('/git/trees', { method: 'POST', body: JSON.stringify({ base_tree: pc.tree.sha, tree: tree }) });
      var cm = await gh('/git/commits', { method: 'POST', body: JSON.stringify({ message: 'Photos: ' + picked.name + ' (' + id + ')', tree: nt.sha, parents: [parent] }) });
      await gh('/git/refs/heads/' + BRANCH, { method: 'PATCH', body: JSON.stringify({ sha: cm.sha }) });

      photosMap[id] = entry;
      slotFiles = [null, null, null, null, null]; shelfFile = null;
      bar.style.width = '100%';
      setMsg(msg, 'Published! The photos will be live on the site in 1–2 minutes (GitHub Pages is rebuilding).', 'ok');
      renderSlots();
    } catch (e) {
      setMsg(msg, e.status === 401 || e.status === 403 ? 'GitHub refused: ' + e.message + ' — check the token and its permissions.' : (e.message || 'Error'), 'err');
    }
    busy = false; $('admPublish').disabled = false;
  }
})();
