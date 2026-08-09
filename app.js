// ── NAVBAR MOBILE TOGGLE ──
function toggleMenu() {
  const links = document.getElementById('navLinks');
  const overlay = document.getElementById('navOverlay');
  const toggle = document.getElementById('navToggle');
  links.classList.toggle('open');
  overlay.classList.toggle('active');
  if (toggle) toggle.textContent = links.classList.contains('open') ? '✕' : '☰';
}

function closeMenu() {
  const links = document.getElementById('navLinks');
  const overlay = document.getElementById('navOverlay');
  const toggle = document.getElementById('navToggle');
  if (links) links.classList.remove('open');
  if (overlay) overlay.classList.remove('active');
  if (toggle) toggle.textContent = '☰';
}

// ── MODAL GUEST ──
function openGuestModal() {
  const modal = document.getElementById('guestModal');
  if (modal) modal.classList.add('active');
}
function closeGuestModal() {
  const modal = document.getElementById('guestModal');
  if (modal) modal.classList.remove('active');
}

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
