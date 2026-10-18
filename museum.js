// ============================================================
// MOTU COLLECTORS — MUSEUM PAGE (vanilla JS)
// Richiede motu-data.js caricato PRIMA di questo file.
// ============================================================

(function () {
  const CATALOG = window.MOTU_CATALOG;

  // Serie attualmente "in mostra" nel museo. Per aggiungere una nuova serie
  // in futuro basta aggiungerla a questo array: comparirà nel filtro e nello
  // scaffale senza altre modifiche al codice.
  const MUSEUM_SERIES = Object.keys(CATALOG);

  const PLACEHOLDER_IMG = 'img/characters/base.png';

  // ── COLLEZIONE (stessi dati della checklist, in localStorage) ──
  function loadMap(key) { try { return JSON.parse(localStorage.getItem(key)) || {}; } catch (e) { return {}; } }
  function saveMap(key, obj) {
    try { localStorage.setItem(key, JSON.stringify(obj)); } catch (e) {}
    try { window.dispatchEvent(new Event('motu-data-changed')); } catch (e) {}
  }
  function isOwned(id) { return !!loadMap('motu_owned_ids')[id]; }
  function setOwned(id, on) {
    const owned = loadMap('motu_owned_ids');
    if (on) owned[id] = true; else {
      delete owned[id];
      const q = loadMap('motu_qty_ids');
      if (q[id]) { delete q[id]; saveMap('motu_qty_ids', q); }
    }
    saveMap('motu_owned_ids', owned);
    if (on) {   // come lo tieni: predefinito loose (si cambia dalla scheda)
      const v = loadMap('motu_value_ids');
      if (!v['v-loose-' + id] && !v['v-moc-' + id]) { v['v-loose-' + id] = true; saveMap('motu_value_ids', v); }
    }
  }
  function getCond(id) { return loadMap('motu_value_ids')['v-moc-' + id] ? 'moc' : 'loose'; }
  function setCond(id, kind) {
    const v = loadMap('motu_value_ids');
    v['v-loose-' + id] = kind === 'loose'; v['v-moc-' + id] = kind === 'moc';
    saveMap('motu_value_ids', v);
  }
  function condHtml(id) {
    const c = getCond(id);
    return `<div class="museum-cond" data-id="${esc(id)}"${isOwned(id) ? '' : ' hidden'}>
      <span class="museum-cond-q">How do you keep it?</span>
      <button class="museum-cond-btn${c === 'loose' ? ' on' : ''}" data-action="set-cond" data-id="${esc(id)}" data-k="loose">LOOSE</button>
      <button class="museum-cond-btn${c === 'moc' ? ' on' : ''}" data-action="set-cond" data-id="${esc(id)}" data-k="moc">MOC</button>
    </div>`;
  }
  // Personaggi per mensola, responsive: 4 su mobile, 8 su tablet portrait,
  // 12 su tablet landscape/desktop.
  function getFiguresPerShelf() {
    const w = window.innerWidth;
    if (w < 640) return 4;
    if (w < 1024) return 8;
    return 12;
  }

  const filtersEl = document.getElementById('museumFilters');
  const shelvesEl = document.getElementById('museumShelves');
  if (!filtersEl || !shelvesEl) return;

  // { serie: true/false } — tutte attive di default
  const activeSeries = {};
  MUSEUM_SERIES.forEach(s => { activeSeries[s] = true; });
  // Filtri ricordati su questo dispositivo
  const FILTER_KEY = 'motu_museum_filters';
  try {
    const saved = JSON.parse(localStorage.getItem(FILTER_KEY) || 'null');
    if (saved && typeof saved === 'object') MUSEUM_SERIES.forEach(s => { if (s in saved) activeSeries[s] = !!saved[s]; });
  } catch (e) {}
  function saveFilters() { try { localStorage.setItem(FILTER_KEY, JSON.stringify(activeSeries)); localStorage.setItem(OWN_KEY, ownFilter); } catch (e) {} }
  // Mostra: tutti i pezzi / solo posseduti / solo mancanti
  const OWN_KEY = 'motu_museum_own';
  let ownFilter = 'all';
  try { const v = localStorage.getItem(OWN_KEY); if (v === 'owned' || v === 'missing') ownFilter = v; } catch (e) {}

  function esc(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function getItemImages(item) {
    if (Array.isArray(item.images) && item.images.length) return item.images;
    if (item.image) return [item.image];
    return [PLACEHOLDER_IMG];
  }

  // Raccoglie tutti gli item delle serie attive, in ordine di uscita
  // (anno di release). A parita di anno mantiene l'ordine di catalogo.
  // Nomi dei gruppi (scaffali) per le sottocategorie che vanno uniti o rinominati
  const GROUP_MERGE = { 'MASTERS OF THE WWE UNIVERSE RINGS': 'MASTERS OF THE WWE UNIVERSE' };
  const GROUP_TITLE = {
    'STRANGER THINGS CROSSOVER': 'STRANGER THINGS',
    'THUNDERCATS CROSSOVER': 'THUNDERCATS',
    'TRANSFORMERS COLLABORATION': 'TRANSFORMERS'
  };

  // Stesso ordine della checklist: serie, sottocategoria, pezzo. Ogni sottocategoria ha i suoi scaffali.
  function collectItems() {
    const entries = [];
    MUSEUM_SERIES.forEach(serie => {
      if (!activeSeries[serie]) return;
      const subs = CATALOG[serie] || {};
      Object.entries(subs).forEach(([sub, items]) => {
        const g = GROUP_MERGE[sub] || sub;
        const title = serie === g ? g : serie + ' \u2014 ' + (GROUP_TITLE[g] || g);
        // Origins: i "Fan Favorite" (ristampe) hanno uno scaffale a parte subito sotto le Figures
        const isFan = it => serie === 'ORIGINS' && sub === 'FIGURES' && /\(FAN FAVORITE\)/i.test(it.name);
        const show = it => ownFilter === 'all' || (ownFilter === 'owned') === isOwned(it.id);
        items.filter(it => !isFan(it) && show(it)).forEach(item => {
          entries.push({ item, serie, sub, group: serie + '|' + g, groupTitle: title });
        });
        items.filter(it => isFan(it) && show(it)).forEach(item => {
          entries.push({ item, serie, sub, group: serie + '|FAN FAVORITES', groupTitle: 'ORIGINS \u2014 FAN FAVORITES (RE-RELEASES)' });
        });
      });
    });
    return entries;
  }

  function renderFilters() {
    const allOn = MUSEUM_SERIES.every(s => activeSeries[s]);
    const noneOn = MUSEUM_SERIES.every(s => !activeSeries[s]);
    const bulk = `
      <button class="museum-filter-chip museum-filter-bulk ${allOn ? 'current' : ''}" data-action="select-all">ALL</button>
      <button class="museum-filter-chip museum-filter-bulk ${noneOn ? 'current' : ''}" data-action="select-none">NONE</button>
    `;
    const own = `
      <span class="museum-filter-own" role="group" aria-label="Show">
        <button class="museum-filter-chip museum-own-chip ${ownFilter === 'all' ? 'current' : ''}" data-action="set-own" data-v="all">ALL PIECES</button>
        <button class="museum-filter-chip museum-own-chip ${ownFilter === 'owned' ? 'current' : ''}" data-action="set-own" data-v="owned">\u2665 OWNED</button>
        <button class="museum-filter-chip museum-own-chip ${ownFilter === 'missing' ? 'current' : ''}" data-action="set-own" data-v="missing">\u2661 NOT OWNED</button>
      </span>`;
    filtersEl.innerHTML = own + bulk + MUSEUM_SERIES.map(serie => `
      <button class="museum-filter-chip ${activeSeries[serie] ? 'active' : ''}" data-action="toggle-serie" data-serie="${esc(serie)}">
        ${esc(serie)}
      </button>
    `).join('');
  }

  function renderShelves() {
    const entries = collectItems();
    const perShelf = getFiguresPerShelf();
    let html = `<div class="museum-filter-count">${entries.length} PEZZI ESPOSTI</div>`;
    const rows = [];
    for (let s = 0; s < entries.length;) {
      const g = entries[s].group;
      let e = s;
      while (e < entries.length && entries[e].group === g) e++;
      for (let i = s; i < e; i += perShelf) rows.push({ i, end: Math.min(i + perShelf, e), title: i === s ? entries[s].groupTitle : null });
      s = e;
    }
    for (const row of rows) {
      const i = row.i;
      const rowEntries = entries.slice(i, row.end);
      if (row.title) html += `<h2 class="museum-section-title">${esc(row.title)}</h2>`;
      html += `
        <div class="museum-shelf">
          <div class="museum-shelf-figures cols-${perShelf}">
            ${rowEntries.map((e, idx) => {
              const images = getItemImages(e.item);
              return `
                <button class="museum-figure-btn${isOwned(e.item.id) ? ' is-owned' : ''}" data-action="open-card" data-index="${i + idx}" data-id="${esc(e.item.id)}">
                  <span class="museum-figure-img-wrap">
                    <img class="museum-figure-img" src="${esc(e.item.preview || images[0])}" alt="${esc(e.item.name)}" onerror="this.src='${PLACEHOLDER_IMG}'">
                  </span>
                  <span class="museum-owned-badge" aria-hidden="true">\u2665</span>
                  <span class="museum-figure-shadow"></span>
                </button>
              `;
            }).join('')}
          </div>
          <div class="museum-shelf-plank"></div>
          <div class="museum-shelf-names cols-${perShelf}">
            ${rowEntries.map(e => `<div class="museum-name-cell">${esc(e.item.name)}</div>`).join('')}
          </div>
        </div>
      `;
    }
    if (!entries.length) {
      const anySerie = MUSEUM_SERIES.some(s => activeSeries[s]);
      html += `<div class="museum-filter-count" style="padding-bottom:40px;">${anySerie ? 'Nessun pezzo per questo filtro.' : 'Nessuna serie selezionata.'}</div>`;
    }
    shelvesEl.innerHTML = html;
    // Salva l'elenco corrente per poterlo referenziare al click (indice stabile)
    shelvesEl._entries = entries;
  }

  function render() {
    saveFilters();
    renderFilters();
    renderShelves();
  }

  // ── SCHEDA DETTAGLIO (toy card) ──
  let cardEl = null;
  let cardImages = [];
  let cardIndex = 0;

  function openCard(entryIndex) {
    const entries = shelvesEl._entries || [];
    const entry = entries[entryIndex];
    if (!entry) return;
    cardImages = getItemImages(entry.item);
    cardIndex = 0;
    if (!cardEl) {
      cardEl = document.createElement('div');
      cardEl.className = 'museum-card-overlay';
      document.body.appendChild(cardEl);
    }
    renderCard(entry);
  }

  function closeCard() {
    if (cardEl) { cardEl.remove(); cardEl = null; }
    cardImages = []; cardIndex = 0;
    if (ownFilter !== 'all') renderShelves();   // il cuore puo' aver cambiato l'elenco
  }

  function cardGo(delta) {
    if (!cardImages.length) return;
    cardIndex = (cardIndex + delta + cardImages.length) % cardImages.length;
    const img = cardEl && cardEl.querySelector('.museum-card-img');
    if (img) img.src = cardImages[cardIndex];
  }

  // Il fondo dello spazio foto prende il colore dello sfondo della foto
  // (campiona gli angoli): bianco, nero o altro, senza stacchi.
  function matchStageBg(img) {
    const stage = img.closest('.museum-card-stage');
    if (!stage) return;
    try {
      const c = document.createElement('canvas');
      const w = img.naturalWidth, h = img.naturalHeight;
      c.width = w; c.height = h;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      // solo i 4 angoli (a 2px dal bordo): li' c'e' lo sfondo della foto
      const pts = [[2, 2], [w - 3, 2], [2, h - 3], [w - 3, h - 3]];
      let r = 0, g = 0, b = 0, n = 0;
      pts.forEach(function (p) {
        const d = ctx.getImageData(p[0], p[1], 1, 1).data;
        if (d[3] < 128) return;           // trasparente: ignora
        r += d[0]; g += d[1]; b += d[2]; n++;
      });
      stage.style.background = n ? 'rgb(' + Math.round(r / n) + ',' + Math.round(g / n) + ',' + Math.round(b / n) + ')' : '#fff';
    } catch (err) {
      stage.style.background = '#fff';    // canvas non disponibile
    }
  }
  function hookStageBg() {
    const img = cardEl && cardEl.querySelector('.museum-card-img');
    if (!img) return;
    img.addEventListener('load', function () { matchStageBg(img); });
    if (img.complete && img.naturalWidth) matchStageBg(img);
  }

  // The wave often repeats the year ("2020 - WAVE 1"): show only the part after the year.
  function waveLabel(item) {
    let w = item.wave && item.wave !== '-' ? String(item.wave).trim() : '';
    const y = item.year && item.year !== '-' ? String(item.year).trim() : '';
    if (y && w.indexOf(y) === 0) w = w.slice(y.length).replace(/^\s*[-\u2013\u00b7]?\s*/, '');
    return w || null;
  }

  function renderCard(entry) {
    const hasMultiple = cardImages.length > 1;
    const metaLine = [
      entry.item.year && entry.item.year !== '-' ? entry.item.year : null,
      waveLabel(entry.item),
      entry.serie,
      entry.sub,
    ].filter(Boolean).join(' \u00b7 ');
    const bios = window.MOTU_BIOS || {};
    const bio = bios[entry.item.bio || entry.item.name] || '';
    const retailLine = entry.item.priceRetail ? 'Retail price: $' + Number(entry.item.priceRetail).toFixed(2) : '';
    cardEl.innerHTML = `
      <div class="museum-card">
        <button class="museum-card-close" data-action="close-card" aria-label="Chiudi">\u2715</button>
        <div class="museum-card-layout">
          <div class="museum-card-info">
            <div class="museum-card-name">${esc(entry.item.name)}</div>
            <button class="museum-heart${isOwned(entry.item.id) ? ' on' : ''}" data-action="toggle-owned" data-id="${esc(entry.item.id)}" aria-pressed="${isOwned(entry.item.id)}">
              <span class="museum-heart-ico">${isOwned(entry.item.id) ? '\u2665' : '\u2661'}</span>
              <span class="museum-heart-txt">${isOwned(entry.item.id) ? 'In my collection' : 'Add to my collection'}</span>
            </button>
            ${condHtml(entry.item.id)}
            <div class="museum-card-meta">${esc(metaLine)}</div>
            ${retailLine ? `<div class="museum-card-retail">${esc(retailLine)}</div>` : ''}
            <div class="museum-card-desc">${bio ? esc(bio) : 'Description coming soon.'}</div>
            ${entry.item.desc ? `<div class="museum-card-note">${esc(entry.item.desc)}</div>` : ''}
          </div>
          <div class="museum-card-gallery">
            <div class="museum-card-stage">
              ${hasMultiple ? `<button class="museum-card-nav prev" data-action="card-prev" aria-label="Precedente">\u2039</button>` : ''}
              <img class="museum-card-img" src="${esc(cardImages[cardIndex])}" alt="${esc(entry.item.name)}" onerror="this.src='${PLACEHOLDER_IMG}'">
              ${hasMultiple ? `<button class="museum-card-nav next" data-action="card-next" aria-label="Successiva">\u203a</button>` : ''}
            </div>
          </div>
        </div>
      </div>
    `;
    hookStageBg();
  }

  // ── EVENTI ──
  filtersEl.addEventListener('click', function (e) {
    const ownEl = e.target.closest('[data-action="set-own"]');
    if (ownEl) { ownFilter = ownEl.getAttribute('data-v'); render(); return; }
    const bulkEl = e.target.closest('[data-action="select-all"], [data-action="select-none"]');
    if (bulkEl) {
      const on = bulkEl.getAttribute('data-action') === 'select-all';
      MUSEUM_SERIES.forEach(s => { activeSeries[s] = on; });
      render();
      return;
    }
    const el = e.target.closest('[data-action="toggle-serie"]');
    if (!el) return;
    const serie = el.getAttribute('data-serie');
    activeSeries[serie] = !activeSeries[serie];
    render();
  });

  shelvesEl.addEventListener('click', function (e) {
    const el = e.target.closest('[data-action="open-card"]');
    if (!el) return;
    openCard(parseInt(el.getAttribute('data-index'), 10));
  });

  document.addEventListener('click', function (e) {
    if (!cardEl) return;
    const navEl = e.target.closest('[data-action]');
    if (navEl) {
      const action = navEl.getAttribute('data-action');
      if (action === 'card-prev') { cardGo(-1); return; }
      if (action === 'card-next') { cardGo(1); return; }
      if (action === 'close-card') { closeCard(); return; }
      if (action === 'set-cond') {
        const id = navEl.getAttribute('data-id'), k = navEl.getAttribute('data-k');
        setCond(id, k);
        navEl.parentElement.querySelectorAll('.museum-cond-btn').forEach(b => b.classList.toggle('on', b === navEl));
        return;
      }
      if (action === 'toggle-owned') {
        const id = navEl.getAttribute('data-id');
        const on = !isOwned(id);
        setOwned(id, on);
        navEl.classList.toggle('on', on);
        navEl.setAttribute('aria-pressed', on ? 'true' : 'false');
        navEl.querySelector('.museum-heart-ico').textContent = on ? '\u2665' : '\u2661';
        navEl.querySelector('.museum-heart-txt').textContent = on ? 'In my collection' : 'Add to my collection';
        const cb = cardEl.querySelector('.museum-cond');
        if (cb) { cb.hidden = !on; cb.querySelectorAll('.museum-cond-btn').forEach(b => b.classList.toggle('on', b.getAttribute('data-k') === getCond(id))); }
        const btn = shelvesEl.querySelector('[data-id="' + id.replace(/"/g, '') + '"]');
        if (btn) btn.classList.toggle('is-owned', on);
        return;
      }
    }
    if (e.target === cardEl) closeCard();
  });

  document.addEventListener('keydown', function (e) {
    if (!cardEl) return;
    if (e.key === 'Escape') closeCard();
    else if (e.key === 'ArrowLeft') cardGo(-1);
    else if (e.key === 'ArrowRight') cardGo(1);
  });

  // Ricompone gli scaffali se cambia la larghezza (rotazione telefono/tablet,
  // ridimensionamento finestra), ma senza ricalcolare ad ogni pixel.
  let resizeTimer = null;
  let lastPerShelf = getFiguresPerShelf();
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      const current = getFiguresPerShelf();
      if (current !== lastPerShelf) {
        lastPerShelf = current;
        renderShelves();
      }
    }, 150);
  });

  // ── AVVIO ──
  render();
})();
