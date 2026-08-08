// ── NAVBAR MOBILE TOGGLE ──
function toggleMenu() {
  const links = document.getElementById('navLinks');
  const overlay = document.getElementById('navOverlay');
  links.classList.toggle('open');
  overlay.classList.toggle('active');
}

function closeMenu() {
  document.getElementById('navLinks').classList.remove('open');
  document.getElementById('navOverlay').classList.remove('active');
}

// ── MODAL GUEST (quando utente non registrato preme ENTER) ──
function openGuestModal() {
  document.getElementById('guestModal').classList.add('active');
}
function closeGuestModal() {
  document.getElementById('guestModal').classList.remove('active');
}

// Chiudi modal cliccando fuori
document.addEventListener('click', function(e) {
  const modal = document.getElementById('guestModal');
  if (modal && e.target === modal) closeGuestModal();
});

// ── STATS COUNTER ANIMATION ──
function animateCount(el, target, suffix = '') {
  let current = 0;
  const step = Math.ceil(target / 40);
  const timer = setInterval(() => {
    current += step;
    if (current >= target) { current = target; clearInterval(timer); }
    el.textContent = current.toLocaleString() + suffix;
  }, 30);
}

// Avvia animazione quando la stats-bar è visibile
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const collectorsEl = document.getElementById('stat-collectors');
      const figuresEl = document.getElementById('stat-figures');
      if (collectorsEl) animateCount(collectorsEl, 0);
      if (figuresEl) animateCount(figuresEl, 1000, '+');
      observer.disconnect();
    }
  });
}, { threshold: 0.5 });

const statsBar = document.querySelector('.stats-bar');
if (statsBar) observer.observe(statsBar);
