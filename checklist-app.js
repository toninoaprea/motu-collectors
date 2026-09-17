// ============================================================
// MOTU COLLECTORS — CHECKLIST APP (vanilla JS)
// Adattato dal componente React Native (Expo Snack) fornito da Neno.
// Richiede motu-data.js caricato PRIMA di questo file.
// ============================================================

(function () {
  const CATALOG = window.MOTU_CATALOG;
  const searchAll = window.motuSearchAll;
  const getValueRows = window.motuGetValueRows;
  const getItems = window.motuGetItems;
  const getStats = window.motuGetStats;

  // Loghi disponibili per serie (file presenti in /img)
  const SERIE_LOGOS = {
    'VINTAGE LINE': 'img/logo-classic.png',
    'SHE-RA': 'img/logo-shera.png',
    'NEW ADVENTURES': 'img/logo-newadventures.png',
    '200x': 'img/logo-200x.png',
    'CLASSICS': 'img/logo-classics.png',
    'SUPER 7': 'img/logo-super7.png',
    'MONDO': 'img/logo-mondo.png',
    'ORIGINS': 'img/logo-origins.png',
    'MASTERVERSE': 'img/logo-masterverse.png',
    'CHRONICLES': 'img/logo-2026.png',
  };
  const SERIE_EMOJI = {
    'VINTAGE LINE': '⚔️', 'SHE-RA': '👸', 'NEW ADVENTURES': '🚀',
    'COMMEMORATIVE': '🏅', '200x': '🌟', 'CLASSICS': '🏆', 'SUPER 7': '💥',
    'ETERNIA MINIS': '🧩', 'MONDO': '🎭', 'ORIGINS': '✨', 'MASTERVERSE': '👑',
    'CHRONICLES': '🎬', 'TEST': '🧪',
  };

  // ── STATO PERSISTENTE (localStorage) ──
  const STORAGE_OWNED = 'motu_owned_ids';
  const STORAGE_VALUE = 'motu_value_ids';

  function loadJSON(key) {
    try { return JSON.parse(localStorage.getItem(key)) || {}; }
    catch (e) { return {}; }
  }
  function saveJSON(key, obj) {
    try { localStorage.setItem(key, JSON.stringify(obj)); } catch (e) { /* storage non disponibile */ }
  }

  let ownedIds = loadJSON(STORAGE_OWNED);
  let valueIds = loadJSON(STORAGE_VALUE);
  const expandedIds = {}; // solo in-memory

  // ── STATO DI NAVIGAZIONE ──
  let screen = 'home'; // home | subcategories | items | value
  let selectedSerie = null;
  let selectedSub = null;
  let homeQuery = '';
  let valueQuery = '';
  let valueFilterSerie = 'ALL';
  let valueFilterSub = 'ALL';

  const root = document.getElementById('motuApp');
  if (!root) return;

  function toggleOwned(id) {
    ownedIds[id] = !ownedIds[id];
    saveJSON(STORAGE_OWNED, ownedIds);
    render();
  }
  function toggleExpand(id) {
    expandedIds[id] = !expandedIds[id];
    render();
  }
  function toggleValue(key) {
    valueIds[key] = !valueIds[key];
    saveJSON(STORAGE_VALUE, valueIds);
    render();
  }

  // ── LIGHTBOX FOTO ──
  // Al momento mostra solo l'immagine ingrandita. In futuro si può sostituire
  // "openPhotoLightbox" con una navigazione verso una vera pagina/galleria foto
  // per quel personaggio, senza toccare il resto dell'app.
  let lightboxEl = null;
  function openPhotoLightbox(imageSrc, name) {
    closePhotoLightbox();
    lightboxEl = document.createElement('div');
    lightboxEl.className = 'motu-lightbox';
    lightboxEl.innerHTML = `
      <div class="motu-lightbox-inner">
        <button class="motu-lightbox-close" aria-label="Chiudi">✕</button>
        <img class="motu-lightbox-img" src="${esc(imageSrc)}" alt="${esc(name)}">
        <div class="motu-lightbox-caption">${esc(name)}</div>
      </div>
    `;
    document.body.appendChild(lightboxEl);
  }
  function closePhotoLightbox() {
    if (lightboxEl) { lightboxEl.remove(); lightboxEl = null; }
  }

  function esc(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  // ── COMPONENTI HTML ──

  function statsBar(stats) {
    return `
      <div class="motu-stats">
        <div class="motu-stat"><div class="motu-stat-n">${stats.total}</div><div class="motu-stat-l">TOTAL</div></div>
        <div class="motu-stat"><div class="motu-stat-n owned">${stats.owned}</div><div class="motu-stat-l">OWNED</div></div>
        <div class="motu-stat"><div class="motu-stat-n missing">${stats.missing}</div><div class="motu-stat-l">MISSING</div></div>
      </div>
      <div class="motu-progress-wrap">
        <div class="motu-progress-track"><div class="motu-progress-fill" style="width:${stats.pct}%"></div></div>
        <div class="motu-progress-label">${stats.pct}% complete</div>
      </div>
    `;
  }

  function appbar(title, sub, showBack) {
    return `
      <div class="motu-appbar">
        ${showBack ? `<button class="motu-back" data-action="back">‹</button>` : `<div class="motu-appbar-spacer"></div>`}
        <div class="motu-appbar-titles">
          <div class="motu-appbar-title">${esc(title)}</div>
          <div class="motu-appbar-sub">${esc(sub)}</div>
        </div>
        <div class="motu-appbar-spacer"></div>
      </div>
    `;
  }

  function renderCharacterRow(item) {
    const owned = !!ownedIds[item.id];
    const expanded = !!expandedIds[item.id];
    const hasVariants = Array.isArray(item.variants) && item.variants.length > 0;
    const metaLine = [item.wave, item.serie ? (item.serie + ' · ' + item.sub) : null].filter(Boolean).join(' · ');
    const thumb = item.image
      ? `<button class="motu-char-thumb-btn" data-action="open-photo" data-image="${esc(item.image)}" data-name="${esc(item.name)}">
           <img class="motu-char-thumb" src="${esc(item.image)}" alt="${esc(item.name)}" onerror="this.parentElement.outerHTML='<div class=&quot;motu-char-thumb motu-char-thumb-placeholder&quot;>🖼️</div>'">
           <span class="motu-char-thumb-zoom">🔍</span>
         </button>`
      : '';
    let html = `
      <div class="motu-char-block">
        <div class="motu-char-row">
          <button class="motu-stamp ${owned ? 'owned' : ''}" data-action="toggle-owned" data-id="${esc(item.id)}">${owned ? '✓' : ''}</button>
          ${thumb}
          <div class="motu-char-info">
            <div class="motu-char-name ${owned ? 'owned' : ''}">${esc(item.name)}</div>
            <div class="motu-char-wave">${esc(metaLine)}</div>
          </div>
          ${hasVariants ? `<button class="motu-expand-btn" data-action="toggle-expand" data-id="${esc(item.id)}">${expanded ? '▲' : '▼'}</button>` : ''}
        </div>
    `;
    if (hasVariants && expanded) {
      item.variants.forEach(v => {
        const vOwned = !!ownedIds[v.id];
        html += `
          <div class="motu-variant-row" data-action="toggle-owned" data-id="${esc(v.id)}">
            <div class="motu-variant-stamp ${vOwned ? 'owned' : ''}">${vOwned ? '✓' : ''}</div>
            <div class="motu-variant-name ${vOwned ? 'owned' : ''}">${esc(v.name)}</div>
          </div>
        `;
      });
    }
    html += `</div>`;
    return html;
  }

  function searchBar(placeholder, value, onInputAction, onClearAction) {
    return `
      <div class="motu-search">
        <span class="motu-search-icon">⌕</span>
        <input type="text" placeholder="${esc(placeholder)}" value="${esc(value)}" data-action="${onInputAction}" />
        ${value ? `<button class="motu-search-clear" data-action="${onClearAction}">✕</button>` : ''}
      </div>
    `;
  }

  // ── SCHERMATA: HOME ──
  function renderHome() {
    const stats = getStats(ownedIds, null, null);
    const series = Object.keys(CATALOG);
    const isSearching = homeQuery.trim().length > 0;
    const results = isSearching ? searchAll(homeQuery) : [];

    let listHtml = '';
    if (isSearching) {
      listHtml = results.length
        ? results.map(renderCharacterRow).join('')
        : `<div class="motu-empty"><div class="motu-empty-title">No results for "${esc(homeQuery)}"</div></div>`;
    } else {
      listHtml = series.map(serie => {
        const st = getStats(ownedIds, serie, null);
        const subCount = Object.keys(CATALOG[serie]).length;
        const logo = SERIE_LOGOS[serie];
        const emoji = SERIE_EMOJI[serie] || '⭐';
        return `
          <button class="motu-list-row" data-action="open-serie" data-serie="${esc(serie)}">
            ${logo ? `<img class="motu-list-row-logo" src="${logo}" alt="${esc(serie)}" onerror="this.outerHTML='<div class=&quot;motu-list-row-emoji&quot;>${emoji}</div>'">`
                    : `<div class="motu-list-row-emoji">${emoji}</div>`}
            <div class="motu-list-row-info">
              <div class="motu-list-row-name">${esc(serie)}</div>
              <div class="motu-list-row-meta">${subCount} categories · ${st.owned}/${st.total} owned</div>
              <div class="motu-list-row-track"><div class="motu-list-row-fill" style="width:${st.pct}%"></div></div>
            </div>
            <div class="motu-list-row-pct">${st.pct}%</div>
            <div class="motu-chevron">›</div>
          </button>
        `;
      }).join('');
    }

    root.innerHTML = `
      <div class="motu-app">
        ${appbar('MOTU COLLECTOR', 'THE CHECKLIST APP', false)}
        ${statsBar(stats)}
        ${searchBar('Search the entire catalog...', homeQuery, 'home-search', 'home-search-clear')}
        <div>${listHtml}</div>
        <a class="motu-value-cta" href="#" data-action="open-value">💰 COLLECTION VALUE</a>
      </div>
    `;
  }

  // ── SCHERMATA: SOTTOCATEGORIE ──
  function renderSubcategories() {
    const subs = Object.keys(CATALOG[selectedSerie] || {});
    const stats = getStats(ownedIds, selectedSerie, null);
    const listHtml = subs.map(sub => {
      const st = getStats(ownedIds, selectedSerie, sub);
      return `
        <button class="motu-list-row" data-action="open-sub" data-sub="${esc(sub)}">
          <div class="motu-list-row-info">
            <div class="motu-list-row-name">${esc(sub)}</div>
            <div class="motu-list-row-meta">${st.owned}/${st.total} owned</div>
            <div class="motu-list-row-track"><div class="motu-list-row-fill" style="width:${st.pct}%"></div></div>
          </div>
          <div class="motu-list-row-pct">${st.pct}%</div>
          <div class="motu-chevron">›</div>
        </button>
      `;
    }).join('');

    root.innerHTML = `
      <div class="motu-app">
        ${appbar(selectedSerie, 'MASTERS OF THE UNIVERSE', true)}
        ${statsBar(stats)}
        <div>${listHtml}</div>
      </div>
    `;
  }

  // ── SCHERMATA: LISTA PERSONAGGI ──
  function renderItemsScreen() {
    const items = getItems(selectedSerie, selectedSub);
    const stats = getStats(ownedIds, selectedSerie, selectedSub);
    const listHtml = items.length
      ? items.map(renderCharacterRow).join('')
      : `<div class="motu-empty"><div class="motu-empty-title">No items.</div></div>`;

    root.innerHTML = `
      <div class="motu-app">
        ${appbar(selectedSub, selectedSerie, true)}
        ${statsBar(stats)}
        <div>${listHtml}</div>
      </div>
    `;
  }

  // ── SCHERMATA: COLLECTION VALUE ──
  function renderValueScreen() {
    const allRows = getValueRows(ownedIds, valueIds);
    const serieOptions = ['ALL'].concat(Object.keys(CATALOG));
    const subOptions = valueFilterSerie === 'ALL' ? [] : ['ALL'].concat(Object.keys(CATALOG[valueFilterSerie] || {}));

    const filtered = allRows.filter(row => {
      const matchSerie = valueFilterSerie === 'ALL' || row.serie === valueFilterSerie;
      const matchSub = valueFilterSub === 'ALL' || row.sub === valueFilterSub;
      const q = valueQuery.toLowerCase();
      const matchQuery = !q || row.name.toLowerCase().includes(q) || row.variant.toLowerCase().includes(q);
      return matchSerie && matchSub && matchQuery;
    });
    const grandTotal = filtered.reduce((sum, r) => sum + r.total, 0);

    const chipsSerie = serieOptions.map(opt => `
      <button class="motu-filter-chip ${valueFilterSerie === opt ? 'active' : ''}" data-action="value-filter-serie" data-value="${esc(opt)}">
        ${opt === 'ALL' ? 'ALL SERIES' : esc(opt)}
      </button>
    `).join('');
    const chipsSub = subOptions.length ? `<div class="motu-filters">${subOptions.map(opt => `
      <button class="motu-filter-chip ${valueFilterSub === opt ? 'active' : ''}" data-action="value-filter-sub" data-value="${esc(opt)}">${esc(opt)}</button>
    `).join('')}</div>` : '';

    const rowsHtml = filtered.length ? filtered.map(row => `
      <div class="motu-value-row">
        <div style="flex:2; min-width:0;">
          <div class="motu-value-name">${esc(row.name)}</div>
          <div class="motu-value-sub">${esc(row.year)} · ${esc(row.wave)}</div>
        </div>
        <div class="motu-value-variant" style="flex:1.3;">${esc(row.variant)}</div>
        <div class="motu-value-cell" data-action="toggle-value" data-key="${esc(row.looseKey)}">
          <div class="motu-value-check ${row.looseOn ? 'on' : ''}">${row.looseOn ? '✓' : ''}</div>
          <div class="motu-value-price ${row.looseOn ? 'on' : ''}">${row.priceLoose > 0 ? '€' + row.priceLoose : '-'}</div>
        </div>
        <div class="motu-value-cell" data-action="toggle-value" data-key="${esc(row.mocKey)}">
          <div class="motu-value-check ${row.mocOn ? 'on' : ''}">${row.mocOn ? '✓' : ''}</div>
          <div class="motu-value-price ${row.mocOn ? 'on' : ''}">${row.priceMOC > 0 ? '€' + row.priceMOC : '-'}</div>
        </div>
        <div class="motu-value-linetotal">${row.total > 0 ? '€' + row.total : '-'}</div>
      </div>
    `).join('') : `<div class="motu-empty"><div class="motu-empty-title">No items owned yet.</div><div class="motu-empty-sub">Check off characters in the checklist to see them here.</div></div>`;

    root.innerHTML = `
      <div class="motu-app">
        ${appbar('VALUE', 'COLLECTION VALUE', true)}
        <div class="motu-value-total">
          <div class="motu-value-total-label">TOTAL COLLECTION VALUE</div>
          <div class="motu-value-total-amount">€ ${grandTotal.toLocaleString('en-US')}</div>
          <div class="motu-value-total-sub">${filtered.length} items listed</div>
        </div>
        ${searchBar('Search the pricelist...', valueQuery, 'value-search', 'value-search-clear')}
        <div class="motu-filters">${chipsSerie}</div>
        ${chipsSub}
        <div class="motu-value-header">
          <div style="flex:2;">CHARACTER</div><div style="flex:1.3;">VARIANT</div>
          <div style="width:58px;text-align:center;">LOOSE</div><div style="width:58px;text-align:center;">MOC</div>
          <div style="width:58px;text-align:right;">TOT</div>
        </div>
        <div>${rowsHtml}</div>
      </div>
    `;
  }

  // ── ROUTER ──
  function render() {
    if (screen === 'home') renderHome();
    else if (screen === 'subcategories') renderSubcategories();
    else if (screen === 'items') renderItemsScreen();
    else if (screen === 'value') renderValueScreen();
  }

  // ── EVENTI (delegazione su root) ──
  root.addEventListener('click', function (e) {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const action = el.getAttribute('data-action');
    switch (action) {
      case 'back':
        if (screen === 'items') { screen = 'subcategories'; }
        else if (screen === 'subcategories') { screen = 'home'; selectedSerie = null; }
        else if (screen === 'value') { screen = 'home'; }
        render();
        break;
      case 'open-serie':
        selectedSerie = el.getAttribute('data-serie');
        screen = 'subcategories';
        render();
        break;
      case 'open-sub':
        selectedSub = el.getAttribute('data-sub');
        screen = 'items';
        render();
        break;
      case 'open-value':
        e.preventDefault();
        screen = 'value';
        render();
        break;
      case 'toggle-owned':
        toggleOwned(el.getAttribute('data-id'));
        break;
      case 'toggle-expand':
        toggleExpand(el.getAttribute('data-id'));
        break;
      case 'open-photo':
        openPhotoLightbox(el.getAttribute('data-image'), el.getAttribute('data-name'));
        break;
      case 'toggle-value':
        toggleValue(el.getAttribute('data-key'));
        break;
      case 'home-search-clear':
        homeQuery = ''; render();
        break;
      case 'value-search-clear':
        valueQuery = ''; render();
        break;
      case 'value-filter-serie':
        valueFilterSerie = el.getAttribute('data-value');
        valueFilterSub = 'ALL';
        render();
        break;
      case 'value-filter-sub':
        valueFilterSub = el.getAttribute('data-value');
        render();
        break;
      default:
        break;
    }
  });

  // Input di ricerca gestiti separatamente per non perdere il focus ad ogni render
  root.addEventListener('input', function (e) {
    const el = e.target;
    if (el.getAttribute('data-action') === 'home-search') {
      homeQuery = el.value;
      renderHome();
      const input = root.querySelector('[data-action="home-search"]');
      if (input) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
    } else if (el.getAttribute('data-action') === 'value-search') {
      valueQuery = el.value;
      renderValueScreen();
      const input = root.querySelector('[data-action="value-search"]');
      if (input) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
    }
  });

  // Il lightbox vive fuori da #motuApp, quindi serve un listener a livello di documento.
  // Chiude solo cliccando lo sfondo o la X — mai cliccando la foto stessa.
  document.addEventListener('click', function (e) {
    if (!lightboxEl) return;
    if (e.target === lightboxEl || e.target.closest('.motu-lightbox-close')) {
      closePhotoLightbox();
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closePhotoLightbox();
  });

  // ── AVVIO ──
  render();
})();
