// Menu mobile robusto per iOS — caricare DOPO app.js (sovrascrive toggleMenu/closeMenu)
(function () {
  function els() {
    return {
      links: document.getElementById('navLinks'),
      overlay: document.getElementById('navOverlay'),
      btn: document.getElementById('navToggle'),
    };
  }
  var scrollY = 0;
  function setOpen(open) {
    var e = els();
    if (!e.links) return;
    if (open && !document.body.classList.contains('nav-locked')) {
      scrollY = window.pageYOffset || 0;
      document.body.style.top = (-scrollY) + 'px';
    }
    e.links.classList.toggle('open', open);
    if (e.overlay) e.overlay.classList.toggle('active', open);
    if (e.btn) {
      e.btn.textContent = open ? '✕' : '☰';
      e.btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    document.body.classList.toggle('nav-locked', open);
    if (!open) {
      document.body.style.top = '';
      window.scrollTo(0, scrollY);
    }
  }
  window.toggleMenu = function () {
    var e = els();
    setOpen(!(e.links && e.links.classList.contains('open')));
  };
  window.closeMenu = function () { setOpen(false); };

  document.addEventListener('click', function (ev) {
    var a = ev.target.closest && ev.target.closest('#navLinks a');
    if (a) setOpen(false);
  });
  window.addEventListener('resize', function () {
    if (window.innerWidth > 768) setOpen(false);
  });
})();
