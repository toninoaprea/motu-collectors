(function () {
  var $ = function (id) { return document.getElementById(id); };
  var rows = [], sortBy = 'unique', admin = false;
  var MEDAL = ['🥇', '🥈', '🥉'];

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function whenCloud(cb) { if (window.MotuCloud) cb(); else window.addEventListener('motu-cloud-ready', cb, { once: true }); }
  function sorted(key) {
    return rows.slice().sort(function (a, b) { return (b[key] || 0) - (a[key] || 0) || (b.unique || 0) - (a.unique || 0) || String(a.nickname).localeCompare(String(b.nickname)); });
  }
  function cur() { try { return localStorage.getItem('motu_currency') === 'EUR' ? 'EUR' : 'USD'; } catch (e) { return 'USD'; } }
  function money(usd) {
    var cfg = window.MOTU_CONFIG || { usdToEur: 0.92 }, n = Number(usd) || 0, eur = cur() === 'EUR';
    return (eur ? '\u20ac' : '$') + Math.round(eur ? n * cfg.usdToEur : n).toLocaleString('en-US');
  }
  function fmt(key, v) { return key === 'collectionValue' ? money(v) : (v || 0); }
  function pct(r) { var t = window.motuGetStats ? window.motuGetStats({}, null, null, {}).total : 0; return t ? Math.round((r.owned || 0) / t * 100) : 0; }

  function podium(title, key) {
    var top = sorted(key).filter(function (r) { return (r[key] || 0) > 0; }).slice(0, 3);
    var list = top.length ? top.map(function (r, i) {
      return '<li><span class="pd-medal">' + MEDAL[i] + '</span><span class="pd-name">' + esc(r.nickname) + '</span><span class="pd-n">' + fmt(key, r[key]) + '</span></li>';
    }).join('') : '<li class="pd-empty">No one yet</li>';
    return '<div class="lb-podium"><h3>' + title + '</h3><ol>' + list + '</ol></div>';
  }

  function render() {
    $('lbPodiums').innerHTML = podium('MOST UNIQUE PIECES', 'unique') + podium('MOST DOUBLES', 'doubles') + podium('MOST TOTAL PIECES', 'total') + podium('MOST VALUABLE COLLECTION', 'collectionValue');
    var list = sorted(sortBy);
    var cols = admin ? 8 : 7;
    document.querySelector('th.adm').hidden = !admin;
    $('lbBody').innerHTML = list.length ? list.map(function (r, i) {
      return '<tr><td class="rk">' + (i + 1) + '</td><td class="nm">' + esc(r.nickname) + '</td>' +
        '<td class="n' + (sortBy === 'unique' ? ' on' : '') + '">' + (r.unique || 0) + '</td>' +
        '<td class="n' + (sortBy === 'doubles' ? ' on' : '') + '">' + (r.doubles || 0) + '</td>' +
        '<td class="n' + (sortBy === 'total' ? ' on' : '') + '">' + (r.total || 0) + '</td>' +
        '<td class="n' + (sortBy === 'collectionValue' ? ' on' : '') + '">' + money(r.collectionValue) + '</td>' +
        '<td class="n">' + pct(r) + '%</td>' +
        (admin ? '<td class="adm"><button data-act="rename" data-uid="' + esc(r.uid) + '">RENAME</button> <button data-act="del" data-uid="' + esc(r.uid) + '">DELETE</button></td>' : '') +
        '</tr>';
    }).join('') : '<tr><td colspan="' + cols + '" class="lb-empty">No collectors yet. Be the first: <a href="login.html">register free</a>.</td></tr>';
  }

  var curEl = $('lbCur');
  if (curEl) {
    curEl.value = cur();
    curEl.addEventListener('change', function () { try { localStorage.setItem('motu_currency', curEl.value === 'EUR' ? 'EUR' : 'USD'); } catch (e) {} render(); });
  }
  document.querySelectorAll('.lb-tab').forEach(function (t) {
    t.addEventListener('click', function () {
      sortBy = t.dataset.sort;
      document.querySelectorAll('.lb-tab').forEach(function (x) { x.classList.toggle('active', x === t); });
      render();
    });
  });

  whenCloud(function () {
    var C = window.MotuCloud;
    function load() {
      C.leaderboard().then(function (r) { rows = r.filter(function (x) { return x.nickname; }); $('lbMsg').textContent = ''; render(); })
        .catch(function (e) { $('lbMsg').textContent = 'Could not load the leaderboard: ' + C.errMsg(e); $('lbBody').innerHTML = ''; });
    }
    C.onChange(function (st) { admin = st.admin; load(); });
    $('lbBody').addEventListener('click', async function (e) {
      var b = e.target.closest('button[data-act]');
      if (!b || !admin) return;
      var r = rows.find(function (x) { return x.uid === b.dataset.uid; });
      if (!r) return;
      try {
        if (b.dataset.act === 'del') {
          if (!confirm('Remove "' + r.nickname + '" from the leaderboard?')) return;
          await C.adminDeleteUser(r.uid, r.nickname);
        } else {
          var n = prompt('New nickname for ' + r.nickname + ':', r.nickname);
          if (!n) return;
          await C.adminRenameUser(r.uid, r.nickname, n);
        }
        load();
      } catch (err) { alert(C.errMsg(err)); }
    });
  });
})();
