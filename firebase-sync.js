// ============================================================
// MOTU COLLECTORS — FIREBASE (Auth + Firestore)
// Caricare come <script type="module" src="firebase-sync.js"> DOPO motu-data.js
// ============================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  GoogleAuthProvider, signInWithPopup, signOut, sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, deleteDoc, runTransaction, collection, getDocs,
  query, orderBy, limit, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAEIWKCOKs0ASyX_Ti1bxb1wBxCHYLEkmA",
  authDomain: "motucollectors-f6137.firebaseapp.com",
  projectId: "motucollectors-f6137",
  storageBucket: "motucollectors-f6137.firebasestorage.app",
  messagingSenderId: "360712859487",
  appId: "1:360712859487:web:c702a78fb7f92b00cd10ea"
};
const ADMIN_EMAIL = "toninoaprea@tin.it"; // solo per mostrare i controlli admin: la sicurezza vera sta nelle regole Firestore

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
auth.languageCode = "en";
const db = getFirestore(app);

const KEYS = { owned: "motu_owned_ids", value: "motu_value_ids", qty: "motu_qty_ids" };
const K_DIRTY = "motu_dirty";
const K_SYNCED = "motu_synced_uid";

// ── utilità storage ──
function lsGet(k) { try { return JSON.parse(localStorage.getItem(k)) || {}; } catch (e) { return {}; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
function lsFlag(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }
function localData() { return { owned: lsGet(KEYS.owned), value: lsGet(KEYS.value), qty: lsGet(KEYS.qty) }; }
function cleanMap(m, numeric) {
  const out = {};
  Object.keys(m || {}).forEach(k => { if (numeric) { const n = parseInt(m[k], 10); if (n > 1) out[k] = Math.min(99, n); } else if (m[k]) out[k] = true; });
  return out;
}

// ── nickname ──
const NICK_RE = /^[A-Za-z0-9][A-Za-z0-9 _.\-]{1,18}[A-Za-z0-9]$/;
function nickKey(n) { return n.trim().toLowerCase().replace(/\s+/g, "_"); }
function validNick(n) { return typeof n === "string" && NICK_RE.test(n.trim()); }

// ── stato ──
let currentUser = null;
let profile = null;      // documento users/{uid}
let ready = false;
let pushTimer = null;
const listeners = [];

function isAdmin() { return !!(currentUser && currentUser.email && currentUser.email.toLowerCase() === ADMIN_EMAIL && currentUser.emailVerified); }
function emit() { listeners.forEach(fn => { try { fn({ user: currentUser, profile, admin: isAdmin(), ready }); } catch (e) { console.error(e); } }); updateNav(); }

// ── statistiche pubbliche ──
function computeStats(data) {
  if (typeof window.motuGetStats !== "function") return null;
  const s = window.motuGetStats(data.owned, null, null, data.qty);
  // collectionValue: valore in USD (interi) dei pezzi segnati, con la condizione scelta (loose/MOC)
  const cv = typeof window.motuGetCollectionValue === "function" ? Math.round(window.motuGetCollectionValue(data.owned, data.value, data.qty)) : 0;
  const cs = typeof window.motuGetConditionStats === "function" ? window.motuGetConditionStats(data.owned, data.value, data.qty) : { looseCount: 0, mocCount: 0, looseValue: 0, mocValue: 0 };
  return { owned: s.owned, unique: s.unique, doubles: s.doubles, total: s.pieces, catalogTotal: s.total, collectionValue: cv,
    looseCount: cs.looseCount, mocCount: cs.mocCount, looseValue: cs.looseValue, mocValue: cs.mocValue };
}

// ── sync collezione ──
const privRef = uid => doc(db, "users", uid, "private", "collection");
const profRef = uid => doc(db, "users", uid);

async function pushNow() {
  if (!currentUser) return;
  const data = localData();
  const clean = { owned: cleanMap(data.owned), value: cleanMap(data.value), qty: cleanMap(data.qty, true) };
  try {
    await setDoc(privRef(currentUser.uid), { ...clean, updatedAt: serverTimestamp() });
    const st = computeStats(clean);
    if (st && profile) await setDoc(profRef(currentUser.uid), { ...st, updatedAt: serverTimestamp() }, { merge: true });
    lsFlag(K_DIRTY, null);
  } catch (e) { console.error("Sync push failed", e); }
}
function schedulePush() {
  lsFlag(K_DIRTY, "1");
  if (!currentUser) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(pushNow, 1500);
}
window.addEventListener("motu-data-changed", schedulePush);
window.addEventListener("pagehide", () => { if (lsFlag(K_DIRTY) && currentUser) pushNow(); });

async function pullAndMerge() {
  const uid = currentUser.uid;
  const snap = await getDoc(privRef(uid));
  const remote = snap.exists() ? snap.data() : { owned: {}, value: {}, qty: {} };
  const local = localData();
  const first = lsFlag(K_SYNCED) !== uid;      // primo accesso di questo utente su questo dispositivo
  const dirty = !!lsFlag(K_DIRTY);
  let merged;
  if (first) {
    // unione: non si perde nulla di quanto segnato da ospite
    merged = { owned: { ...(remote.owned || {}), ...local.owned }, value: { ...(remote.value || {}), ...local.value }, qty: { ...(remote.qty || {}) } };
    Object.keys(local.qty).forEach(k => { merged.qty[k] = Math.max(parseInt(merged.qty[k], 10) || 1, parseInt(local.qty[k], 10) || 1); });
  } else if (dirty) {
    merged = local;      // modifiche fatte offline: vincono
  } else {
    merged = { owned: remote.owned || {}, value: remote.value || {}, qty: remote.qty || {} };   // il cloud è la verità
  }
  // Confronto normalizzato (chiavi ordinate, valori puliti): evita "cambiamenti" fantasma che causavano ricaricamenti continui
  const norm = d => JSON.stringify([cleanMap(d.owned), cleanMap(d.value), cleanMap(d.qty, true)].map(m => Object.keys(m).sort().map(k => [k, m[k]])));
  const changedLocal = norm(local) !== norm(merged);
  lsSet(KEYS.owned, cleanMap(merged.owned)); lsSet(KEYS.value, cleanMap(merged.value)); lsSet(KEYS.qty, cleanMap(merged.qty, true));
  lsFlag(K_SYNCED, uid);
  if (first || dirty) await pushNow();
  else if (profile) {   // prezzi aggiornati nel catalogo: riallinea il valore pubblicato
    try {
      const st = computeStats({ owned: cleanMap(merged.owned), value: cleanMap(merged.value), qty: cleanMap(merged.qty, true) });
      const keys = ["collectionValue", "looseCount", "mocCount", "looseValue", "mocValue"];
      if (st && keys.some(k => st[k] !== profile[k])) { await setDoc(profRef(uid), { ...st, updatedAt: serverTimestamp() }, { merge: true }); keys.forEach(k => { profile[k] = st[k]; }); }
    } catch (e) { console.error("Value refresh failed", e); }
  }
  if (changedLocal) window.dispatchEvent(new Event("motu-remote-loaded"));
}

// ── profilo / nickname ──
async function loadProfile() {
  const snap = await getDoc(profRef(currentUser.uid));
  profile = snap.exists() && snap.data().nickname ? snap.data() : null;
}

async function claimNickname(nick) {
  nick = nick.trim();
  if (!validNick(nick)) throw new Error("Nickname must be 3–20 characters: letters, numbers, space, dot, dash, underscore.");
  if (!currentUser) throw new Error("Not logged in.");
  const uid = currentUser.uid;
  const newKey = nickKey(nick);
  const oldKey = profile && profile.nickname ? nickKey(profile.nickname) : null;
  const newRef = doc(db, "nicknames", newKey);
  await runTransaction(db, async tx => {
    const ex = await tx.get(newRef);
    if (ex.exists() && ex.data().uid !== uid) throw new Error("This nickname is already taken.");
    tx.set(newRef, { uid });
    if (oldKey && oldKey !== newKey) tx.delete(doc(db, "nicknames", oldKey));
  });
  const st = computeStats(localData()) || {};
  const base = profile ? {} : { createdAt: serverTimestamp(), unique: 0, doubles: 0, total: 0, owned: 0, catalogTotal: 0, looseCount: 0, mocCount: 0, looseValue: 0, mocValue: 0 };
  await setDoc(profRef(uid), { ...base, ...st, nickname: nick, updatedAt: serverTimestamp() }, { merge: true });
  await loadProfile();
  emit();
  await pushNow();   // allinea subito collezione e statistiche pubbliche
  return profile;
}

// ── API pubblica ──
function errMsg(e) {
  const c = e && e.code || "";
  const map = {
    "auth/invalid-email": "Invalid email address.",
    "auth/missing-password": "Enter a password.",
    "auth/weak-password": "Password must be at least 6 characters.",
    "auth/email-already-in-use": "An account with this email already exists. Try logging in.",
    "auth/invalid-credential": "Wrong email or password.",
    "auth/user-not-found": "Wrong email or password.",
    "auth/wrong-password": "Wrong email or password.",
    "auth/too-many-requests": "Too many attempts. Try again in a few minutes.",
    "auth/popup-closed-by-user": "Login window closed.",
    "auth/popup-blocked": "Your browser blocked the login window. Allow pop-ups and retry.",
    "auth/network-request-failed": "Network error. Check your connection.",
    "auth/unauthorized-domain": "This domain is not authorized in Firebase (Authentication > Settings > Authorized domains).",
    "permission-denied": "Permission denied by the database rules."
  };
  return map[c] || (e && e.message) || "Something went wrong.";
}

window.MotuCloud = {
  db, auth, errMsg, validNick, nickKey,
  get user() { return currentUser; },
  get profile() { return profile; },
  get ready() { return ready; },
  get isAdmin() { return isAdmin(); },
  onChange(fn) { listeners.push(fn); if (ready) fn({ user: currentUser, profile, admin: isAdmin(), ready }); },
  signUp: (email, pw) => createUserWithEmailAndPassword(auth, email, pw),
  signIn: (email, pw) => signInWithEmailAndPassword(auth, email, pw),
  google: () => signInWithPopup(auth, new GoogleAuthProvider()),
  resetPassword: email => sendPasswordResetEmail(auth, email),
  claimNickname,
  async logout() {
    if (lsFlag(K_DIRTY)) await pushNow();
    await signOut(auth);
    [KEYS.owned, KEYS.value, KEYS.qty].forEach(k => lsFlag(k, null));
    lsFlag(K_SYNCED, null); lsFlag(K_DIRTY, null);
  },
  // classifica
  async leaderboard() {
    const snap = await getDocs(query(collection(db, "users"), orderBy("unique", "desc"), limit(500)));
    return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
  },
  // solo admin
  async adminDeleteUser(uid, nick) {
    await deleteDoc(profRef(uid));
    if (nick) await deleteDoc(doc(db, "nicknames", nickKey(nick)));
  },
  async adminRenameUser(uid, oldNick, newNick) {
    if (!validNick(newNick)) throw new Error("Invalid nickname.");
    const newKey = nickKey(newNick);
    const ref = doc(db, "nicknames", newKey);
    await runTransaction(db, async tx => {
      const ex = await tx.get(ref);
      if (ex.exists() && ex.data().uid !== uid) throw new Error("This nickname is already taken.");
      tx.set(ref, { uid });
      if (oldNick && nickKey(oldNick) !== newKey) tx.delete(doc(db, "nicknames", nickKey(oldNick)));
    });
    await setDoc(profRef(uid), { nickname: newNick.trim(), updatedAt: serverTimestamp() }, { merge: true });
  }
};

window.dispatchEvent(new Event("motu-cloud-ready"));

// ── menu: LOGIN → nickname + logout ──
function updateNav() {
  const loginLink = document.querySelector("a.nav-login");
  const mob = document.querySelector(".nav-mobile-actions");
  if (!currentUser) {
    if (loginLink) { loginLink.textContent = "LOGIN"; loginLink.href = "login.html"; }
    return;
  }
  if (isAdmin() && loginLink && !document.getElementById("navAdminLi")) {
    const li = document.createElement("li"); li.id = "navAdminLi";
    li.innerHTML = '<a href="admin.html">ADMIN</a>';
    if (loginLink.parentElement && loginLink.parentElement.parentElement) loginLink.parentElement.parentElement.insertBefore(li, loginLink.parentElement);
  }
  const label = profile ? profile.nickname : "MY ACCOUNT";
  if (loginLink) { loginLink.textContent = "👤 " + label.toUpperCase(); loginLink.href = "login.html"; }
  if (mob) {
    mob.innerHTML = '<a href="login.html" class="btn-login-mobile">👤 ' + label.replace(/[<>&"]/g, "") + '</a>' +
      '<a href="#" class="btn-register" id="navLogout">LOG OUT</a>';
    const b = document.getElementById("navLogout");
    if (b) b.addEventListener("click", async e => { e.preventDefault(); await window.MotuCloud.logout(); location.reload(); });
  }
}

// ── finestra nickname (primo accesso, su qualsiasi pagina) ──
function showNickModal() {
  if (document.getElementById("motuNickModal") || /login\.html$/.test(location.pathname)) return;
  const el = document.createElement("div");
  el.id = "motuNickModal";
  el.style.cssText = "position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.75);display:flex;align-items:center;justify-content:center;padding:16px;";
  el.innerHTML = '<div style="background:#fff;border-radius:12px;max-width:380px;width:100%;padding:24px;font-family:Inter,sans-serif;">' +
    '<h2 style="font-family:\'Bebas Neue\',sans-serif;letter-spacing:2px;font-size:28px;margin:0 0 8px;">CHOOSE YOUR NICKNAME</h2>' +
    '<p style="margin:0 0 14px;color:#555;font-size:14px;">It will be public in the leaderboard. You can change it later. Do not use your real name.</p>' +
    '<input id="motuNickInput" maxlength="20" placeholder="e.g. HeManFan" style="width:100%;box-sizing:border-box;padding:12px;border:1px solid #ccc;border-radius:8px;font-size:16px;">' +
    '<p id="motuNickErr" style="color:#c4161c;font-size:13px;min-height:18px;margin:8px 0;"></p>' +
    '<button id="motuNickBtn" style="width:100%;padding:12px;border:0;border-radius:999px;background:#c4161c;color:#fff;font-family:\'Bebas Neue\',sans-serif;letter-spacing:2px;font-size:18px;cursor:pointer;">SAVE</button></div>';
  document.body.appendChild(el);
  const go = async () => {
    const btn = document.getElementById("motuNickBtn"), err = document.getElementById("motuNickErr");
    btn.disabled = true; err.textContent = "";
    try { await claimNickname(document.getElementById("motuNickInput").value); el.remove(); }
    catch (e) { err.textContent = errMsg(e); btn.disabled = false; }
  };
  document.getElementById("motuNickBtn").addEventListener("click", go);
  document.getElementById("motuNickInput").addEventListener("keydown", e => { if (e.key === "Enter") go(); });
}

// Pagine senza gestione propria dei dati (museum, value...): ricarica quando arrivano dati dal cloud
window.addEventListener("motu-remote-loaded", () => {
  if (document.getElementById("motuApp") || /login\.html$|leaderboard\.html$|admin\.html$/.test(location.pathname)) return;
  // Sicurezza anti-loop: al massimo un ricaricamento ogni 20 secondi
  try { const t = parseInt(sessionStorage.getItem("motu_reload_t") || "0", 10); if (Date.now() - t < 20000) return; sessionStorage.setItem("motu_reload_t", String(Date.now())); } catch (e) {}
  location.reload();
});

// ── avvio ──
onAuthStateChanged(auth, async user => {
  currentUser = user; profile = null;
  if (user) {
    try {
      await loadProfile();
      await pullAndMerge();
    } catch (e) { console.error("Cloud load failed", e); }
  }
  ready = true;
  emit();
  if (user && !profile) showNickModal();
});
