(function () {
  var $ = function (id) { return document.getElementById(id); };
  var mode = 'login';

  function whenCloud(cb) {
    if (window.MotuCloud) cb(); else window.addEventListener('motu-cloud-ready', cb, { once: true });
  }
  function setMsg(el, text, ok) { el.textContent = text || ''; el.className = 'acc-msg' + (ok ? ' ok' : ''); }

  whenCloud(function () {
    var C = window.MotuCloud;
    var next = new URLSearchParams(location.search).get('next') || 'checklist.html';
    if (!/^[a-z0-9_\-]+\.html$/i.test(next)) next = 'checklist.html';

    function setMode(m) {
      mode = m;
      document.querySelectorAll('.acc-tab').forEach(function (t) { t.classList.toggle('active', t.dataset.mode === m); });
      document.querySelectorAll('.acc-reg').forEach(function (e) { e.hidden = m !== 'register'; });
      $('accSubmit').textContent = m === 'register' ? 'CREATE ACCOUNT' : 'LOGIN';
      $('accPass').autocomplete = m === 'register' ? 'new-password' : 'current-password';
      $('accForgot').hidden = m === 'register';
      setMsg($('accMsg'), '');
    }
    document.querySelectorAll('.acc-tab').forEach(function (t) { t.addEventListener('click', function () { setMode(t.dataset.mode); }); });
    if (new URLSearchParams(location.search).get('mode') === 'register') setMode('register');

    function render(st) {
      $('accLoading').hidden = true;
      var logged = !!st.user;
      $('accGuest').hidden = logged;
      $('accUser').hidden = !logged;
      if (!logged) return;
      var p = st.profile;
      $('accName').textContent = p ? p.nickname : '';
      $('accNick2').value = p ? p.nickname : '';
      $('accAdmin').hidden = !st.admin;
      $('stUnique').textContent = p ? (p.unique || 0) : 0;
      $('stDoubles').textContent = p ? (p.doubles || 0) : 0;
      $('stTotal').textContent = p ? (p.total || 0) : 0;
    }
    C.onChange(render);

    var busy = false;
    function lock(v) { busy = v; $('accSubmit').disabled = v; $('accGoogle').disabled = v; }

    // dopo il login: se non c'è nickname (utente Google/nuovo) lo chiediamo qui
    async function afterAuth(nickForNew) {
      // attende che il profilo sia caricato dall'ascolto auth
      for (var i = 0; i < 40 && !C.ready; i++) await new Promise(function (r) { setTimeout(r, 100); });
      await new Promise(function (r) { setTimeout(r, 400); });
      if (!C.profile) {
        var nick = nickForNew || window.prompt('Choose your public nickname (3–20 characters):') || '';
        if (nick) { await C.claimNickname(nick); }
      }
      location.href = next;
    }

    $('accForm').addEventListener('submit', async function (e) {
      e.preventDefault();
      if (busy) return;
      var email = $('accEmail').value.trim(), pw = $('accPass').value, msg = $('accMsg');
      setMsg(msg, '');
      if (mode === 'register') {
        var nick = $('accNick').value.trim();
        if (!C.validNick(nick)) return setMsg(msg, 'Nickname must be 3–20 characters: letters, numbers, space, dot, dash, underscore.');
      }
      lock(true);
      try {
        if (mode === 'register') {
          await C.signUp(email, pw);
          await afterAuth($('accNick').value.trim());
        } else {
          await C.signIn(email, pw);
          await afterAuth('');
        }
      } catch (err) { setMsg(msg, C.errMsg(err)); lock(false); }
    });

    $('accGoogle').addEventListener('click', async function () {
      if (busy) return;
      setMsg($('accMsg'), ''); lock(true);
      try { await C.google(); await afterAuth(''); }
      catch (err) { setMsg($('accMsg'), C.errMsg(err)); lock(false); }
    });

    $('accForgot').addEventListener('click', async function () {
      var email = $('accEmail').value.trim();
      if (!email) return setMsg($('accMsg'), 'Enter your email above, then press "Forgot password?".');
      try { await C.resetPassword(email); setMsg($('accMsg'), 'Password reset email sent. Check your inbox (and spam).', true); }
      catch (err) { setMsg($('accMsg'), C.errMsg(err)); }
    });

    $('accNickForm').addEventListener('submit', async function (e) {
      e.preventDefault();
      var msg = $('accMsg2');
      try { await C.claimNickname($('accNick2').value); setMsg(msg, 'Nickname saved.', true); }
      catch (err) { setMsg(msg, C.errMsg(err)); }
    });

    $('accLogout').addEventListener('click', async function () { await C.logout(); location.reload(); });
  });
})();
