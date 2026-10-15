// ============================================================
// MOTU COLLECTORS — COLLECTOR VALUE (tabella prezzi)
// Richiede motu-data.js caricato PRIMA di questo file.
// ============================================================
(function () {
  var CATALOG = window.MOTU_CATALOG;
  var PLACEHOLDER = 'img/characters/base.png';
  var PAGE = 200;

  var bodyEl = document.getElementById('valueBody');
  var countEl = document.getElementById('valueCount');
  var searchEl = document.getElementById('valueSearch');
  var serieEl = document.getElementById('valueSerie');
  var moreEl = document.getElementById('valueMore');
  if (!bodyEl || !CATALOG) return;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // Un prezzo 0/assente viene mostrato come "-"
  function price(v) {
    var n = Number(v);
    if (!n || n <= 0) return '<td class="price empty">-</td>';
    return '<td class="price">' + n.toLocaleString('it-IT') + '</td>';
  }

  // Costruisce tutte le righe: una per personaggio, e per i vintage
  // una per ogni variante (paese di produzione).
  var rows = [];
  var order = 0;
  Object.keys(CATALOG).forEach(function (serie) {
    var subs = CATALOG[serie] || {};
    Object.keys(subs).forEach(function (sub) {
      subs[sub].forEach(function (item) {
        var img = (item.images && item.images[0]) || item.image || PLACEHOLDER;
        var y = parseInt(item.year, 10);
        var base = { serie: serie, year: item.year, yearNum: isNaN(y) ? 9999 : y, img: img };
        if (item.variants && item.variants.length) {
          item.variants.forEach(function (v) {
            rows.push(Object.assign({}, base, {
              name: item.name, variant: v.name, moc: v.priceMOC, loose: v.priceLoose, order: order++
            }));
          });
        } else {
          rows.push(Object.assign({}, base, {
            name: item.name, variant: '', moc: item.priceMOC, loose: item.priceLoose, order: order++
          }));
        }
      });
    });
  });
  // Ordine per anno di uscita; a parità di anno resta l'ordine di catalogo
  rows.sort(function (a, b) { return a.yearNum - b.yearNum || a.order - b.order; });

  // Filtro serie
  serieEl.innerHTML = '<option value="">ALL SERIES</option>' +
    Object.keys(CATALOG).map(function (s) { return '<option value="' + esc(s) + '">' + esc(s) + '</option>'; }).join('');

  var filtered = rows;
  var shown = 0;

  function rowHtml(r) {
    var label = esc(r.name) + (r.variant ? ' <span class="value-variant">– ' + esc(r.variant) + '</span>' : '');
    return '<tr>' +
      '<td class="col-img"><img class="value-thumb" loading="lazy" src="' + esc(r.img) + '" alt="' + esc(r.name) + '" onerror="this.onerror=null;this.src=\'' + PLACEHOLDER + '\'"></td>' +
      '<td class="value-serie">' + esc(r.serie) + '</td>' +
      '<td class="value-name">' + label + '</td>' +
      '<td>' + esc(r.year && r.year !== '-' ? r.year : '-') + '</td>' +
      price(r.moc) + price(r.loose) +
      '</tr>';
  }

  function renderMore(reset) {
    if (reset) { bodyEl.innerHTML = ''; shown = 0; }
    if (!filtered.length) {
      bodyEl.innerHTML = '<tr><td colspan="6" class="value-empty">No results.</td></tr>';
      moreEl.hidden = true;
      return;
    }
    var next = filtered.slice(shown, shown + PAGE);
    bodyEl.insertAdjacentHTML('beforeend', next.map(rowHtml).join(''));
    shown += next.length;
    moreEl.hidden = shown >= filtered.length;
    moreEl.textContent = 'SHOW MORE (' + (filtered.length - shown) + ')';
  }

  function applyFilters() {
    var q = searchEl.value.trim().toLowerCase();
    var s = serieEl.value;
    filtered = rows.filter(function (r) {
      if (s && r.serie !== s) return false;
      if (!q) return true;
      return (r.name + ' ' + r.variant + ' ' + r.serie + ' ' + r.year).toLowerCase().indexOf(q) !== -1;
    });
    countEl.textContent = filtered.length + ' ITEMS';
    renderMore(true);
  }

  var t = null;
  searchEl.addEventListener('input', function () { clearTimeout(t); t = setTimeout(applyFilters, 150); });
  serieEl.addEventListener('change', applyFilters);
  moreEl.addEventListener('click', function () { renderMore(false); });

  applyFilters();
})();
