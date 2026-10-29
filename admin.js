// ============================================================
// MOTU COLLECTORS — ADMIN: caricamento foto direttamente su GitHub
// Elabora le foto nel browser e le pubblica nel repository con un solo commit.
// ============================================================
(function () {
  var REPO = 'toninoaprea/motu-collectors', BRANCH = 'main', TOKEN_KEY = 'motu_gh_token';
  var MAX_SIDE = 1000, WEBP_Q = 0.8, SHELF_H = 360, THUMB_PX = 240;
  // Foto: il suffisso del file indica il ruolo. 1 blister, cb retro blister, 2 fronte, 3 retro, tutti gli altri = extra.
  // (i file già online -1/-2/-3/-4/-5 restano dove sono; i nuovi extra si chiamano -x1, -x2, ...)
  var BASE = [['1', 'Blister'], ['cb', 'Card back'], ['2', 'Front'], ['3', 'Back']];
  var BASE_KEYS = BASE.map(function (b) { return b[0]; });
  var addedExtras = [];
  var cropTouched = false, squaring = false, headSource = null;
  // Foto obbligatorie: blister, retro blister, fronte, retro, scaffale (png), testina (miniatura)
  var REQUIRED = [['1', 'Blister'], ['cb', 'Card back'], ['2', 'Front'], ['3', 'Back'], ['shelf', 'Shelf'], ['thumb', 'Head']];
  // Funko: niente Card back e Back tra le foto obbligatorie (4 invece di 6); si possono comunque caricare
  function requiredFor(id) {
    if (/^funko-/.test(id || '')) return REQUIRED.filter(function (q) { return q[0] !== 'cb' && q[0] !== '3'; });
    return REQUIRED;
  }
  var capVals = {};                  // didascalie delle foto: suffisso -> testo
  var $ = function (id) { return document.getElementById(id); };

  var picked = null;                 // { id, name, serie, sub, item }
  var photosMap = {};                // copia di window.MOTU_PHOTOS
  var slotFiles = {};                // suffisso -> File
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
    $('admSquare').addEventListener('click', squareExisting);
    $('admCropSize').addEventListener('input', function () { cropTouched = true; crop.size = parseInt(this.value, 10) / 100; drawCrop(); });
    var cv = $('admCrop');
    function pt(e) { cropTouched = true; var r = cv.getBoundingClientRect(); crop.cx = (e.clientX - r.left) / r.width; crop.cy = (e.clientY - r.top) / r.height; drawCrop(); }
    cv.addEventListener('pointerdown', function (e) { cv.setPointerCapture(e.pointerId); pt(e); cv.onpointermove = pt; });
    cv.addEventListener('pointerup', function () { cv.onpointermove = null; });
    buildShelf();
    updateTotal();
    $('admAddExtra').addEventListener('click', addExtra);
    $('admHeadSrc').addEventListener('click', function (e) { var b = e.target.closest('.adm-hs'); if (b) chooseHead(b.getAttribute('data-k')); });
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
  function badge(r) {
    var p = photosMap[r.id] || {};
    var imgs = p.images || r.images || (r.image ? [r.image] : []);
    var miss = missingFor(bySlot(imgs), !!(p.preview || r.preview), !!(p.thumb || r.thumb), r.id);
    var rl = requiredFor(r.id).length, n = rl - miss.length;
    return ' <em class="adm-badge ' + (miss.length ? 'todo' : 'done') + '">' + n + '/' + rl + '</em>';
  }
  // Totale foto obbligatorie per la serie scelta (o tutto il catalogo)
  function updateTotal() {
    var el = $('admTotal'); if (!el || !window.MOTU_CATALOG) return;
    var serie = $('admSerie').value, have = 0, need = 0, chars = 0, done = 0;
    Object.keys(window.MOTU_CATALOG).forEach(function (se) {
      if (serie !== 'ALL' && se !== serie) return;
      var subs = window.MOTU_CATALOG[se];
      Object.keys(subs).forEach(function (sub) {
        subs[sub].forEach(function (r) {
          var p = photosMap[r.id] || {};
          var imgs = p.images || r.images || (r.image ? [r.image] : []);
          var miss = missingFor(bySlot(imgs), !!(p.preview || r.preview), !!(p.thumb || r.thumb), r.id);
          var rl = requiredFor(r.id).length;
          chars++; need += rl; have += rl - miss.length;
          if (!miss.length) done++;
        });
      });
    });
    var pct = need ? Math.round(have / need * 100) : 0;
    el.innerHTML = '<b>' + (serie === 'ALL' ? 'All series' : esc(serie)) + ':</b> ' + have + ' / ' + need + ' required photos (' + pct + '%) · ' + done + ' of ' + chars + ' characters complete' +
      '<span class="adm-totalbar"><i style="width:' + pct + '%"></i></span>';
  }
  function search() {
    updateTotal();
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
      return '<button class="adm-res" data-i="' + i + '"><b>' + esc(r.name) + '</b>' + badge(r) + '<small>' + esc(r.serie + ' · ' + r.sub + ' · ' + r.id) + '</small></button>';
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
    return { images: p.images || it.images || (it.image ? [it.image] : []), preview: p.preview || it.preview || '', thumb: p.thumb || it.thumb || '', captions: p.captions || {} };
  }
  function bySlot(images) {
    var out = {};
    images.forEach(function (u) { var m = /-([A-Za-z0-9]+)\.webp$/.exec(u.split('?')[0]); if (m) out[m[1]] = u; });
    return out;
  }
  function extraRank(k) { var m = /^x(\d+)$/.exec(k); return m ? 1000 + parseInt(m[1], 10) : parseInt(k, 10) || 0; }
  function extraKeys(map) {
    var ks = Object.keys(map).concat(addedExtras).filter(function (k) { return BASE_KEYS.indexOf(k) < 0; });
    ks = ks.filter(function (k, i) { return ks.indexOf(k) === i; });
    if (!ks.length) ks = ['x1'];
    return ks.sort(function (a, b) { return extraRank(a) - extraRank(b); });
  }
  function allKeys(map) { return BASE_KEYS.concat(extraKeys(map)); }
  // Foto obbligatorie: blister, retro blister, fronte, retro, scaffale (png), testina (miniatura)
  function missingFor(map, hasShelf, hasThumb, id) {
    var out = [];
    requiredFor(id).forEach(function (q) {
      var ok = q[0] === 'shelf' ? hasShelf : q[0] === 'thumb' ? (hasThumb || !!map['2']) : !!map[q[0]];
      if (!ok) out.push(q[1]);
    });
    return out;
  }
  function labelFor(k, map) {
    for (var i = 0; i < BASE.length; i++) if (BASE[i][0] === k) return BASE[i][1];
    return 'Extra ' + (extraKeys(map).indexOf(k) + 1);
  }

  function pick(r) {
    cropTouched = false; headSource = null;
    picked = { id: r.id, name: r.name, serie: r.serie, sub: r.sub, item: r };
    slotFiles = {}; addedExtras = []; shelfFile = null; frontImg = null; capVals = {};
    var p = $('admPicked'); p.hidden = false;
    p.innerHTML = '<b>' + esc(r.name) + '</b><br>' + esc(r.serie + ' · ' + r.sub) + ' · <code>' + esc(r.id) + '</code>';
    $('admResults').innerHTML = ''; $('admSearch').value = ''; $('admSerie').value = 'ALL';
    $('admUpload').hidden = false; setMsg($('admMsg'), '');
    buildSlots();
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
    var map = picked ? bySlot(existing().images) : {};
    allKeys(map).forEach(function (k) {
      var d = document.createElement('div'); d.className = 'adm-slot'; d.id = 'admSlot_' + k; wrap.appendChild(d);
      makeSlot(d, labelFor(k, map), 'image/*', function (f) { slotFiles[k] = f; renderSlots(); if (k === '2') loadFrontFromFile(f); });
    });
    buildCaps(map);
    renderSlots();
  }
  // Didascalie: una riga di testo per foto (es. "Taiwan", "Glow in the Dark"), mostrata sotto la foto nel museo
  function buildCaps(map) {
    var host = $('admCaps');
    if (!host) { host = document.createElement('div'); host.id = 'admCaps'; host.className = 'adm-caps'; $('admSlots').parentNode.insertBefore(host, $('admSlots').nextSibling); }
    var saved = existing().captions || {};
    host.innerHTML = '<div class="adm-caps-t">Captions (optional) - shown under each photo, e.g. the variant name</div>';
    allKeys(map).forEach(function (k) {
      if (capVals[k] === undefined) capVals[k] = saved[k] || '';
      var row = document.createElement('label'); row.className = 'adm-cap';
      row.innerHTML = '<span>' + esc(labelFor(k, map)) + '</span><input type="text" maxlength="80" placeholder="Caption" value="' + esc(capVals[k]) + '">';
      row.querySelector('input').addEventListener('input', function (e) { capVals[k] = e.target.value; });
      host.appendChild(row);
    });
  }
  function buildShelf() {
    var sh = $('admShelfSlot');
    makeSlot(sh, 'Shelf', 'image/png,image/webp', function (f) { shelfFile = f; if (!headSource) loadHead(); renderSlots(); });
  }
  function addExtra() {
    if (!picked) return;
    var map = bySlot(existing().images), n = 1;
    var used = extraKeys(map).concat(Object.keys(slotFiles));
    while (used.indexOf('x' + n) >= 0) n++;
    addedExtras.push('x' + n);
    buildSlots();
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
    allKeys(map).forEach(function (k) {
      var f = slotFiles[k], el = $('admSlot_' + k);
      if (el) fill(el, slotHtml(labelFor(k, map), f ? URL.createObjectURL(f) : (map[k] || ''), !!f), !!f);
    });
    var have = {};
    Object.keys(map).forEach(function (k) { have[k] = map[k]; });
    Object.keys(slotFiles).forEach(function (k) { have[k] = 1; });
    var miss = missingFor(have, !!(shelfFile || ex.preview), !!(ex.thumb), picked.id);
    var RL = requiredFor(picked.id).length;
    var cnt = $('admCount');
    if (cnt) {
      cnt.className = 'adm-count ' + (miss.length ? 'todo' : 'done');
      cnt.textContent = miss.length ? (RL - miss.length) + '/' + RL + ' required photos · missing: ' + miss.join(', ') : RL + '/' + RL + ' · all required photos present ✓';
    }
    var sh = $('admShelfSlot');
    sh.classList.add('checker');
    fill(sh, slotHtml('Shelf', shelfFile ? URL.createObjectURL(shelfFile) : ex.preview, !!shelfFile), !!shelfFile);
    renderHeadSrc();
  }

  // ── ritaglio testa ──
  function loadImg(src) {
    return new Promise(function (res, rej) { var im = new Image(); im.onload = function () { res(im); }; im.onerror = rej; im.src = src; });
  }
  // Sorgente della testina: 'shelf' (png senza sfondo, predefinita se c'è) oppure una qualsiasi foto (-1, cb, 2, 3, extra)
  function headKey() { return headSource || ((shelfFile || existing().preview) ? 'shelf' : '2'); }
  function headUrl(key) {
    var ex = existing(), map = bySlot(ex.images);
    if (key === 'shelf') return shelfFile ? URL.createObjectURL(shelfFile) : (ex.preview || '');
    return slotFiles[key] ? URL.createObjectURL(slotFiles[key]) : (map[key] || '');
  }
  function loadHead() {
    var u = headUrl(headKey());
    if (u) return loadImg(u).then(setFront).catch(function () { setFront(null); });
    setFront(null); return Promise.resolve();
  }
  function loadFrontFromFile() { headSource = '2'; loadHead(); renderHeadSrc(); }
  function loadFrontFromExisting() { loadHead(); }
  function setFront(im) { frontImg = im; crop = { cx: 0.5, cy: 0.17, size: 0.27 }; $('admCropSize').value = 27; autoHead(); }
  function chooseHead(key) { headSource = key; cropTouched = true; loadHead(); renderHeadSrc(); }
  function renderHeadSrc() {
    var box = $('admHeadSrc'); if (!box || !picked) return;
    var ex = existing(), map = bySlot(ex.images), cur = headKey(), html = '';
    var keys = allKeys(map).filter(function (k) { return slotFiles[k] || map[k]; });
    if (shelfFile || ex.preview) keys.push('shelf');
    keys.forEach(function (k) {
      var u = headUrl(k);
      html += '<button type="button" class="adm-hs' + (k === cur ? ' on' : '') + (k === 'shelf' ? ' checker' : '') + '" data-k="' + esc(k) + '"><img src="' + esc(u) + '" alt=""><span>' + esc(k === 'shelf' ? 'Shelf PNG' : labelFor(k, map)) + '</span></button>';
    });
    box.innerHTML = html;
  }

  async function autoHead() {
    if (frontImg) {
      try {
        var sh = null;
        if (headKey() === 'shelf') sh = frontImg;
        else { var su = shelfFile ? URL.createObjectURL(shelfFile) : existing().preview; if (su) sh = await loadImg(su); }
        if (!sh) throw new Error('no alpha source');
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
    if (!frontImg) { cv.width = 300; cv.height = 120; var c0 = cv.getContext('2d'); c0.clearRect(0, 0, 300, 120); c0.fillStyle = '#888'; c0.font = '14px sans-serif'; c0.fillText('Add a photo first', 40, 64); pv.getContext('2d').clearRect(0, 0, 120, 120); return; }
    var maxW = Math.min(380, cv.parentElement.clientWidth || 380);
    var sc = maxW / frontImg.naturalWidth;
    cv.width = Math.round(frontImg.naturalWidth * sc); cv.height = Math.round(frontImg.naturalHeight * sc);
    var ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height); ctx.drawImage(frontImg, 0, 0, cv.width, cv.height);
    var r = cropRect(cv.width, cv.height);
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.fillStyle = '#fff'; ctx.fillRect(r.left, r.top, r.s, r.s);
    ctx.drawImage(frontImg, r.left / sc, r.top / sc, r.s / sc, r.s / sc, r.left, r.top, r.s, r.s);
    ctx.strokeStyle = '#c4161c'; ctx.lineWidth = 2; ctx.strokeRect(r.left, r.top, r.s, r.s);
    var pc = pv.getContext('2d'); pc.fillStyle = '#fff'; pc.fillRect(0, 0, 120, 120);
    pc.drawImage(frontImg, r.left / sc, r.top / sc, r.s / sc, r.s / sc, 0, 0, 120, 120);
  }

  // ── elaborazione immagini ──
  function toBlob(canvas, type, q) { return new Promise(function (res) { canvas.toBlob(res, type, q); }); }
  function fileToImg(f) { return loadImg(URL.createObjectURL(f)); }
  // Foto quadrata: l'immagine intera (nessun ritaglio) centrata su un quadrato, con margini bianchi
  async function photoBlob(f) {
    var im = await fileToImg(f), W = im.naturalWidth, H = im.naturalHeight;
    var side = Math.min(MAX_SIDE, Math.max(W, H)), sc = side / Math.max(W, H);
    var w = Math.round(W * sc), h = Math.round(H * sc);
    var c = document.createElement('canvas'); c.width = side; c.height = side;
    var ctx = c.getContext('2d', { willReadFrequently: true });
    var t = document.createElement('canvas'); t.width = w; t.height = h;
    var tx = t.getContext('2d', { willReadFrequently: true }); tx.drawImage(im, 0, 0, w, h);
    ctx.fillStyle = '#ffffff';   // margini bianchi, uguali per tutte le foto
    ctx.fillRect(0, 0, side, side);
    ctx.drawImage(t, Math.round((side - w) / 2), Math.round((side - h) / 2));
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
    var tc = c.getContext('2d'); tc.fillStyle = '#ffffff'; tc.fillRect(0, 0, THUMB_PX, THUMB_PX);   // sfondo bianco (il png è trasparente)
    tc.drawImage(frontImg, r.left, r.top, r.s, r.s, 0, 0, THUMB_PX, THUMB_PX);
    return toBlob(c, 'image/webp', 0.82);
  }
  function b64(blob) {
    return new Promise(function (res, rej) { var fr = new FileReader(); fr.onload = function () { res(String(fr.result).split(',')[1]); }; fr.onerror = rej; fr.readAsDataURL(blob); });
  }
  function utf8b64(str) { var b = new TextEncoder().encode(str), s = ''; b.forEach(function (x) { s += String.fromCharCode(x); }); return btoa(s); }

  // ── rende quadrate le foto già online del personaggio scelto ──
  async function squareExisting() {
    if (busy || !picked) return;
    var msg = $('admMsg');
    if (!token()) return setMsg(msg, 'Add the GitHub token first (step 1).', 'err');
    var map = bySlot(existing().images), n = 0;
    setMsg(msg, 'Checking existing photos…');
    try {
      var ks = Object.keys(map);
      for (var i = 0; i < ks.length; i++) {
        var k = ks[i], u = map[k];
        if (!u || slotFiles[k]) continue;
        var r = await fetch(u.split('?')[0] + '?nocache=' + Date.now(), { cache: 'no-store' });
        if (!r.ok) continue;
        var blob = await r.blob(), im = await fileToImg(blob);
        if (im.naturalWidth !== im.naturalHeight) { slotFiles[k] = blob; n++; }
      }
    } catch (e) { return setMsg(msg, 'Could not read the existing photos: ' + (e.message || e), 'err'); }
    if (!n) return setMsg(msg, 'The photos already online are all square (or there are none).', 'ok');
    renderSlots();
    squaring = true;
    try { await publish(); } finally { squaring = false; }
  }

  // ── pubblicazione (un solo commit) ──
  async function publish() {
    if (busy || !picked) return;
    var msg = $('admMsg');
    if (!token()) return setMsg(msg, 'Add the GitHub token first (step 1).', 'err');
    var capsChanged = Object.keys(capVals).some(function (k) { return (capVals[k] || '').trim() !== ((existing().captions || {})[k] || ''); });
    var anyNew = Object.keys(slotFiles).length || shelfFile || cropTouched || capsChanged;
    var frontNow = slotFiles['2'] || bySlot(existing().images)['2'];
    if (!anyNew) return setMsg(msg, 'Choose at least one new photo or edit a caption.', 'err');
    busy = true; $('admPublish').disabled = true; $('admProgress').hidden = false;
    var bar = $('admBar'), steps = 0, total = 6 + Object.keys(slotFiles).length + 2;
    function tick(t) { steps++; bar.style.width = Math.min(100, Math.round(steps / total * 100)) + '%'; setMsg(msg, t); }
    try {
      var id = picked.id, v = Date.now().toString(36).slice(-6), files = [];
      var ex = existing(), map = bySlot(ex.images), entry = { images: [], preview: ex.preview, thumb: ex.thumb }, caps = {};

      tick('Processing photos…');
      var order = allKeys(map);
      for (var i = 0; i < order.length; i++) {
        var k = order[i], path = 'img/characters/' + id + '-' + k + '.webp';
        if (slotFiles[k]) { files.push({ path: path, b64: await b64(await photoBlob(slotFiles[k])) }); entry.images.push(path + '?v=' + v); tick('Processing photos…'); }
        else if (map[k]) entry.images.push(map[k]);
        if ((slotFiles[k] || map[k]) && (capVals[k] || '').trim()) caps[k] = capVals[k].trim();
      }
      if (Object.keys(caps).length) entry.captions = caps;
      if (shelfFile) { var sp = 'img/characters/' + id + '-shelf.png'; files.push({ path: sp, b64: await b64(await shelfBlob(shelfFile)) }); entry.preview = sp + '?v=' + v; }
      if (frontImg && (cropTouched || (slotFiles['2'] && !squaring) || !ex.thumb)) { var tp = 'img/characters/' + id + '-thumb.webp'; files.push({ path: tp, b64: await b64(await thumbBlob()) }); entry.thumb = tp + '?v=' + v; }
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

      photosMap[id] = entry; updateTotal();
      slotFiles = {}; shelfFile = null;
      bar.style.width = '100%';
      setMsg(msg, 'Published! The photos will be live on the site in 1–2 minutes (GitHub Pages is rebuilding).', 'ok');
      buildSlots();
    } catch (e) {
      setMsg(msg, e.status === 401 || e.status === 403 ? 'GitHub refused: ' + e.message + ' — check the token and its permissions.' : (e.message || 'Error'), 'err');
    }
    busy = false; $('admPublish').disabled = false;
  }
  window.MotuAdmin = { gh: gh, token: token, BRANCH: BRANCH, utf8b64: utf8b64, setMsg: setMsg, esc: esc };
})();
