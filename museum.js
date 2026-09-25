// ============================================================
// MOTU COLLECTORS — MUSEUM PAGE (vanilla JS)
// Richiede motu-data.js caricato PRIMA di questo file.
// ============================================================

(function () {
  const CATALOG = window.MOTU_CATALOG;

  // Serie attualmente "in mostra" nel museo. Per aggiungere una nuova serie
  // in futuro basta aggiungerla a questo array: comparirà nel filtro e nello
  // scaffale senza altre modifiche al codice.
  const MUSEUM_SERIES = ['VINTAGE LINE'];

  const PLACEHOLDER_IMG = 'img/characters/base.png';
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
  function collectItems() {
    const entries = [];
    MUSEUM_SERIES.forEach(serie => {
      if (!activeSeries[serie]) return;
      const subs = CATALOG[serie] || {};
      Object.entries(subs).forEach(([sub, items]) => {
        items.forEach(item => {
          const yearNum = parseInt(item.year, 10);
          entries.push({ item, serie, sub, year: isNaN(yearNum) ? 9999 : yearNum });
        });
      });
    });
    entries.sort((a, b) => a.year - b.year);
    return entries;
  }

  function renderFilters() {
    filtersEl.innerHTML = MUSEUM_SERIES.map(serie => `
      <button class="museum-filter-chip ${activeSeries[serie] ? 'active' : ''}" data-action="toggle-serie" data-serie="${esc(serie)}">
        ${esc(serie)}
      </button>
    `).join('');
  }

  function renderShelves() {
    const entries = collectItems();
    const perShelf = getFiguresPerShelf();
    let html = `<div class="museum-filter-count">${entries.length} PEZZI ESPOSTI</div>`;
    for (let i = 0; i < entries.length; i += perShelf) {
      const rowEntries = entries.slice(i, i + perShelf);
      html += `
        <div class="museum-shelf">
          <div class="museum-shelf-figures cols-${perShelf}">
            ${rowEntries.map((e, idx) => {
              const images = getItemImages(e.item);
              return `
                <button class="museum-figure-btn" data-action="open-card" data-index="${i + idx}">
                  <span class="museum-figure-img-wrap">
                    <img class="museum-figure-img" src="${esc(images[0])}" alt="${esc(e.item.name)}" onerror="this.src='${PLACEHOLDER_IMG}'">
                  </span>
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
      html += `<div class="museum-filter-count" style="padding-bottom:40px;">Nessuna serie selezionata.</div>`;
    }
    shelvesEl.innerHTML = html;
    // Salva l'elenco corrente per poterlo referenziare al click (indice stabile)
    shelvesEl._entries = entries;
  }

  function render() {
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
  }

  function cardGo(delta) {
    if (!cardImages.length) return;
    cardIndex = (cardIndex + delta + cardImages.length) % cardImages.length;
    const img = cardEl && cardEl.querySelector('.museum-card-img');
    if (img) img.src = cardImages[cardIndex];
  }

  function renderCard(entry) {
    const hasMultiple = cardImages.length > 1;
    const metaLine = [
      entry.item.year && entry.item.year !== '-' ? entry.item.year : null,
      entry.item.wave && entry.item.wave !== '-' ? entry.item.wave : null,
      entry.serie,
      entry.sub,
    ].filter(Boolean).join(' \u00b7 ');
    cardEl.innerHTML = `
      <div class="museum-card">
        <button class="museum-card-close" data-action="close-card" aria-label="Chiudi">\u2715</button>
        <div class="museum-card-layout">
          <div class="museum-card-info">
            <div class="museum-card-name">${esc(entry.item.name)}</div>
            <div class="museum-card-meta">${esc(metaLine)}</div>
            <div class="museum-card-desc">Descrizione in arrivo.</div>
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
  }

  // ── EVENTI ──
  filtersEl.addEventListener('click', function (e) {
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
