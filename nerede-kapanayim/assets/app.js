'use strict';

/* ============================================================
   AlanKilit — konum kilidi
   Tarayıcıda çalışan, konum tabanlı ekran kilidi.
   ============================================================ */

const STORAGE_KEY = 'neredeKapansin.v1';
const APP_VERSION = '1.1.0';
const REMOTE_VERSION_URL = 'https://raw.githubusercontent.com/Alaaddin-617/UzayOS/main/nerede-kapanayim/version.json';
const REMOTE_UPDATE_URL = 'https://github.com/Alaaddin-617/UzayOS/tree/main/nerede-kapanayim';
const PALETTE = ['#5eead4', '#a78bfa', '#fbbf24', '#fb7185', '#60a5fa', '#34d399', '#f472b6'];
const DEFAULT_RADIUS = 100;
const MIN_RADIUS = 50;
const MAX_RADIUS = 1000;

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/* ---------------- durum ---------------- */

let state = loadState();
let locked = state.activeLock ? { ...state.activeLock } : null;
let lastFix = null;
let geoState = 'idle'; // idle | asking | active | denied | unavailable
let geoWatch = null;
let selectedId = null;
let currentView = 'home';
let viewReady = false;
let demoTimer = null;
let wakeLock = null;
let audioCtx = null;
let deferredPrompt = null;
let swRegistration = null;
let pendingUpdate = null;
let updateDismissed = false;
let refreshing = false;
let lastUpdateCheck = 0;
let lastRemoteVersionCheck = 0;
let remoteUpdateAvailable = '';
let toastTimer = null;
let busy = false;
let lastRefreshTry = 0;
let birthPromptPending = false;
let startupLinkHandled = false;

function defaultState() {
  return {
    v: 1,
    places: [],
    role: '',
    birthDate: '',
    settings: {
      sound: true,
      vibrate: true,
      emergency: true,
      hysteresis: 25,
      powerSave: true
    },
    profile: { name: '', phone: '' },
    group: null,
    pendingJoin: null,
    activeLock: null
  };
}

function roleDefaults(role) {
  if (role === 'student') return { lockMinutes: 40, breakMinutes: 10 };
  return { lockMinutes: 50, breakMinutes: 10 };
}

function roleLabel(role) {
  if (role === 'student') return 'Çocuk';
  if (role === 'adult') return 'Yetişkin';
  return 'Yaş seç';
}

function normalizeBirthDate(value) {
  const text = String(value || '').trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return '';
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1900 || year > 2100) return '';
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return '';
  }
  return text;
}

function localIsoDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return year + '-' + month + '-' + day;
}

function ageFromBirthDate(value, now = new Date()) {
  const normalized = normalizeBirthDate(value);
  if (!normalized) return null;
  const [year, month, day] = normalized.split('-').map(Number);
  let age = now.getFullYear() - year;
  const nowMonth = now.getMonth() + 1;
  if (nowMonth < month || (nowMonth === month && now.getDate() < day)) age--;
  return age;
}

function currentAge() {
  return ageFromBirthDate(state.birthDate);
}

function isAdult() {
  const age = currentAge();
  if (age != null) return age >= 18;
  return state.role === 'adult';
}

function roleFromBirthDate(value) {
  const age = ageFromBirthDate(value);
  if (age == null) return '';
  return age >= 18 ? 'adult' : 'student';
}

function ageModeText(age) {
  if (age == null) return 'Doğum tarihi girilmedi.';
  if (age >= 18) return age + ' yaş · yetişkin: süreli kilit ve mola';
  return age + ' yaş · 18 yaş altı: alandan çıkınca açılır';
}

function minutesValue(value, fallback, max = 240) {
  if (value === undefined || value === null || value === '') return clamp(Math.floor(Number(fallback) || 0), 0, max);
  return clamp(Math.floor(Number(value) || 0), 0, max);
}

function radiusValue(value, fallback = DEFAULT_RADIUS) {
  const parsed = value === undefined || value === null || value === ''
    ? Number(fallback)
    : Number(value);
  return clamp(Number.isFinite(parsed) ? Math.round(parsed) : DEFAULT_RADIUS, MIN_RADIUS, MAX_RADIUS);
}

function phoneDigits(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 15);
}

function phoneKey(value) {
  return phoneDigits(value).slice(-10);
}

function validPhone(value) {
  const digits = phoneDigits(value);
  return digits.length >= 10 && digits.length <= 15;
}

function fmtPhone(value) {
  let digits = phoneDigits(value);
  if (!digits) return '';
  if (digits.length === 12 && digits.startsWith('90')) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length === 10) {
    return '0 (' + digits.slice(0, 3) + ') ' + digits.slice(3, 6) + ' ' + digits.slice(6, 8) + ' ' + digits.slice(8, 10);
  }
  return '+' + digits;
}

function normalizeProfile(raw) {
  return {
    name: String((raw && raw.name) || '').trim().replace(/\s+/g, ' ').slice(0, 40),
    phone: phoneDigits(raw && raw.phone)
  };
}

function normalizeLocation(raw) {
  if (!raw) return null;
  const lat = Number(raw.lat);
  const lng = Number(raw.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return null;
  }
  return {
    lat,
    lng,
    accuracy: Math.max(0, Number(raw.accuracy) || 0),
    at: Number(raw.at) || Date.now()
  };
}

function normalizeGroupPlace(raw) {
  if (!raw || !raw.id) return null;
  const lat = Number(raw.lat);
  const lng = Number(raw.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    id: String(raw.id),
    name: String(raw.name || 'Grup yeri').slice(0, 40),
    lat,
    lng,
    radius: DEFAULT_RADIUS,
    lockMinutes: minutesValue(raw.lockMinutes, 0, 240),
    breakMinutes: minutesValue(raw.breakMinutes, 0, 60),
    createdAt: Number(raw.createdAt) || Date.now()
  };
}

function normalizeGroupMember(raw) {
  if (!raw || !raw.id) return null;
  return {
    id: String(raw.id),
    name: String(raw.name || 'Üye').slice(0, 40),
    phone: phoneDigits(raw.phone),
    lastSeen: Number(raw.lastSeen) || 0,
    locked: Boolean(raw.locked),
    placeId: raw.placeId ? String(raw.placeId) : null,
    placeName: String(raw.placeName || '').slice(0, 60),
    shareLocation: raw.shareLocation !== false,
    location: normalizeLocation(raw.location),
    remote: raw.remote && Number(raw.remote.seq)
      ? {
          mode: raw.remote.mode === 'lock' ? 'lock' : 'unlock',
          at: Number(raw.remote.at) || 0,
          seq: Number(raw.remote.seq) || 0
        }
      : null
  };
}

function normalizeGroup(raw) {
  if (!raw || !raw.id) return null;
  const role = raw.role === 'admin' ? 'admin' : 'member';
  return {
    id: String(raw.id),
    role,
    name: String(raw.name || 'Grup').slice(0, 40),
    code: String(raw.code || '').toUpperCase(),
    adminName: String(raw.adminName || 'Yönetici').slice(0, 40),
    adminPhone: phoneDigits(raw.adminPhone),
    adminToken: role === 'admin' && raw.adminToken ? String(raw.adminToken) : null,
    memberId: raw.memberId ? String(raw.memberId) : null,
    memberName: String(raw.memberName || '').slice(0, 40),
    memberToken: role === 'member' && raw.memberToken ? String(raw.memberToken) : null,
    places: Array.isArray(raw.places) ? raw.places.map(normalizeGroupPlace).filter(Boolean) : [],
    members: Array.isArray(raw.members) ? raw.members.map(normalizeGroupMember).filter(Boolean) : [],
    pending: Array.isArray(raw.pending)
      ? raw.pending.filter((r) => r && r.id).map((r) => ({
          id: String(r.id),
          name: String(r.name || 'Üye').slice(0, 40),
          phone: phoneDigits(r.phone),
          at: Number(r.at) || 0
        }))
      : [],
    invites: Array.isArray(raw.invites)
      ? raw.invites.filter((i) => i && i.id).map((i) => ({
          id: String(i.id),
          name: String(i.name || '').slice(0, 40),
          phone: phoneDigits(i.phone),
          token: String(i.token || ''),
          at: Number(i.at) || 0,
          acceptedAt: Number(i.acceptedAt) || null,
          memberId: i.memberId ? String(i.memberId) : null
        }))
      : [],
    events: Array.isArray(raw.events)
      ? raw.events.filter((e) => e && e.id).slice(0, 120).map((e) => ({
          id: String(e.id),
          at: Number(e.at) || 0,
          type: String(e.type || ''),
          text: String(e.text || '').slice(0, 180),
          memberId: e.memberId ? String(e.memberId) : null,
          memberName: String(e.memberName || '').slice(0, 40)
        }))
      : [],
    seq: Number(raw.seq) || 0,
    lastRemoteSeq: Number(raw.lastRemoteSeq) || 0,
    override: normalizeGroupOverride(raw.override),
    shareLocation: raw.shareLocation !== false,
    remoteLockActive: Boolean(raw.remoteLockActive),
    lastSync: Number(raw.lastSync) || 0
  };
}

function normalizeGroupOverride(raw) {
  if (!raw) return null;
  const placeId = raw.placeId ? String(raw.placeId) : null;
  if (raw.untilLeave) return { untilLeave: true, until: 0, placeId };
  const until = Number(raw.until) || 0;
  return until > 0 ? { untilLeave: false, until, placeId } : null;
}

function normalizePendingJoin(raw) {
  if (!raw || !raw.requestId || !raw.requestToken) return null;
  return {
    groupId: String(raw.groupId || ''),
    requestId: String(raw.requestId),
    requestToken: String(raw.requestToken),
    groupName: String(raw.groupName || 'Grup').slice(0, 40),
    name: String(raw.name || '').slice(0, 40),
    at: Number(raw.at) || Date.now()
  };
}

function getDeviceId() {
  try {
    let id = localStorage.getItem('neredeKapansin.device');
    if (!id) {
      id = uid();
      localStorage.setItem('neredeKapansin.device', id);
    }
    return id;
  } catch {
    return 'dev-' + Math.random().toString(36).slice(2, 10);
  }
}

function normalizeHistory(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((e) => e && Number.isFinite(Number(e.at)))
    .slice(0, 50)
    .map((e) => ({
      at: Number(e.at),
      ms: Math.max(0, Number(e.ms) || 0),
      how: e.how === 'emergency' ? 'emergency' : (e.how === 'break' ? 'break' : 'left')
    }));
}

function normalizePlace(p, index) {
  const lat = Number(p && p.lat);
  const lng = Number(p && p.lng);
  return {
    id: (p && p.id) ? String(p.id) : uid(),
    name: (p && p.name ? String(p.name) : 'Yer').slice(0, 40),
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
    radius: radiusValue(p && p.radius),
    color: (p && p.color) || PALETTE[index % PALETTE.length],
    count: Math.max(0, Math.floor(Number(p && p.count) || 0)),
    totalMs: Math.max(0, Number(p && p.totalMs) || 0),
    lastAt: Number(p && p.lastAt) || null,
    history: normalizeHistory(p && p.history),
    inside: Boolean(p && p.inside),
    knownInside: Boolean(p && p.knownInside),
    lockMinutes: minutesValue(p && p.lockMinutes, 0, 240),
    breakMinutes: minutesValue(p && p.breakMinutes, 0, 60),
    breakUntil: Number(p && p.breakUntil) || 0,
    enabled: !p || p.enabled !== false,
    createdAt: Number(p && p.createdAt) || Date.now()
  };
}

function loadState() {
  const base = defaultState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return base;

    const merged = {
      ...base,
      ...parsed,
      role: parsed.role === 'student' ? 'student' : (parsed.role === 'adult' ? 'adult' : ''),
      birthDate: normalizeBirthDate(parsed.birthDate),
      settings: { ...base.settings, ...(parsed.settings || {}) },
      profile: normalizeProfile(parsed.profile),
      group: normalizeGroup(parsed.group),
      pendingJoin: normalizePendingJoin(parsed.pendingJoin)
    };
    merged.places = Array.isArray(parsed.places)
      ? parsed.places.map((p, i) => normalizePlace(p, i))
      : [];
    const active = parsed.activeLock;
    if (active && active.startedAt) {
      const source = ['personal', 'group', 'remote'].includes(active.source) ? active.source : 'personal';
      const placeId = String(active.placeId || (source === 'remote' && merged.group ? 'remote:' + merged.group.id : ''));
      merged.activeLock = placeId
        ? {
            placeId,
            startedAt: Number(active.startedAt) || Date.now(),
            demo: false,
            source,
            groupId: active.groupId ? String(active.groupId) : null,
            label: String(active.label || ''),
            autoUnlockAt: Number(active.autoUnlockAt) || 0,
            lockMinutes: minutesValue(active.lockMinutes, 0, 240),
            breakMinutes: minutesValue(active.breakMinutes, 0, 60)
          }
        : null;
    } else {
      merged.activeLock = null;
    }
    return merged;
  } catch {
    return base;
  }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* depolama kapalıysa sessizce devam et */
  }
}

/* ---------------- yardımcılar ---------------- */

function uid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'p-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function getPlace(id) {
  return state.places.find((p) => p.id === id) || null;
}

function esc(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

function norm(value) {
  return String(value).trim().replace(/\s+/g, ' ').toLocaleLowerCase('tr-TR');
}

function distanceM(a, b) {
  const R = 6371000;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLng / 2);
  const h = s1 * s1 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * s2 * s2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function fmtDistance(m) {
  if (m == null || !Number.isFinite(m)) return '—';
  if (m < 1000) return Math.max(0, Math.round(m)) + ' m';
  return (m / 1000).toLocaleString('tr-TR', { maximumFractionDigits: 1 }) + ' km';
}

function fmtDuration(ms) {
  const totalMin = Math.floor(Math.max(0, ms) / 60000);
  if (totalMin < 1) return '<1 dk';
  if (totalMin < 60) return totalMin + ' dk';
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h < 24) return h + ' sa' + (m ? ' ' + m + ' dk' : '');
  const d = Math.floor(h / 24);
  return d + ' gün';
}

function fmtClock(ms) {
  const total = Math.floor(Math.max(0, ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? h + ':' + pad(m) + ':' + pad(s) : pad(m) + ':' + pad(s);
}

function fmtWhen(ts) {
  if (!ts) return '—';
  const diff = Date.now() - ts;
  if (diff < 60000) return 'az önce';
  if (diff < 3600000) return Math.floor(diff / 60000) + ' dk önce';
  if (diff < 86400000) return Math.floor(diff / 3600000) + ' sa önce';
  if (diff < 7 * 86400000) return Math.floor(diff / 86400000) + ' gün önce';
  return new Date(ts).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function isToday(ts) {
  return Number(ts) >= startOfToday();
}

function todayCount(place) {
  const done = (place.history || []).filter((e) => isToday(e.at)).length;
  const active = locked && !locked.demo && locked.source === 'personal' && locked.placeId === place.id && isToday(locked.startedAt);
  return done + (active ? 1 : 0);
}

function toast(message, isError = false) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = message;
  el.classList.toggle('error', !!isError);
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3800);
}

function angleFor(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return (h % 360) * Math.PI / 180;
}

/* ---------------- konum ---------------- */

function setGeoState(next) {
  geoState = next;
  syncGeoUI();
}

function syncGeoUI() {
  const pill = $('#gpsPill');
  const text = $('#gpsText');
  if (!pill || !text) return;

  const visual = geoState === 'asking' ? 'asking' : (geoState === 'denied' ? 'idle' : geoState);
  pill.dataset.state = visual;

  if (geoState === 'active') {
    text.textContent = lastFix && lastFix.accuracy
      ? 'konum açık ±' + Math.round(lastFix.accuracy) + ' m'
      : 'konum açık';
  } else if (geoState === 'asking') {
    text.textContent = 'konum aranıyor…';
  } else if (geoState === 'denied') {
    text.textContent = 'konumu aç';
  } else if (geoState === 'unavailable') {
    text.textContent = 'konum yok';
  } else {
    text.textContent = 'konumu aç';
  }
}

function initGeo() {
  if (!('geolocation' in navigator)) {
    setGeoState('unavailable');
    return;
  }

  if (navigator.permissions && navigator.permissions.query) {
    try {
      navigator.permissions.query({ name: 'geolocation' }).then((permission) => {
        if (permission.state === 'granted') startGeo();
        else if (permission.state === 'denied') setGeoState('denied');

        permission.onchange = () => {
          if (permission.state === 'granted') startGeo();
          else if (permission.state === 'denied') {
            setGeoState('denied');
            if (geoWatch !== null) {
              try { navigator.geolocation.clearWatch(geoWatch); } catch {}
              geoWatch = null;
            }
          }
        };
      }).catch(() => {});
    } catch {}
  }
}

function armGeoOnGesture() {
  const once = () => {
    document.removeEventListener('pointerdown', once, true);
    if (geoState === 'idle') startGeo();
  };
  document.addEventListener('pointerdown', once, true);
}

function startGeo() {
  if (!('geolocation' in navigator)) {
    setGeoState('unavailable');
    return;
  }
  if (geoWatch !== null) return;
  if (document.visibilityState === 'hidden') return;

  setGeoState(lastFix ? 'active' : 'asking');

  const powerSave = state.settings.powerSave !== false;

  try {
    geoWatch = navigator.geolocation.watchPosition(onFix, onGeoError, {
      enableHighAccuracy: !powerSave,
      maximumAge: powerSave ? 120000 : 4000,
      timeout: powerSave ? 90000 : 30000
    });
  } catch {
    setGeoState('unavailable');
  }
}

function onFix(position) {
  const c = position.coords;
  lastFix = {
    lat: c.latitude,
    lng: c.longitude,
    accuracy: c.accuracy,
    at: Date.now()
  };
  setGeoState('active');
  evaluatePositions();
  evaluateGroup();
  sendGroupLocation();
  syncAll();
}

function onGeoError(error) {
  if (error && error.code === 1) {
    geoState = 'denied';
    if (geoWatch !== null) {
      try { navigator.geolocation.clearWatch(geoWatch); } catch {}
      geoWatch = null;
    }
  } else if (error && error.code === 2) {
    geoState = lastFix ? 'active' : 'unavailable';
  } else {
    geoState = lastFix ? 'active' : 'asking';
  }
  syncGeoUI();
  if (locked) updateLockUI();
}

function ensurePosition(timeout = 20000, force = false) {
  if (!force && lastFix && Date.now() - lastFix.at < 60000) {
    return Promise.resolve(lastFix);
  }
  if (!('geolocation' in navigator)) {
    setGeoState('unavailable');
    return Promise.resolve(lastFix || null);
  }

  setGeoState('asking');

  return new Promise((resolve) => {
    let done = false;

    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      resolve(lastFix || null);
    }, timeout + 3000);

    navigator.geolocation.getCurrentPosition((position) => {
      if (done) return;
      done = true;
      clearTimeout(timer);

      const c = position.coords;
      lastFix = {
        lat: c.latitude,
        lng: c.longitude,
        accuracy: c.accuracy,
        at: Date.now()
      };
      setGeoState('active');
      evaluatePositions();
      evaluateGroup();
      sendGroupLocation(true);
      syncAll();
      startGeo();
      resolve(lastFix);
    }, (error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      onGeoError(error);
      resolve(lastFix || null);
    }, {
      enableHighAccuracy: force || state.settings.powerSave === false,
      timeout,
      maximumAge: force ? 4000 : (state.settings.powerSave !== false ? 120000 : 8000)
    });
  });
}

async function refreshPosition() {
  if (geoState === 'denied') {
    toast('Konum izni kapalı. Tarayıcı ayarlarından bu siteye izin ver.', true);
    return;
  }
  if (geoState === 'unavailable') {
    toast('Bu cihaz konum desteği vermiyor', true);
    return;
  }

  const before = lastFix ? lastFix.at : 0;
  const fix = await ensurePosition(12000, true);

  if (fix && fix.at > before) toast('Konum güncellendi');
  else if (fix) toast('Konum yenilenemedi; son bilinen konum kullanılıyor', true);
  else toast('Konum alınamadı. Açık alanda tekrar dene.', true);
}

function maybeRefreshFix() {
  if (document.visibilityState !== 'visible') return;
  if (geoState !== 'active' || !lastFix) return;
  const powerSave = state.settings.powerSave !== false;
  const staleMs = powerSave ? 150000 : 45000;
  const retryMs = powerSave ? 90000 : 30000;
  if (Date.now() - lastFix.at < staleMs) return;
  if (Date.now() - lastRefreshTry < retryMs) return;

  lastRefreshTry = Date.now();
  ensurePosition(12000, false).catch(() => {});
}

/* ---------------- kilit mantığı ---------------- */

function evaluatePositions() {
  if (!lastFix) return;

  const places = state.places.filter(
    (p) => p.enabled && p.lat != null && p.lng != null
  );
  // 18 yaş altında alan sınırından çıkınca hemen açılsın; yetişkinde GPS titremesini azalt.
  const hysteresis = isAdult() ? (Number(state.settings.hysteresis) || 25) : 0;
  let changed = false;

  for (const p of places) {
    const d = distanceM(lastFix, p);
    p.distance = d;

    const isInside = d <= p.radius;
    const isClearlyOutside = d > p.radius + hysteresis;

    if (isInside) {
      if (!p.inside) {
        p.inside = true;
        changed = true;
      }
      if (p.breakUntil && Date.now() >= p.breakUntil) {
        p.breakUntil = 0;
        p.knownInside = false;
        changed = true;
      }
      if (!p.knownInside && !locked) {
        lockPlace(p);
        changed = true;
      }
    } else if (isClearlyOutside) {
      if (p.inside || p.knownInside || p.breakUntil) {
        p.inside = false;
        p.knownInside = false;
        p.breakUntil = 0;
        changed = true;
      }
      if (locked && locked.source === 'personal' && locked.placeId === p.id) {
        unlockPlace('left', { silent: true });
        changed = true;
      }
    }
  }

  // Kilit yeni açıldıysa ve başka bir alanın içindeysek onu devreye al.
  if (!locked) {
    for (const p of places) {
      const d = p.distance != null ? p.distance : distanceM(lastFix, p);
      if (d <= p.radius && !p.knownInside) {
        lockPlace(p);
        changed = true;
        break;
      }
    }
  }

  if (changed) save();
}

function resolveLockPlace(lock) {
  if (!lock) return null;
  if (lock.source === 'group' && state.group) {
    return (state.group.places || []).find((p) => p.id === lock.placeId) || null;
  }
  if (lock.source === 'remote') return null;
  return getPlace(lock.placeId);
}

function lockLabel(lock) {
  if (!lock) return '';
  if (lock.label) return lock.label;
  const place = resolveLockPlace(lock);
  return place ? place.name : 'Kilit';
}

function lockPlace(place, options = {}) {
  if (locked) return;

  const now = Date.now();
  const demo = !!options.demo;
  const source = options.source || 'personal';
  const label = options.label || (place && place.name) || 'Kilit';
  const adult = isAdult();
  const schedulePlace = adult && place && source !== 'remote' ? place : null;
  const lockMinutes = schedulePlace ? minutesValue(schedulePlace.lockMinutes, 0, 240) : 0;
  const breakMinutes = schedulePlace ? minutesValue(schedulePlace.breakMinutes, 0, 60) : 0;
  const autoUnlockAt = !demo && adult && lockMinutes > 0 ? now + lockMinutes * 60000 : 0;

  locked = {
    placeId: place.id,
    startedAt: now,
    demo,
    source,
    groupId: options.groupId || null,
    label,
    autoUnlockAt,
    lockMinutes,
    breakMinutes
  };

  if (!demo) {
    if (source === 'personal' && place) {
      place.knownInside = true;
      place.inside = true;
      place.breakUntil = 0;
      place.count = (place.count || 0) + 1;
      place.lastAt = now;
    }
    state.activeLock = locked;
    save();
  }

  showLock();

  if (!demo) {
    playAlarm();
    vibrate();
    notifyLock({ name: label });
    if (state.group && state.group.role === 'member') sendGroupStatus(true);
  } else {
    clearTimeout(demoTimer);
    demoTimer = setTimeout(() => {
      if (locked && locked.demo) unlockPlace('demo');
    }, 5000);
  }
}

function unlockPlace(reason, options = {}) {
  if (!locked) return;

  const wasDemo = !!locked.demo;
  const source = locked.source || 'personal';
  const place = resolveLockPlace(locked);
  const startedAt = locked.startedAt;
  const breakMinutes = isAdult() ? minutesValue(locked.breakMinutes, 0, 60) : 0;

  if (place && !wasDemo && source === 'personal') {
    const duration = Math.max(0, Date.now() - startedAt);
    place.totalMs = (place.totalMs || 0) + duration;
    place.history = [
      {
        at: startedAt,
        ms: duration,
        how: reason === 'emergency' ? 'emergency' : (reason === 'break' ? 'break' : 'left')
      },
      ...(place.history || [])
    ].slice(0, 50);
    if (reason === 'emergency') {
      place.knownInside = true;
      place.inside = true;
      place.breakUntil = 0;
    } else if (reason === 'break') {
      place.knownInside = true;
      place.inside = true;
      place.breakUntil = breakMinutes > 0 ? Date.now() + breakMinutes * 60000 : 0;
    } else if (reason === 'demo') {
      /* test kilidi sayılmaz */
    } else {
      place.knownInside = false;
      place.inside = false;
      place.breakUntil = 0;
    }
  }

  if ((source === 'group' || source === 'remote') && state.group) {
    if (reason === 'break') {
      state.group.override = breakMinutes > 0
        ? {
            untilLeave: false,
            until: Date.now() + breakMinutes * 60000,
            placeId: locked.placeId || null
          }
        : { untilLeave: true, until: 0, placeId: locked.placeId || null };
    } else if (reason === 'emergency' || reason === 'remote-unlock' || source === 'remote') {
      state.group.override = { untilLeave: true, until: 0, placeId: locked.placeId || null };
    }
    if (source === 'remote' || reason === 'remote-unlock') {
      state.group.remoteLockActive = false;
    }
  }

  locked = null;
  state.activeLock = null;
  save();

  hideLock();

  if (reason !== 'demo') exitFullscreen();
  if (!options.silent) renderAll();

  if (state.group && state.group.role === 'member') sendGroupStatus(true);

  if (reason === 'left') toast('Alanın dışındasın — kilit açıldı');
  else if (reason === 'emergency') toast('Acil çıkış kullanıldı — kilit açıldı', true);
  else if (reason === 'break') {
    toast(breakMinutes > 0
      ? 'Mola zamanı — ' + breakMinutes + ' dk sonra tekrar kilitlenecek'
      : 'Mola zamanı — kilit açıldı');
  }
  else if (reason === 'demo') toast('Test kilidi açıldı');
  else if (reason === 'remote-unlock') toast('Yönetici kilidi açtı');
}

/* ---------------- grup ---------------- */

let groupStream = null;
let groupPoll = null;
let groupHeartbeat = null;
let groupSyncBusy = false;
let groupStatusKey = '';
let lastLocationSent = 0;
let pendingInviteToken = null;
let joinPollTimer = null;

function groupToken() {
  const g = state.group;
  if (!g) return '';
  return g.role === 'admin' ? (g.adminToken || '') : (g.memberToken || '');
}

async function groupApi(path, options = {}) {
  if (!state.group) throw new Error('Grup yok');
  const token = groupToken();
  if (!token) throw new Error('Grup oturumu yok');

  const headers = { 'Authorization': 'Bearer ' + token };
  const init = { method: options.method || 'GET', headers };
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(options.body);
  }

  const response = await fetch(path, init);
  let data = {};
  try { data = await response.json(); } catch {}

  if (!response.ok) {
    const error = new Error(data.error || 'İşlem başarısız');
    error.status = response.status;
    throw error;
  }
  return data;
}

async function publicApi(path, options = {}) {
  const headers = {};
  const init = { method: options.method || 'GET', headers };
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(options.body);
  }
  const response = await fetch(path, init);
  let data = {};
  try { data = await response.json(); } catch {}
  if (!response.ok) {
    const error = new Error(data.error || 'İşlem başarısız');
    error.status = response.status;
    throw error;
  }
  return data;
}

function nearestGroupPlace(coord, places) {
  let best = null;
  for (const p of places || []) {
    const d = distanceM(coord, p);
    if (!best || d < best.d) best = { place: p, d };
  }
  return best;
}

function memberLocationText(member, group) {
  if (!member.shareLocation) return 'konum paylaşmıyor';
  if (!member.location) return 'konum yok';
  const nearest = nearestGroupPlace(member.location, group.places);
  const nearText = nearest
    ? (nearest.d <= nearest.place.radius
        ? nearest.place.name + ' alanında'
        : 'en yakın ' + nearest.place.name + ' · ' + fmtDistance(nearest.d))
    : '';
  return fmtWhen(member.location.at) + (nearText ? ' · ' + nearText : '');
}

function applyGroupPayload(payload) {
  if (!payload || !payload.group || !state.group) return;
  if (payload.group.id !== state.group.id) return;

  const current = state.group;
  state.group = normalizeGroup({
    ...payload.group,
    role: current.role,
    adminToken: current.adminToken,
    memberId: current.memberId || payload.memberId || null,
    memberName: current.memberName,
    memberToken: current.memberToken,
    lastRemoteSeq: current.lastRemoteSeq || 0,
    override: current.override || null,
    shareLocation: current.shareLocation,
    remoteLockActive: current.remoteLockActive,
    lastSync: Date.now()
  });

  const group = state.group;
  if (!group) return;

  if (group.role === 'member' && group.memberId && !group.members.some((m) => m.id === group.memberId)) {
    leaveGroupLocal('Gruptan çıkarıldın');
    return;
  }

  if (group.override && group.override.placeId && !group.places.some((p) => p.id === group.override.placeId)) {
    group.override = null;
  }

  if (locked && locked.source === 'group' && !group.places.some((p) => p.id === locked.placeId)) {
    unlockPlace('left', { silent: true });
  }

  if (group.role === 'member') {
    const me = group.members.find((m) => m.id === group.memberId);
    const remote = me && me.remote;
    if (remote && remote.seq > (group.lastRemoteSeq || 0)) {
      group.lastRemoteSeq = remote.seq;
      if (remote.mode === 'lock') applyRemoteLock();
      else applyRemoteUnlock();
    }
    if (group.remoteLockActive && !locked) applyRemoteLock();
  }

  save();
  renderGroupSummary();
  renderGroupHub();
  evaluateGroup();
  syncAll();
}

async function syncGroup() {
  if (!state.group || groupSyncBusy) return;
  groupSyncBusy = true;
  try {
    const data = await groupApi('/api/groups/' + encodeURIComponent(state.group.id));
    applyGroupPayload(data);
  } catch (error) {
    if (error.status === 401 || error.status === 403 || error.status === 404) {
      leaveGroupLocal(error.status === 404 ? 'Grup bulunamadı' : 'Grup oturumu geçersiz');
    }
  } finally {
    groupSyncBusy = false;
  }
}

function startGroupSync() {
  stopGroupSync();
  const group = state.group;
  if (!group || !groupToken()) {
    if (group) leaveGroupLocal('Grup oturumu geçersiz');
    return;
  }

  try {
    const url = '/api/groups/' + encodeURIComponent(group.id) +
      '/stream?token=' + encodeURIComponent(groupToken());
    groupStream = new EventSource(url);
    groupStream.addEventListener('snapshot', onGroupStream);
    groupStream.addEventListener('update', onGroupStream);
    groupStream.addEventListener('removed', () => leaveGroupLocal('Gruptan çıkarıldın'));
    groupStream.addEventListener('deleted', () => leaveGroupLocal('Grup dağıtıldı'));
  } catch {
    groupStream = null;
  }

  const pollMs = state.settings.powerSave !== false ? 30000 : 12000;
  groupPoll = setInterval(() => {
    if (document.visibilityState === 'visible') syncGroup();
  }, pollMs);

  const heartbeatMs = state.settings.powerSave !== false ? 60000 : 30000;
  groupHeartbeat = setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    sendGroupStatus(true);
    sendGroupLocation(true);
  }, heartbeatMs);

  syncGroup();
  sendGroupStatus(true);
  sendGroupLocation(true);
}

function stopGroupSync() {
  if (groupStream) {
    try { groupStream.close(); } catch {}
    groupStream = null;
  }
  if (groupPoll) {
    clearInterval(groupPoll);
    groupPoll = null;
  }
  if (groupHeartbeat) {
    clearInterval(groupHeartbeat);
    groupHeartbeat = null;
  }
  groupStatusKey = '';
}

function onGroupStream(event) {
  try {
    const data = JSON.parse(event.data);
    applyGroupPayload(data);
  } catch {}
}

function leaveGroupLocal(reason) {
  const group = state.group;
  stopGroupSync();

  if (locked && group && locked.groupId === group.id && (locked.source === 'group' || locked.source === 'remote')) {
    locked = null;
    state.activeLock = null;
    hideLock();
  }

  state.group = null;
  state.pendingJoin = null;
  save();
  renderGroupSummary();
  renderGroupHub();
  renderAll();
  if (reason) toast(reason, true);
}

function evaluateGroup() {
  const group = state.group;
  if (!group || group.role !== 'member' || !lastFix) return;

  const places = group.places || [];
  const hysteresis = isAdult() ? (Number(state.settings.hysteresis) || 25) : 0;

  if (group.override) {
    const stillInside = places.some((p) => distanceM(lastFix, p) <= p.radius + hysteresis);
    const expired = group.override.until && Date.now() >= group.override.until;
    if (!stillInside || expired || (!group.override.untilLeave && !group.override.until)) {
      group.override = null;
      save();
    }
  }

  if (locked && locked.source === 'group') {
    const place = places.find((p) => p.id === locked.placeId);
    if (!place || distanceM(lastFix, place) > place.radius + hysteresis) {
      unlockPlace('left');
    }
  }

  if (!locked && !group.override) {
    for (const place of places) {
      if (distanceM(lastFix, place) <= place.radius) {
        lockPlace(place, { source: 'group', groupId: group.id, label: place.name });
        break;
      }
    }
  }
}

function applyRemoteLock() {
  const group = state.group;
  if (!group) return;
  group.remoteLockActive = true;

  if (locked) {
    if (locked.source === 'personal') {
      save();
      return;
    }
    locked.source = 'remote';
    locked.groupId = group.id;
    locked.label = group.name + ' · yönetici';
    locked.autoUnlockAt = 0;
    locked.lockMinutes = 0;
    locked.breakMinutes = 0;
    state.activeLock = locked;
    save();
    updateLockUI();
    return;
  }

  group.override = null;
  save();
  lockPlace(
    { id: 'remote:' + group.id },
    { source: 'remote', groupId: group.id, label: group.name + ' · yönetici' }
  );
}

function applyRemoteUnlock() {
  const group = state.group;
  if (!group) return;
  group.remoteLockActive = false;
  group.override = { untilLeave: true, placeId: locked ? locked.placeId : null };
  save();

  if (locked && (locked.source === 'group' || locked.source === 'remote')) {
    unlockPlace('remote-unlock');
    return;
  }

  renderAll();
  toast('Yönetici grubu açtı');
}

function sendGroupStatus(force = false) {
  const group = state.group;
  if (!group || group.role !== 'member' || !group.memberId || !group.memberToken) return;

  const body = {
    locked: Boolean(locked),
    placeId: locked && locked.source !== 'personal' ? locked.placeId : null,
    placeName: locked
      ? (locked.source === 'personal' ? 'Kişisel kilit' : (locked.label || ''))
      : '',
    shareLocation: group.shareLocation !== false
  };

  const key = JSON.stringify(body);
  if (!force && key === groupStatusKey) return;
  groupStatusKey = key;

  groupApi(
    '/api/groups/' + encodeURIComponent(group.id) + '/members/' + encodeURIComponent(group.memberId) + '/status',
    { method: 'POST', body }
  ).catch((error) => {
    if (error.status === 403 || error.status === 404) {
      leaveGroupLocal('Gruptan çıkarıldın');
    }
  });
}

function sendGroupLocation(force = false) {
  const group = state.group;
  if (!group || group.role !== 'member' || !group.memberId || !group.memberToken) return;
  if (group.shareLocation === false || !lastFix) return;
  const interval = state.settings.powerSave !== false ? 60000 : 30000;
  if (!force && Date.now() - lastLocationSent < interval) return;

  lastLocationSent = Date.now();
  groupApi(
    '/api/groups/' + encodeURIComponent(group.id) + '/members/' + encodeURIComponent(group.memberId) + '/location',
    {
      method: 'POST',
      body: {
        lat: lastFix.lat,
        lng: lastFix.lng,
        accuracy: lastFix.accuracy || 0
      }
    }
  ).catch(() => {});
}



function showLock() {
  const screen = $('#lockScreen');
  if (!screen) return;

  document.body.classList.add('locked');
  screen.hidden = false;
  screen.classList.toggle('is-demo', !!(locked && locked.demo));
  screen.classList.toggle('is-screen-off', !(locked && locked.demo));

  $('#sosBtn').hidden = !state.settings.emergency;

  tryFullscreen();
  acquireWakeLock();
  updateLockUI();
}

function hideLock() {
  const screen = $('#lockScreen');
  if (!screen) return;
  screen.hidden = true;
  screen.classList.remove('is-demo');
  screen.classList.remove('is-screen-off');
  document.body.classList.remove('locked');
  releaseWakeLock();
  document.title = 'AlanKilit';
  maybePromptBirthDate();
}

function updateLockUI() {
  if (!locked) return;
  const place = resolveLockPlace(locked);
  const label = lockLabel(locked) || 'Kilit';

  const now = new Date();
  const clock = $('#lockClock');
  const date = $('#lockDate');
  if (clock) clock.textContent = now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  if (date) date.textContent = now.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' });

  const badge = $('.lock-badge');
  if (badge) {
    badge.innerHTML = locked.demo
      ? '<i aria-hidden="true"></i> TEST KİLİDİ'
      : (locked.source === 'group' || locked.source === 'remote')
        ? '<i aria-hidden="true"></i> GRUP KİLİDİ'
        : '<i aria-hidden="true"></i> KİLİT AKTİF';
  }

  const placeEl = $('#lockPlace');
  if (placeEl) placeEl.textContent = locked.demo ? label + ' (test)' : label;

  const countEl = $('#lockCount');
  if (countEl) {
    countEl.textContent = locked.demo || locked.source !== 'personal' || !place
      ? '—'
      : String(place.count || 0);
  }
  const countLabel = $('#lockCountLabel');
  if (countLabel) countLabel.textContent = locked.source === 'personal' ? 'kez kapandı' : 'grup kilidi';

  const elapsed = $('#lockElapsed');
  const elapsedLabel = $('#lockElapsedLabel');
  if (locked.autoUnlockAt) {
    if (elapsed) elapsed.textContent = fmtClock(Math.max(0, locked.autoUnlockAt - Date.now()));
    if (elapsedLabel) elapsedLabel.textContent = 'molaya kalan';
  } else {
    if (elapsed) elapsed.textContent = fmtClock(Date.now() - locked.startedAt);
    if (elapsedLabel) elapsedLabel.textContent = 'geçen süre';
  }

  let remaining = null;
  if (lastFix && place && place.lat != null) {
    const d = distanceM(lastFix, place);
    remaining = Math.max(0, d - place.radius);
  }
  const distEl = $('#lockDist');
  if (distEl) distEl.textContent = remaining == null ? '—' : fmtDistance(remaining);
  const distLabel = $('#lockDistLabel');
  if (distLabel) distLabel.textContent = remaining == null ? 'uzaklık' : 'çıkışa';

  const desc = $('#lockDesc');
  if (desc) {
    const breakText = locked.autoUnlockAt
      ? ' ' + Math.max(1, Math.ceil((locked.autoUnlockAt - Date.now()) / 60000)) + ' dk sonra molaya çıkacak.'
      : '';
    if (locked.source === 'group') {
      desc.textContent = 'Grup alanından çıkınca ekran kendiliğinden açılacak. Yönetici de uzaktan açabilir.' + breakText;
    } else if (locked.source === 'remote') {
      desc.textContent = 'Bu kilidi yönetici açabilir. Acil çıkış (•••) kullanılabilir.';
    } else {
      desc.textContent = 'Bu alandan çıkınca ekran kendiliğinden açılacak.' + breakText;
    }
  }

  const live = $('#lockLive');
  const liveText = $('#lockLiveText');
  const waiting = !lastFix || geoState !== 'active';

  live.classList.toggle('is-waiting', waiting);
  if (locked.source === 'remote') {
    liveText.textContent = 'Yönetici kilitledi — açmasını bekle';
  } else if (locked.source === 'group' && geoState === 'denied') {
    liveText.textContent = 'Konum izni yok — acil çıkış (•••) kullanılabilir';
  } else if (waiting) {
    liveText.textContent = 'Konum aranıyor…';
  } else if (locked.source === 'group') {
    liveText.textContent = 'Grup alanı izleniyor — çıkınca açılır';
  } else {
    liveText.textContent = 'Konum izleniyor — alandan çıkınca açılır';
  }

  if (locked.demo) {
    document.title = 'Test kilidi — 5 sn';
  } else if (locked.source === 'group' || locked.source === 'remote') {
    document.title = '⛔ ' + label + ' — grup kilidi';
  } else {
    document.title = '⛔ ' + label + ' — kilitli';
  }
}

let wakeLockRequest = null;

async function acquireWakeLock() {
  try {
    if (!('wakeLock' in navigator) || !locked) return;
    if (wakeLock && !wakeLock.released) return;
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => { wakeLock = null; });
  } catch {
    wakeLock = null;
  }
}

function releaseWakeLock() {
  if (wakeLock) {
    try { wakeLock.release(); } catch {}
    wakeLock = null;
  }
  if (wakeLockRequest) {
    clearTimeout(wakeLockRequest);
    wakeLockRequest = null;
  }
}

async function tryFullscreen() {
  if (document.fullscreenElement) return;
  const el = document.documentElement;
  const fn = el.requestFullscreen || el.webkitRequestFullscreen;
  if (!fn) return;
  try {
    await fn.call(el, { navigationUI: 'hide' });
  } catch {
    try { await fn.call(el); } catch {}
  }
}

function exitFullscreen() {
  if (document.fullscreenElement && document.exitFullscreen) {
    document.exitFullscreen().catch(() => {});
  }
}

function playAlarm() {
  if (!state.settings.sound) return;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    audioCtx = audioCtx || new Ctx();
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});

    const t0 = audioCtx.currentTime + 0.02;
    [0, 0.34, 0.68].forEach((offset, i) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(i === 2 ? 440 : 660, t0 + offset);
      gain.gain.setValueAtTime(0.0001, t0 + offset);
      gain.gain.exponentialRampToValueAtTime(0.16, t0 + offset + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + offset + 0.28);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t0 + offset);
      osc.stop(t0 + offset + 0.3);
    });
  } catch {}
}

function vibrate() {
  if (!state.settings.vibrate) return;
  try {
    if (navigator.vibrate) navigator.vibrate([260, 120, 260, 120, 520]);
  } catch {}
}

function notifyLock(place) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  const options = {
    body: place.name + ' alanındasın. Alandan çıkınca kilit açılacak.',
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    tag: 'nerede-kapansin',
    renotify: true,
    requireInteraction: true
  };

  try {
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready
        .then((registration) => registration.showNotification('Ekran kilitlendi', options))
        .catch(() => {});
    } else {
      new Notification('Ekran kilitlendi', options);
    }
  } catch {}
}

/* ---------------- görünümler ---------------- */

function route() {
  const match = location.hash.match(/^#\/yer\/([^/]+)$/);
  selectedId = match ? decodeURIComponent(match[1]) : null;

  if (selectedId && !getPlace(selectedId)) {
    selectedId = null;
    try { history.replaceState(null, '', '#/'); } catch { location.hash = '#/'; }
  }

  currentView = selectedId ? 'place' : 'home';
  applyView();
}

function applyView() {
  const home = $('#view-home');
  const place = $('#view-place');
  if (!home || !place) return;

  home.hidden = currentView !== 'home';
  place.hidden = currentView !== 'place';
  $('#backBtn').hidden = currentView !== 'place';
  document.body.classList.toggle('in-place', currentView === 'place');

  if (currentView === 'place') {
    renderPlace();
  } else {
    renderList();
  }

  syncGeoUI();
  if (locked) updateLockUI();

  window.scrollTo({ top: 0, behavior: 'auto' });
}

function openPlace(id) {
  const place = getPlace(id);
  if (!place) return;

  selectedId = id;
  const target = '#/yer/' + encodeURIComponent(id);

  if (location.hash !== target) {
    location.hash = target;
  } else {
    currentView = 'place';
    applyView();
  }
}

function goHome() {
  if (location.hash !== '#/') {
    location.hash = '#/';
  } else {
    selectedId = null;
    currentView = 'home';
    applyView();
  }
}

function renderAll() {
  renderList();
  syncGeoUI();
  if (currentView === 'place') renderPlace();
  if (locked) updateLockUI();
}

function syncAll() {
  syncGeoUI();
  renderList();
  if (currentView === 'place') renderPlace();
  if (locked) updateLockUI();
}

function renderList() {
  const list = $('#placeList');
  const empty = $('#emptyState');
  const count = $('#placeCount');
  if (!list || !empty || !count) return;

  count.textContent = String(state.places.length);
  empty.hidden = state.places.length > 0;

  const totalCount = state.places.reduce((sum, p) => sum + (p.count || 0), 0);
  const totalTime = state.places.reduce((sum, p) => sum + (p.totalMs || 0), 0);
  const totalToday = state.places.reduce((sum, p) => sum + todayCount(p), 0);
  const overview = $('#overview');

  if (overview) {
    overview.hidden = state.places.length === 0;
    $('#sumCount').textContent = String(totalCount);
    $('#sumTime').textContent = totalTime > 0 ? fmtDuration(totalTime) : '0 dk';
    $('#sumToday').textContent = String(totalToday);
  }

  list.innerHTML = state.places.map((p) => {
    let meta;
    let stateClass = '';
    const breakLeft = p.breakUntil && p.breakUntil > Date.now() ? p.breakUntil - Date.now() : 0;

    if (breakLeft > 0) {
      meta = 'molada · ' + Math.max(1, Math.ceil(breakLeft / 60000)) + ' dk sonra tekrar kilitlenecek';
      stateClass = 'state-break';
    } else if (locked && locked.source === 'personal' && locked.placeId === p.id) {
      meta = 'şu an kilitli';
      stateClass = 'state-locked';
    } else if (p.lat == null || p.lng == null) {
      meta = 'konum ayarlanmadı';
    } else if (lastFix) {
      const d = distanceM(lastFix, p);
      if (d <= p.radius) {
        meta = 'alanın içinde';
        stateClass = 'state-inside';
      } else {
        meta = 'alanın dışında · ' + fmtDistance(d);
      }
    } else {
      meta = 'konum bekleniyor';
    }

    const counter = p.count ? ' · ' + p.count + ' kez kapandı' : '';

    return '<button class="place-item" type="button" data-id="' + esc(p.id) + '">' +
      '<span class="place-icon" style="--c:' + esc(p.color) + '">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11z"/><circle cx="12" cy="10" r="2.4"/></svg>' +
      '</span>' +
      '<span class="place-copy">' +
        '<strong>' + esc(p.name) + '</strong>' +
        '<span class="' + stateClass + '">' + meta + counter + '</span>' +
      '</span>' +
      '<span class="place-chevron" aria-hidden="true">' +
        '<svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>' +
      '</span>' +
    '</button>';
  }).join('');
}

function renderPlace() {
  const p = getPlace(selectedId);
  if (!p) return;

  $('#placeTitle').textContent = p.name;

  const bits = [];
  if (p.count) bits.push(p.count + ' kez kapandı');
  else bits.push('henüz kapanmadı');
  bits.push(p.radius + ' m yarıçap');
  if (!isAdult()) bits.push('18 yaş altı · çıkınca açılır');
  else if (p.lockMinutes > 0) bits.push(p.lockMinutes + ' dk kilit · ' + (p.breakMinutes || 0) + ' dk mola');
  else bits.push('çıkınca açılır');
  if (!lastFix) bits.push('konum bekleniyor');
  $('#placeSub').textContent = bits.join(' · ');

  $('#statCount').textContent = String(p.count || 0);
  $('#statTime').textContent = p.totalMs > 0 ? fmtDuration(p.totalMs) : '0 dk';
  $('#statLast').textContent = p.lastAt ? fmtWhen(p.lastAt) : '—';

  renderHistory(p);
  updatePlaceLive();
}

function renderHistory(p) {
  const list = $('#historyList');
  const empty = $('#historyEmpty');
  const today = $('#historyToday');
  if (!list || !empty) return;

  const items = (p.history || []).slice(0, 8);
  if (today) today.textContent = 'bugün ' + todayCount(p);

  list.hidden = items.length === 0;
  empty.hidden = items.length > 0;

  list.innerHTML = items.map((entry) => {
    const date = new Date(entry.at);
    const time = date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    const when = isToday(entry.at)
      ? 'Bugün ' + time
      : date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }) + ' · ' + time;
    const how = entry.how === 'emergency' ? 'acil çıkış' : (entry.how === 'break' ? 'mola' : '');

    return '<li>' +
      '<span class="history-when">' + esc(when) + '</span>' +
      '<span class="history-how">' + esc(how) + '</span>' +
      '<span class="history-dur">' + esc(fmtDuration(entry.ms)) + '</span>' +
    '</li>';
  }).join('');
}

function updatePlaceLive() {
  const p = getPlace(selectedId);
  if (!p) return;

  const banner = $('#statusBanner');
  const title = $('#statusTitle');
  const text = $('#statusText');
  const dist = $('#statusDist');
  if (!banner) return;

  const d = lastFix && p.lat != null ? distanceM(lastFix, p) : null;
  const isLocked = !!(locked && locked.source === 'personal' && locked.placeId === p.id);
  const breakLeft = p.breakUntil && p.breakUntil > Date.now() ? p.breakUntil - Date.now() : 0;
  const accuracy = lastFix && Number.isFinite(lastFix.accuracy)
    ? Math.round(lastFix.accuracy)
    : null;

  let mode = 'wait';
  let headline = 'Konum bekleniyor';
  let detail = 'Konum izni verdiğinde alanı izlemeye başlarım.';
  let distanceLabel = '';

  if (p.lat == null || p.lng == null) {
    mode = 'wait';
    headline = 'Konum ayarlanmadı';
    detail = 'Bu yerin merkezini belirlemek için “Konumu buraya ayarla” düğmesini kullan.';
  } else if (!lastFix) {
    mode = 'wait';
    headline = 'Konum bekleniyor';
    detail = geoState === 'denied'
      ? 'Konum izni kapalı. Tarayıcı ayarlarından bu siteye izin ver.'
      : 'Konum alınınca alanı izlemeye başlarım.';
  } else if (breakLeft > 0) {
    mode = 'break';
    headline = 'Moladasın';
    detail = Math.max(1, Math.ceil(breakLeft / 60000)) + ' dk sonra tekrar kilitlenecek. Alandan çıkarsan mola iptal olur.';
    distanceLabel = 'mola';
  } else if (isLocked) {
    mode = 'locked';
    headline = 'Kilit aktif';
    detail = !isAdult()
      ? '18 yaş altı: alanın içindesin, ekran kapalı. Alandan çıkınca kendiliğinden açılır.'
      : (locked.autoUnlockAt
        ? Math.max(1, Math.ceil((locked.autoUnlockAt - Date.now()) / 60000)) + ' dk sonra molaya çıkacak. Alandan çıkınca kendiliğinden açılır.'
        : 'Alanın içindesin, ekran kapalı. Alandan çıkınca kendiliğinden açılır.');
    distanceLabel = 'içinde';
  } else if (d <= p.radius) {
    mode = 'inside';
    headline = 'Alanın içindesin';
    detail = p.knownInside
      ? 'Kilit, buradan çıkıp yeniden girdiğinde kurulacak.'
      : 'Kilit birazdan devreye girecek.';
    distanceLabel = accuracy != null ? '±' + accuracy + ' m' : '';
  } else {
    mode = 'outside';
    headline = 'Alanın dışındasın';
    detail = 'Bu alana girdiğinde ekran kilitlenecek.';
    distanceLabel = 'girişe ' + fmtDistance(d - p.radius);
  }

  if (accuracy != null && accuracy > 150) {
    detail += ' Konum hassasiyeti düşük (±' + accuracy + ' m).';
  }
  if (lastFix && Date.now() - lastFix.at > 90000) {
    detail += ' Konum eski; üstteki konum düğmesine dokunarak yenile.';
  }

  banner.dataset.state = mode;
  title.textContent = headline;
  text.textContent = detail;
  dist.textContent = distanceLabel;

  // radar
  const me = $('#radarMe');
  if (!me) return;

  if (d == null || p.lat == null) {
    me.hidden = true;
  } else {
    const angle = angleFor(p.id);
    const normDist = clamp(d / p.radius, 0, 1.14);
    const radiusPct = 42;

    me.hidden = false;
    me.style.left = (50 + Math.cos(angle) * radiusPct * normDist) + '%';
    me.style.top = (50 + Math.sin(angle) * radiusPct * normDist) + '%';
    me.classList.toggle('is-inside', d <= p.radius && !isLocked && breakLeft === 0);
    me.classList.toggle('is-locked', isLocked);
  }
}

/* ---------------- ana sayfa ekleme ---------------- */

async function onAddSubmit(event) {
  event.preventDefault();
  if (busy) return;

  const input = $('#placeName');
  const name = input.value.trim().replace(/\s+/g, ' ');
  const button = event.target.querySelector('button[type="submit"]');

  if (!name) {
    input.focus();
    toast('Önce bir yer adı yaz', true);
    return;
  }

  const existing = state.places.find((p) => norm(p.name) === norm(name));
  if (existing) {
    input.value = '';
    openPlace(existing.id);
    toast('“' + existing.name + '” zaten kayıtlı');
    return;
  }

  busy = true;
  setBusy(button, true, 'Konum alınıyor…');

  try {
    const fix = await ensurePosition(20000, true);
    if (!fix) {
      toast('Konum alınamadı. Konum iznini kontrol et.', true);
      return;
    }

    const place = createPlace(name, fix);
    input.value = '';
    openPlace(place.id);
    toast('Kilit kuruldu: ' + place.name);
  } finally {
    busy = false;
    setBusy(button, false);
  }
}

function setBusy(button, isBusy, label) {
  if (!button) return;
  if (isBusy) {
    button.dataset.html = button.innerHTML;
    button.disabled = true;
    button.textContent = label || 'Bekle…';
  } else {
    button.disabled = false;
    if (button.dataset.html) {
      button.innerHTML = button.dataset.html;
      delete button.dataset.html;
    }
  }
}

function createPlace(name, coords, options = {}) {
  const defaults = roleDefaults(state.role);
  const place = {
    id: uid(),
    name: name.slice(0, 40),
    lat: Number(coords.lat),
    lng: Number(coords.lng),
    radius: radiusValue(options.radius),
    color: PALETTE[state.places.length % PALETTE.length],
    count: 0,
    totalMs: 0,
    lastAt: null,
    inside: false,
    knownInside: false,
    lockMinutes: minutesValue(options.lockMinutes, defaults.lockMinutes, 240),
    breakMinutes: minutesValue(options.breakMinutes, defaults.breakMinutes, 60),
    breakUntil: 0,
    enabled: true,
    createdAt: Date.now()
  };

  if (lastFix && Number.isFinite(place.lat) && Number.isFinite(place.lng)) {
    const d = distanceM(lastFix, place);
    place.inside = d <= place.radius;
    place.knownInside = place.inside;
  }

  state.places.unshift(place);
  save();
  renderList();
  return place;
}

/* ---------------- ayarlar ---------------- */

function openSheet() {
  const sheet = $('#settingsSheet');
  if (!sheet || !sheet.hidden) return;

  sheet.hidden = false;
  document.body.classList.add('sheet-open');
  syncSettings();
}

function closeSheet() {
  const sheet = $('#settingsSheet');
  if (!sheet) return;
  sheet.hidden = true;
  document.body.classList.remove('sheet-open');
}

function syncSettings() {
  $('#optSound').checked = !!state.settings.sound;
  $('#optVibrate').checked = !!state.settings.vibrate;
  $('#optEmergency').checked = !!state.settings.emergency;

  if ($('#optPowerSave')) $('#optPowerSave').checked = state.settings.powerSave !== false;

  const profileName = $('#profileName');
  const profilePhone = $('#profilePhone');
  if (profileName) profileName.value = state.profile.name || '';
  if (profilePhone) profilePhone.value = state.profile.phone || '';

  const settingsBirth = $('#settingsBirthDate');
  if (settingsBirth) {
    settingsBirth.max = localIsoDate();
    if (document.activeElement !== settingsBirth) settingsBirth.value = state.birthDate || '';
  }
  syncAgeModeUI();
  updateAgeSummary();

  renderGroupSummary();

  const defaults = roleDefaults(state.role);
  if ($('#newLockMinutes') && !$('#newLockMinutes').value) $('#newLockMinutes').value = defaults.lockMinutes;
  if ($('#newBreakMinutes') && !$('#newBreakMinutes').value) $('#newBreakMinutes').value = defaults.breakMinutes;
  if ($('#newRadius') && !$('#newRadius').value) $('#newRadius').value = DEFAULT_RADIUS;

  const p = selectedId ? getPlace(selectedId) : null;
  const editBlock = $('#editPlaceBlock');
  editBlock.hidden = !p;

  if (p) {
    $('#editName').value = p.name;
    $('#editLockMinutes').value = p.lockMinutes || 0;
    $('#editBreakMinutes').value = p.breakMinutes || 0;
    $('#editRadius').value = p.radius;
  }
}

async function saveProfile() {
  const name = $('#profileName').value.trim().replace(/\s+/g, ' ');
  const phone = phoneDigits($('#profilePhone').value);

  if (!name) {
    toast('Adın gerekli', true);
    $('#profileName').focus();
    return;
  }
  if (phone && !validPhone(phone)) {
    toast('Geçerli bir telefon numarası gir', true);
    $('#profilePhone').focus();
    return;
  }

  state.profile = normalizeProfile({ name, phone });
  save();
  toast('Profil kaydedildi');

  if (state.group && state.group.role === 'admin') {
    try {
      const data = await groupApi('/api/groups/' + encodeURIComponent(state.group.id) + '/profile', {
        method: 'POST',
        body: { adminName: name, adminPhone: phone }
      });
      if (data.group) applyGroupPayload({ group: data.group, role: 'admin' });
    } catch (err) {
      toast(err.message || 'Grup profili güncellenemedi', true);
    }
  }
}

function syncRoleUI() {
  const chip = $('#roleChip');
  const age = currentAge();
  if (chip) {
    if (state.birthDate || state.role) {
      chip.textContent = roleLabel(state.role) + (age != null ? ' · ' + age : '');
    } else {
      chip.textContent = 'Yaş seç';
    }
    chip.dataset.role = state.role || '';
    chip.classList.toggle('is-empty', !state.birthDate && !state.role);
    chip.title = 'Doğum tarihini düzenle';
  }
  syncAgeModeUI();
  updateAgeSummary();
}

function syncAgeModeUI() {
  const adult = isAdult();
  ['#newScheduleFields', '#editScheduleFields', '#groupPlaceScheduleFields'].forEach((sel) => {
    const el = $(sel);
    if (el) el.hidden = !adult;
  });

  const newHint = $('#newPlaceHint');
  if (newHint) {
    newHint.textContent = adult
      ? 'Konum otomatik alınır. Kilit süresi 0 ise alandan çıkınca açılır. Mola 0 ise süre dolunca o ziyaret için tekrar kilitlenmez.'
      : '18 yaş altı: alana girince kilitlenir, alandan çıkınca açılır. Kilit süresi ve mola kullanılmaz.';
  }

  const editHint = $('#editScheduleHint');
  if (editHint) {
    editHint.hidden = adult;
    editHint.textContent = '18 yaş altı: süre yerine alandan çıkınca açılır.';
  }

  const groupHint = $('#groupPlaceHint');
  if (groupHint) {
    groupHint.textContent = adult
      ? 'Kilit süresi 0 ise üye alandan çıkınca açılır. Mola 0 ise süre dolunca o ziyaret için tekrar kilitlenmez.'
      : '18 yaş altı üyeler için süre kullanılmaz; alana girince kilitlenir, çıkınca açılır.';
  }
}

function updateAgeSummary() {
  const summary = $('#ageSummary');
  if (!summary) return;
  summary.textContent = state.birthDate ? ageModeText(currentAge()) : 'Doğum tarihi girilmedi.';
}

function updateBirthPreview() {
  const input = $('#birthDateInput');
  const preview = $('#birthPreview');
  if (!input || !preview) return;
  const age = ageFromBirthDate(input.value);
  preview.textContent = age == null
    ? '18 yaş altı: alana girince kilitlenir, çıkınca açılır. 18 yaş ve üzeri: süreli kilit ve mola döngüsü.'
    : ageModeText(age);
}

function openBirthDialog() {
  const dialog = $('#birthDialog');
  if (!dialog) return;
  const input = $('#birthDateInput');
  if (input) {
    input.max = localIsoDate();
    input.value = state.birthDate || '';
  }
  const error = $('#birthError');
  if (error) error.hidden = true;
  const cancel = $('#birthCancel');
  if (cancel) cancel.hidden = !state.birthDate;
  updateBirthPreview();
  if (!dialog.open) dialog.showModal();
  setTimeout(() => input && input.focus(), 80);
}

function maybePromptBirthDate() {
  if (state.birthDate || birthPromptPending || locked) return;
  birthPromptPending = true;
  setTimeout(openBirthDialog, 300);
}

function applyAgeScheduleToActiveLock() {
  const adult = isAdult();

  if (!adult) {
    let changed = false;
    for (const place of state.places) {
      if (place.breakUntil) {
        place.breakUntil = 0;
        place.knownInside = false;
        changed = true;
      }
    }
    if (state.group && state.group.override && !state.group.override.untilLeave) {
      state.group.override = null;
      changed = true;
    }
    if (changed) save();
  }

  if (!locked || locked.demo || locked.source === 'remote') return;
  const place = resolveLockPlace(locked);
  const lockMinutes = adult && place ? minutesValue(place.lockMinutes, 0, 240) : 0;
  const breakMinutes = adult && place ? minutesValue(place.breakMinutes, 0, 60) : 0;
  locked.lockMinutes = lockMinutes;
  locked.breakMinutes = breakMinutes;
  locked.autoUnlockAt = adult && lockMinutes > 0 ? locked.startedAt + lockMinutes * 60000 : 0;
  state.activeLock = locked;
  save();
  updateLockUI();
}

function refreshAgeRole() {
  if (!state.birthDate) return;
  const next = roleFromBirthDate(state.birthDate);
  if (!next || next === state.role) return;
  state.role = next;
  save();
  syncRoleUI();
  syncSettings();
  applyAgeScheduleToActiveLock();
  toast(next === 'adult'
    ? '18 yaşına geldin — süreli kilit ve mola açıldı'
    : '18 yaş altı — alandan çıkınca açılan mod');
}

function saveBirthDate(value) {
  const normalized = normalizeBirthDate(value);
  const age = ageFromBirthDate(normalized);
  const dialog = $('#birthDialog');
  const error = $('#birthError');

  if (!normalized || age == null || age < 0 || age > 120) {
    if (dialog && dialog.open && error) {
      error.textContent = 'Geçerli bir doğum tarihi gir (gün / ay / yıl).';
      error.hidden = false;
    } else {
      toast('Geçerli bir doğum tarihi gir', true);
    }
    return false;
  }

  if (error) error.hidden = true;
  const role = roleFromBirthDate(normalized);
  const changedRole = state.role !== role;
  state.birthDate = normalized;
  state.role = role;
  save();
  syncRoleUI();
  syncSettings();
  applyAgeScheduleToActiveLock();

  if (dialog && dialog.open) dialog.close();

  if (birthPromptPending) {
    birthPromptPending = false;
    beginGeo();
    handleStartupLink();
  }

  if (changedRole) {
    toast(role === 'student'
      ? '18 yaş altı: alana girince kilitlenir, çıkınca açılır'
      : 'Yetişkin: süreli kilit ve mola döngüsü açık');
  } else {
    toast('Doğum tarihi kaydedildi');
  }
  return true;
}

function saveBirthDateFromDialog() {
  saveBirthDate($('#birthDateInput').value);
}

function saveBirthDateFromSettings() {
  saveBirthDate($('#settingsBirthDate').value);
}

function handleStartupLink() {
  if (startupLinkHandled) return;
  startupLinkHandled = true;
  const params = new URLSearchParams(location.search);
  const inviteToken = params.get('davet');
  const groupCode = params.get('grup');
  if (inviteToken) {
    openInviteAcceptDialog(inviteToken);
  } else if (groupCode) {
    openJoinGroupDialog(groupCode);
    params.delete('grup');
    try {
      const query = params.toString();
      history.replaceState(null, '', location.pathname + (query ? '?' + query : '') + location.hash);
    } catch {}
  }
}

function renderGroupSummary() {
  const box = $('#groupSummary');
  if (!box) return;

  if (state.pendingJoin) {
    box.innerHTML =
      '<div class="group-pending">' +
        '<strong>Katılma isteği gönderildi</strong>' +
        '<p>' + esc(state.pendingJoin.groupName) + ' · yönetici onayı bekleniyor.</p>' +
        '<button class="ghost small" type="button" data-group-action="cancel-join">İsteği iptal et</button>' +
      '</div>';
    return;
  }

  const group = state.group;
  if (!group) {
    const canCreate = isAdult();
    box.innerHTML =
      '<p class="fine group-intro">' +
        (canCreate
          ? 'Grup oluştur; üyelerin telefon numaralarını ekle, istediğin yerde otomatik kilit kur veya cihazları uzaktan kilitle.'
          : '18 yaş altı hesaplar grup oluşturamaz. Bir yönetici davet ederse gruba katılabilirsin.') +
      '</p>' +
      '<div class="group-actions">' +
        (canCreate ? '<button class="primary small" type="button" data-group-action="create">Grup oluştur</button>' : '') +
        '<button class="ghost small" type="button" data-group-action="join">Gruba katıl</button>' +
      '</div>';
    return;
  }

  const isAdmin = group.role === 'admin';
  const memberCount = (group.members || []).length;

  box.innerHTML =
    '<div class="group-card">' +
      '<div class="group-head">' +
        '<div class="group-head-copy">' +
          '<span class="group-role ' + (isAdmin ? 'is-admin' : 'is-member') + '">' + (isAdmin ? 'YÖNETİCİ' : 'ÜYE') + '</span>' +
          '<strong>' + esc(group.name) + '</strong>' +
          '<small>' + memberCount + ' üye · ' + esc(group.adminName) + '</small>' +
        '</div>' +
        '<button class="ghost small" type="button" data-group-action="hub">Grup yönetimi</button>' +
      '</div>' +
      (isAdmin && group.code
        ? '<div class="group-code-line"><span>Grup kodu</span><b>' + esc(group.code) + '</b>' +
          '<button class="ghost small" type="button" data-group-action="copy-code">Kopyala</button></div>'
        : '') +
    '</div>';
}

function memberRowHtml(member, group, isAdmin) {
  const online = member.lastSeen && Date.now() - member.lastSeen < 90000;
  const placeText = member.placeName ? ' · ' + member.placeName : '';
  const locationText = isAdmin ? memberLocationText(member, group) : '';

  const mapButton = isAdmin && member.location
    ? '<button class="ghost small" type="button" data-group-action="map" data-id="' + esc(member.id) + '">Harita</button>'
    : '';

  const adminActions = isAdmin
    ? '<button class="ghost small" type="button" data-group-action="lock-member" data-id="' + esc(member.id) + '">Kilitle</button>' +
      '<button class="ghost small" type="button" data-group-action="unlock-member" data-id="' + esc(member.id) + '">Aç</button>' +
      '<button class="ghost small danger-text" type="button" data-group-action="remove-member" data-id="' + esc(member.id) + '">Çıkar</button>'
    : '';

  return '<div class="member-row">' +
    '<span class="member-dot ' + (online ? 'is-online' : '') + '" aria-hidden="true"></span>' +
    '<div class="member-info">' +
      '<strong>' + esc(member.name) + '</strong>' +
      '<small>' + esc(fmtPhone(member.phone) || 'telefon yok') + ' · ' +
        (online ? 'çevrimiçi' : 'son görülme ' + esc(fmtWhen(member.lastSeen))) + '</small>' +
      '<small class="' + (member.locked ? 'is-locked' : '') + '">' +
        (member.locked ? 'kilitli' : 'açık') + esc(placeText) +
        (locationText ? ' · ' + esc(locationText) : '') +
      '</small>' +
    '</div>' +
    '<div class="member-actions">' + mapButton + adminActions + '</div>' +
  '</div>';
}

function renderGroupHub() {
  const dialog = $('#groupHubDialog');
  const box = $('#groupHubContent');
  if (!dialog || !box) return;

  if (!state.group) {
    if (dialog.open) dialog.close();
    box.innerHTML = '';
    return;
  }
  if (!dialog.open) return;

  const group = state.group;
  const isAdmin = group.role === 'admin';
  const members = group.members || [];
  const pending = (group.pending || []);
  const invites = (group.invites || []).filter((i) => !i.acceptedAt);
  const acceptedInvites = (group.invites || []).filter((i) => i.acceptedAt);
  const places = group.places || [];
  const events = (group.events || []).slice(0, 24);

  const title = $('#groupHubTitle');
  if (title) title.textContent = group.name;

  const memberRows = members.length
    ? members.map((member) => memberRowHtml(member, group, isAdmin)).join('')
    : '<p class="group-empty">Henüz üye yok.</p>';

  const pendingRows = pending.length
    ? pending.map((request) =>
        '<div class="invite-row">' +
          '<div><strong>' + esc(request.name) + '</strong><small>' +
            esc(fmtPhone(request.phone) || 'telefon yok') + ' · ' + esc(fmtWhen(request.at)) +
          '</small></div>' +
          '<div class="invite-actions">' +
            '<button class="primary small" type="button" data-group-action="approve" data-id="' + esc(request.id) + '">Onayla</button>' +
            '<button class="ghost small" type="button" data-group-action="reject" data-id="' + esc(request.id) + '">Reddet</button>' +
          '</div>' +
        '</div>').join('')
    : '<p class="group-empty">Bekleyen katılma isteği yok.</p>';

  const inviteRows = invites.length
    ? invites.map((invite) =>
        '<div class="invite-row">' +
          '<div><strong>' + esc(fmtPhone(invite.phone)) + '</strong><small>' +
            esc(invite.name || 'Davet') + ' · ' + esc(fmtWhen(invite.at)) +
          '</small></div>' +
          '<div class="invite-actions">' +
            '<button class="ghost small" type="button" data-group-action="send-invite" data-id="' + esc(invite.id) + '">SMS / Paylaş</button>' +
            '<button class="ghost small" type="button" data-group-action="copy-invite" data-id="' + esc(invite.id) + '">Bağlantı</button>' +
            '<button class="ghost small danger-text" type="button" data-group-action="remove-invite" data-id="' + esc(invite.id) + '">Sil</button>' +
          '</div>' +
        '</div>').join('')
    : '<p class="group-empty">Bekleyen davet yok.</p>';

  const placeRows = places.length
    ? places.map((place) => {
        const timing = isAdult() && place.lockMinutes > 0
          ? place.lockMinutes + ' dk kilit · ' + (place.breakMinutes || 0) + ' dk mola'
          : 'çıkınca açılır';
        return '<div class="group-place-row">' +
          '<div><strong>' + esc(place.name) + '</strong><small>' +
            esc(timing) + ' · konum kayıtlı' +
          '</small></div>' +
          (isAdmin
            ? '<button class="ghost small danger-text" type="button" data-group-action="remove-group-place" data-id="' + esc(place.id) + '">Sil</button>'
            : '') +
        '</div>';
      }).join('')
    : '<p class="group-empty">Grup yeri yok. Yönetici yer eklediğinde üyeler oraya girince otomatik kilitlenir.</p>';

  const eventRows = events.length
    ? '<ul class="event-list">' + events.map((event) =>
        '<li><span>' + esc(fmtWhen(event.at)) + '</span>' + esc(event.text) + '</li>').join('') + '</ul>'
    : '<p class="group-empty">Henüz hareket yok.</p>';

  box.innerHTML =
    '<div class="group-hero">' +
      '<div class="group-hero-top">' +
        '<span class="group-role ' + (isAdmin ? 'is-admin' : 'is-member') + '">' + (isAdmin ? 'YÖNETİCİ' : 'ÜYE') + '</span>' +
        (group.code ? '<span class="group-code-chip">KOD <b>' + esc(group.code) + '</b></span>' : '') +
      '</div>' +
      '<p class="group-hero-line"><b>' + esc(group.adminName) + '</b>' +
        (group.adminPhone ? ' · ' + esc(fmtPhone(group.adminPhone)) : '') + '</p>' +
      '<p class="fine">' +
        (isAdmin
          ? 'Üyelerin konumunu ve kilit durumunu görebilirsin. Konum yalnızca uygulama açıkken ve üye izin verdiğinde güncellenir.'
          : 'Yönetici, kilit durumunu ve izin verdiğin sürece konumunu görebilir.') +
      '</p>' +
    '</div>' +

    '<div class="group-actions">' +
      (isAdmin
        ? '<button class="primary small" type="button" data-group-action="invite">Telefonla davet et</button>' +
          '<button class="ghost small" type="button" data-group-action="add-group-place">Grup yeri ekle</button>' +
          '<button class="ghost small" type="button" data-group-action="lock-all">Hepsini kilitle</button>' +
          '<button class="ghost small" type="button" data-group-action="unlock-all">Hepsini aç</button>'
        : '') +
      '<button class="ghost small" type="button" data-group-action="refresh">Yenile</button>' +
    '</div>' +

    (isAdmin
      ? '<div class="group-section">' +
          '<h4>Katılma istekleri' + (pending.length ? ' <span>' + pending.length + '</span>' : '') + '</h4>' +
          pendingRows +
        '</div>'
      : '') +

    '<div class="group-section">' +
      '<h4>Üyeler <span>' + members.length + '</span></h4>' +
      memberRows +
    '</div>' +

    (!isAdmin
      ? '<label class="switch-row group-location-switch">' +
          '<span><b>Konumumu yöneticiyle paylaş</b><small>Kapalıysa yönetici son konumunu göremez. Kilit ve durum bilgisi paylaşılmaya devam eder.</small></span>' +
          '<input type="checkbox" id="groupShareLocation"' + (group.shareLocation !== false ? ' checked' : '') + '>' +
          '<i aria-hidden="true"></i>' +
        '</label>'
      : '') +

    '<div class="group-section">' +
      '<h4>Grup yerleri <span>' + places.length + '</span></h4>' +
      placeRows +
    '</div>' +

    (isAdmin
      ? '<div class="group-section">' +
          '<h4>Davetler' + (invites.length ? ' <span>' + invites.length + '</span>' : '') + '</h4>' +
          inviteRows +
          (acceptedInvites.length ? '<p class="fine">' + acceptedInvites.length + ' davet kabul edildi.</p>' : '') +
        '</div>'
      : '') +

    (isAdmin
      ? '<div class="group-section">' +
          '<h4>Son hareketler</h4>' +
          eventRows +
        '</div>'
      : '') +

    '<div class="group-section group-danger">' +
      '<button class="danger ghost small" type="button" data-group-action="' + (isAdmin ? 'destroy' : 'leave') + '">' +
        (isAdmin ? 'Grubu dağıt' : 'Gruptan ayrıl') +
      '</button>' +
    '</div>';
}

function openGroupHub() {
  if (!state.group) {
    toast('Önce grup oluştur veya gruba katıl', true);
    return;
  }
  const dialog = $('#groupHubDialog');
  if (!dialog) return;
  if (!dialog.open) dialog.showModal();
  renderGroupHub();
}

function closeGroupHub() {
  const dialog = $('#groupHubDialog');
  if (dialog && dialog.open) dialog.close();
}

function openCreateGroupDialog() {
  if (!isAdult()) {
    toast('Grup oluşturmak için 18 yaş ve üzeri olmalısın', true);
    return;
  }
  if (state.group) {
    toast('Zaten bir gruptasın. Önce mevcut gruptan ayrıl.', true);
    return;
  }
  const dialog = $('#createGroupDialog');
  if (!dialog) return;
  $('#createGroupName').value = '';
  $('#createGroupAdmin').value = state.profile.name || '';
  $('#createGroupPhone').value = state.profile.phone || '';
  $('#createGroupError').hidden = true;
  dialog.showModal();
  setTimeout(() => $('#createGroupName').focus(), 60);
}

async function createGroupFromDialog() {
  const name = $('#createGroupName').value.trim().replace(/\s+/g, ' ');
  const adminName = $('#createGroupAdmin').value.trim().replace(/\s+/g, ' ');
  const phone = phoneDigits($('#createGroupPhone').value);
  const error = $('#createGroupError');
  const button = $('#createGroupConfirm');

  const fail = (message) => {
    error.textContent = message;
    error.hidden = false;
  };
  error.hidden = true;

  if (!isAdult()) return fail('Grup oluşturmak için 18 yaş ve üzeri olmalısın');
  if (!name) return fail('Grup adı gerekli');
  if (!adminName) return fail('Adın gerekli');
  if (!validPhone(phone)) return fail('Geçerli bir telefon numarası gir');

  setBusy(button, true, 'Oluşturuluyor…');
  try {
    const data = await publicApi('/api/groups', {
      method: 'POST',
      body: { name, adminName, adminPhone: phone }
    });
    state.profile = normalizeProfile({ name: adminName, phone });
    state.group = normalizeGroup({
      ...data.group,
      role: 'admin',
      adminToken: data.token,
      memberId: null,
      memberName: adminName,
      shareLocation: true
    });
    state.pendingJoin = null;
    save();
    $('#createGroupDialog').close();
    renderGroupSummary();
    startGroupSync();
    toast('Grup oluşturuldu: ' + name);
    openGroupHub();
  } catch (err) {
    fail(err.message || 'Grup oluşturulamadı');
  } finally {
    setBusy(button, false);
  }
}

function openJoinGroupDialog(code = '') {
  if (state.group) {
    toast('Zaten bir gruptasın. Önce mevcut gruptan ayrıl.', true);
    return;
  }
  const dialog = $('#joinGroupDialog');
  if (!dialog) return;
  $('#joinGroupCode').value = String(code || '').toUpperCase();
  $('#joinGroupName').value = state.profile.name || '';
  $('#joinGroupPhone').value = state.profile.phone || '';
  $('#joinGroupError').hidden = true;
  const status = $('#joinGroupStatus');
  status.hidden = !state.pendingJoin;
  status.textContent = state.pendingJoin
    ? state.pendingJoin.groupName + ' · yönetici onayı bekleniyor…'
    : '';
  const button = $('#joinGroupConfirm');
  button.disabled = Boolean(state.pendingJoin);
  dialog.showModal();
  setTimeout(() => {
    const target = state.pendingJoin ? $('#joinGroupCode') : ($('#joinGroupCode').value ? $('#joinGroupName') : $('#joinGroupCode'));
    if (target) target.focus();
  }, 60);
}

async function sendJoinRequest() {
  const code = $('#joinGroupCode').value.trim().toUpperCase();
  const name = $('#joinGroupName').value.trim().replace(/\s+/g, ' ');
  const phone = phoneDigits($('#joinGroupPhone').value);
  const error = $('#joinGroupError');
  const status = $('#joinGroupStatus');
  const button = $('#joinGroupConfirm');

  const fail = (message) => {
    error.textContent = message;
    error.hidden = false;
  };
  error.hidden = true;

  if (!/^[A-Z0-9]{4,8}$/.test(code)) return fail('Grup kodunu kontrol et');
  if (!name) return fail('Adın gerekli');
  if (!validPhone(phone)) return fail('Geçerli bir telefon numarası gir');

  setBusy(button, true, 'Gönderiliyor…');
  try {
    const data = await publicApi('/api/groups/join-request', {
      method: 'POST',
      body: { code, name, phone, deviceId: getDeviceId() }
    });
    state.profile = normalizeProfile({ name, phone });
    state.pendingJoin = normalizePendingJoin({
      groupId: data.groupId,
      requestId: data.requestId,
      requestToken: data.requestToken,
      groupName: (data.group && data.group.name) || 'Grup',
      name
    });
    save();
    status.hidden = false;
    status.textContent = state.pendingJoin.groupName + ' · yönetici onayı bekleniyor…';
    button.disabled = true;
    renderGroupSummary();
    startJoinPolling();
    toast('Katılma isteği gönderildi. Yönetici onayı bekleniyor.');
  } catch (err) {
    fail(err.message || 'İstek gönderilemedi');
  } finally {
    setBusy(button, false);
    if (state.pendingJoin) button.disabled = true;
  }
}

function startJoinPolling() {
  stopJoinPolling();
  if (!state.pendingJoin) return;
  checkJoinStatus();
  joinPollTimer = setInterval(checkJoinStatus, 4000);
}

function stopJoinPolling() {
  if (joinPollTimer) {
    clearInterval(joinPollTimer);
    joinPollTimer = null;
  }
}

async function checkJoinStatus() {
  const pending = state.pendingJoin;
  if (!pending) {
    stopJoinPolling();
    return;
  }

  try {
    const response = await fetch(
      '/api/join-status/' + encodeURIComponent(pending.groupId) + '/' + encodeURIComponent(pending.requestId),
      { headers: { 'Authorization': 'Bearer ' + pending.requestToken } }
    );
    const data = await response.json().catch(() => ({}));

    if (data.status === 'pending') {
      const status = $('#joinGroupStatus');
      if (status && !status.hidden) status.textContent = pending.groupName + ' · yönetici onayı bekleniyor…';
      return;
    }

    if (data.status === 'rejected') {
      stopJoinPolling();
      state.pendingJoin = null;
      save();
      const error = $('#joinGroupError');
      const status = $('#joinGroupStatus');
      if (status) status.hidden = true;
      if (error) {
        error.textContent = 'Yönetici katılma isteğini reddetti.';
        error.hidden = false;
      }
      const button = $('#joinGroupConfirm');
      if (button) button.disabled = false;
      renderGroupSummary();
      toast('Katılma isteği reddedildi', true);
      return;
    }

    if (data.status === 'approved' && data.group) {
      stopJoinPolling();
      state.group = normalizeGroup({
        ...data.group,
        role: 'member',
        memberId: data.memberId,
        memberToken: data.memberToken,
        memberName: pending.name,
        shareLocation: true
      });
      state.pendingJoin = null;
      save();
      const dialog = $('#joinGroupDialog');
      if (dialog && dialog.open) dialog.close();
      renderGroupSummary();
      startGroupSync();
      toast('Gruba katıldın');
      openGroupHub();
      return;
    }

    if (!response.ok) {
      stopJoinPolling();
      state.pendingJoin = null;
      save();
      renderGroupSummary();
      toast(data.error || 'Katılma isteği bulunamadı', true);
    }
  } catch {
    /* çevrimdışıysa tekrar dene */
  }
}

function cancelPendingJoin() {
  stopJoinPolling();
  state.pendingJoin = null;
  save();
  renderGroupSummary();
  toast('Katılma isteği iptal edildi. Yönetici isteği yine de görebilir.');
}

function openInviteCreateDialog() {
  if (!state.group || state.group.role !== 'admin') return;
  const dialog = $('#inviteCreateDialog');
  if (!dialog) return;
  $('#invitePhones').value = '';
  $('#inviteName').value = '';
  $('#inviteCreateError').hidden = true;
  dialog.showModal();
  setTimeout(() => $('#invitePhones').focus(), 60);
}

async function createInvitesFromDialog() {
  if (!state.group || state.group.role !== 'admin') return;
  const raw = $('#invitePhones').value;
  const phones = raw.split(/[\s,;]+/).map((item) => phoneDigits(item)).filter(Boolean);
  const name = $('#inviteName').value.trim().replace(/\s+/g, ' ');
  const error = $('#inviteCreateError');
  const button = $('#inviteCreateConfirm');

  const fail = (message) => {
    error.textContent = message;
    error.hidden = false;
  };
  error.hidden = true;

  if (!phones.length) return fail('En az bir telefon numarası gir');
  if (phones.some((phone) => !validPhone(phone))) return fail('Telefon numaralarından biri geçersiz');

  setBusy(button, true, 'Davet oluşturuluyor…');
  try {
    const data = await groupApi('/api/groups/' + encodeURIComponent(state.group.id) + '/invites', {
      method: 'POST',
      body: { phones, name }
    });
    if (data.group) {
      applyGroupPayload({ group: data.group, role: 'admin' });
    }
    $('#inviteCreateDialog').close();
    renderGroupHub();
    const skipped = (data.skipped || []).length;
    toast(
      (data.invites || []).length + ' davet oluşturuldu' + (skipped ? ' · ' + skipped + ' numara atlandı' : ''),
      skipped > 0
    );
  } catch (err) {
    fail(err.message || 'Davet oluşturulamadı');
  } finally {
    setBusy(button, false);
  }
}

function inviteLink(invite) {
  const url = new URL(location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('davet', invite.token);
  return url.toString();
}

async function copyText(text, message = 'Kopyalandı') {
  try {
    await navigator.clipboard.writeText(text);
    toast(message);
  } catch {
    window.prompt('Bağlantıyı kopyala:', text);
  }
}

async function sendInvite(inviteId) {
  const group = state.group;
  if (!group) return;
  const invite = (group.invites || []).find((item) => item.id === inviteId);
  if (!invite) return;

  const link = inviteLink(invite);
  const text = group.adminName + ' seni "' + group.name + '" grubuna davet etti. Katılmak için: ' + link;

  if (navigator.share) {
    try {
      await navigator.share({ title: 'Grup daveti', text, url: link });
      return;
    } catch {}
  }

  await copyText(link, 'Davet bağlantısı kopyalandı');
  const sms = 'sms:' + (invite.phone ? '+' + invite.phone : '') + '?body=' + encodeURIComponent(text);
  setTimeout(() => {
    try { location.href = sms; } catch {}
  }, 150);
}

async function copyInvite(inviteId) {
  const group = state.group;
  if (!group) return;
  const invite = (group.invites || []).find((item) => item.id === inviteId);
  if (!invite) return;
  await copyText(inviteLink(invite), 'Davet bağlantısı kopyalandı');
}

function openGroupPlaceDialog() {
  if (!state.group || state.group.role !== 'admin') return;
  const dialog = $('#groupPlaceDialog');
  if (!dialog) return;
  const defaults = roleDefaults(state.role);
  $('#groupPlaceName').value = '';
  $('#groupPlaceLockMinutes').value = defaults.lockMinutes;
  $('#groupPlaceBreakMinutes').value = defaults.breakMinutes;
  $('#groupPlaceError').hidden = true;
  dialog.showModal();
  setTimeout(() => $('#groupPlaceName').focus(), 60);
}

async function saveGroupPlaceFromDialog() {
  if (!state.group || state.group.role !== 'admin') return;
  const name = $('#groupPlaceName').value.trim().replace(/\s+/g, ' ');
  const defaults = roleDefaults(state.role);
  const lockMinutes = minutesValue($('#groupPlaceLockMinutes').value, defaults.lockMinutes, 240);
  const breakMinutes = minutesValue($('#groupPlaceBreakMinutes').value, defaults.breakMinutes, 60);
  const error = $('#groupPlaceError');
  const button = $('#groupPlaceSave');

  const fail = (message) => {
    error.textContent = message;
    error.hidden = false;
  };
  error.hidden = true;

  if (!name) return fail('Yer adı gerekli');

  setBusy(button, true, 'Konum alınıyor…');
  try {
    const fix = await ensurePosition(20000, true);
    if (!fix) {
      fail('Konum alınamadı. İzinleri kontrol et.');
      return;
    }

    button.textContent = 'Ekleniyor…';
    const data = await groupApi('/api/groups/' + encodeURIComponent(state.group.id) + '/places', {
      method: 'POST',
      body: { name, lat: fix.lat, lng: fix.lng, lockMinutes, breakMinutes }
    });
    if (data.group) applyGroupPayload({ group: data.group, role: 'admin' });
    $('#groupPlaceDialog').close();
    renderGroupHub();
    toast('Grup yeri eklendi: ' + name);
  } catch (err) {
    fail(err.message || 'Yer eklenemedi');
  } finally {
    setBusy(button, false);
  }
}

async function openInviteAcceptDialog(token) {
  if (!token) return;
  if (state.group) {
    toast('Zaten bir gruptasın. Daveti kabul etmek için önce mevcut gruptan ayrıl.', true);
    return;
  }

  const dialog = $('#inviteAcceptDialog');
  if (!dialog) return;
  pendingInviteToken = token;
  $('#inviteAcceptError').hidden = true;
  $('#inviteAcceptName').value = state.profile.name || '';
  $('#inviteAcceptPhone').value = state.profile.phone || '';
  $('#inviteAcceptIntro').textContent = 'Davet bilgisi yükleniyor…';
  const confirm = $('#inviteAcceptConfirm');
  confirm.disabled = true;

  if (!dialog.open) dialog.showModal();

  try {
    const info = await publicApi('/api/invites/' + encodeURIComponent(token));
    $('#inviteAcceptIntro').textContent = info.valid
      ? info.adminName + ' seni "' + info.groupName + '" grubuna davet etti. Davet edilen numara: ' + info.phoneMasked
      : 'Bu davet kullanılmış veya süresi dolmuş.';
    confirm.disabled = !info.valid;
    if (!info.valid) {
      const error = $('#inviteAcceptError');
      error.textContent = 'Davet geçersiz. Yöneticiden yeni bir davet iste.';
      error.hidden = false;
    }
  } catch (err) {
    $('#inviteAcceptIntro').textContent = 'Davet bulunamadı.';
    const error = $('#inviteAcceptError');
    error.textContent = err.message || 'Davet yüklenemedi';
    error.hidden = false;
  }
}

async function acceptInviteFromDialog() {
  if (!pendingInviteToken) return;
  const name = $('#inviteAcceptName').value.trim().replace(/\s+/g, ' ');
  const phone = phoneDigits($('#inviteAcceptPhone').value);
  const error = $('#inviteAcceptError');
  const button = $('#inviteAcceptConfirm');

  const fail = (message) => {
    error.textContent = message;
    error.hidden = false;
  };
  error.hidden = true;

  if (!name) return fail('Adın gerekli');
  if (!validPhone(phone)) return fail('Geçerli bir telefon numarası gir');

  setBusy(button, true, 'Katılınıyor…');
  try {
    const data = await publicApi('/api/groups/accept-invite', {
      method: 'POST',
      body: { token: pendingInviteToken, name, phone, deviceId: getDeviceId() }
    });
    state.profile = normalizeProfile({ name, phone });
    state.group = normalizeGroup({
      ...data.group,
      role: 'member',
      memberId: data.memberId,
      memberToken: data.memberToken,
      memberName: name,
      shareLocation: true
    });
    state.pendingJoin = null;
    save();
    $('#inviteAcceptDialog').close();
    pendingInviteToken = null;

    const url = new URL(location.href);
    url.searchParams.delete('davet');
    try { history.replaceState(null, '', url.pathname + url.search + url.hash); } catch {}

    renderGroupSummary();
    startGroupSync();
    toast('Gruba katıldın');
    openGroupHub();
  } catch (err) {
    fail(err.message || 'Davete katılınamadı');
  } finally {
    setBusy(button, false);
  }
}

function openMapDialog(memberId) {
  const group = state.group;
  if (!group) return;
  const member = (group.members || []).find((item) => item.id === memberId);
  if (!member || !member.location) {
    toast('Bu üye için konum yok', true);
    return;
  }

  const { lat, lng, accuracy, at } = member.location;
  const d = 0.008;
  const bbox = [lng - d, lat - d, lng + d, lat + d].join(',');
  const mapUrl = 'https://www.openstreetmap.org/export/embed.html?bbox=' + encodeURIComponent(bbox) +
    '&layer=mapnik&marker=' + encodeURIComponent(lat + ',' + lng);
  const external = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(lat + ',' + lng);

  $('#mapTitle').textContent = member.name + ' · konum';
  $('#mapFrame').src = mapUrl;
  $('#mapMeta').textContent = (accuracy ? '±' + Math.round(accuracy) + ' m · ' : '') + fmtWhen(at);
  $('#mapLink').href = external;
  const dialog = $('#mapDialog');
  if (dialog && !dialog.open) dialog.showModal();
}

async function handleGroupAction(event) {
  const button = event.target.closest('[data-group-action]');
  if (!button) return;
  event.preventDefault();

  const action = button.dataset.groupAction;
  const id = button.dataset.id;
  const group = state.group;

  if (action === 'create') return openCreateGroupDialog();
  if (action === 'join') return openJoinGroupDialog();
  if (action === 'hub') return openGroupHub();
  if (action === 'cancel-join') return cancelPendingJoin();

  if (!group) return;

  if (action === 'copy-code') {
    await copyText(group.code, 'Grup kodu kopyalandı');
    return;
  }

  if (action === 'refresh') {
    await syncGroup();
    toast('Grup yenilendi');
    return;
  }

  if (group.role !== 'admin') {
    if (action === 'leave') {
      const ok = await askConfirm({
        title: 'Gruptan ayrılsın mı?',
        text: group.name + ' grubundan ayrılacaksın. Yönetici artık konumunu ve kilit durumunu göremez.',
        yes: 'Ayrıl'
      });
      if (!ok) return;
      try {
        await groupApi('/api/groups/' + encodeURIComponent(group.id) + '/leave', { method: 'POST', body: {} });
      } catch {}
      leaveGroupLocal('Gruptan ayrıldın');
      return;
    }
    return;
  }

  if (action === 'invite') return openInviteCreateDialog();
  if (action === 'add-group-place') return openGroupPlaceDialog();

  if (action === 'lock-all' || action === 'unlock-all') {
    const mode = action === 'lock-all' ? 'lock' : 'unlock';
    const ok = await askConfirm({
      title: mode === 'lock' ? 'Tüm üyeler kilitlensin mi?' : 'Tüm üyelerin kilidi açılsın mı?',
      text: mode === 'lock'
        ? 'Gruptaki tüm cihazlar, uygulama açık olduğu sürece kilitlenir.'
        : 'Gruptaki tüm cihazların kilidi açılır.',
      yes: mode === 'lock' ? 'Kilitle' : 'Aç'
    });
    if (!ok) return;
    try {
      await groupApi('/api/groups/' + encodeURIComponent(group.id) + '/' + mode, { method: 'POST', body: {} });
      toast(mode === 'lock' ? 'Kilit komutu gönderildi' : 'Açma komutu gönderildi');
      await syncGroup();
    } catch (err) {
      toast(err.message || 'Komut gönderilemedi', true);
    }
    return;
  }

  if (action === 'lock-member' || action === 'unlock-member') {
    const mode = action === 'lock-member' ? 'lock' : 'unlock';
    try {
      await groupApi('/api/groups/' + encodeURIComponent(group.id) + '/' + mode, {
        method: 'POST',
        body: { memberId: id }
      });
      toast(mode === 'lock' ? 'Kilit komutu gönderildi' : 'Açma komutu gönderildi');
      await syncGroup();
    } catch (err) {
      toast(err.message || 'Komut gönderilemedi', true);
    }
    return;
  }

  if (action === 'approve' || action === 'reject') {
    const decision = action === 'approve' ? 'approve' : 'reject';
    try {
      await groupApi('/api/groups/' + encodeURIComponent(group.id) + '/requests/' + encodeURIComponent(id) + '/' + decision, {
        method: 'POST',
        body: {}
      });
      toast(decision === 'approve' ? 'İstek onaylandı' : 'İstek reddedildi');
      await syncGroup();
    } catch (err) {
      toast(err.message || 'İşlem yapılamadı', true);
    }
    return;
  }

  if (action === 'remove-member') {
    const member = (group.members || []).find((item) => item.id === id);
    const ok = await askConfirm({
      title: 'Üye çıkarılsın mı?',
      text: (member ? member.name : 'Üye') + ' gruptan çıkarılacak ve cihazındaki grup kilidi açılacak.',
      yes: 'Çıkar'
    });
    if (!ok) return;
    try {
      await groupApi('/api/groups/' + encodeURIComponent(group.id) + '/members/' + encodeURIComponent(id), { method: 'DELETE' });
      toast('Üye çıkarıldı');
      await syncGroup();
    } catch (err) {
      toast(err.message || 'Üye çıkarılamadı', true);
    }
    return;
  }

  if (action === 'remove-invite') {
    try {
      await groupApi('/api/groups/' + encodeURIComponent(group.id) + '/invites/' + encodeURIComponent(id), { method: 'DELETE' });
      toast('Davet silindi');
      await syncGroup();
    } catch (err) {
      toast(err.message || 'Davet silinemedi', true);
    }
    return;
  }

  if (action === 'send-invite') return sendInvite(id);
  if (action === 'copy-invite') return copyInvite(id);

  if (action === 'remove-group-place') {
    const place = (group.places || []).find((item) => item.id === id);
    const ok = await askConfirm({
      title: 'Grup yeri silinsin mi?',
      text: (place ? place.name : 'Yer') + ' silinecek. Üyeler bu yerde artık otomatik kilitlenmeyecek.',
      yes: 'Sil'
    });
    if (!ok) return;
    try {
      await groupApi('/api/groups/' + encodeURIComponent(group.id) + '/places/' + encodeURIComponent(id), { method: 'DELETE' });
      toast('Grup yeri silindi');
      await syncGroup();
    } catch (err) {
      toast(err.message || 'Yer silinemedi', true);
    }
    return;
  }

  if (action === 'map') return openMapDialog(id);

  if (action === 'destroy') {
    const ok = await askConfirm({
      title: 'Grup dağıtılsın mı?',
      text: group.name + ' dağıtılacak. Üyelerin cihazlarındaki grup kilidi açılacak. Bu işlem geri alınamaz.',
      yes: 'Dağıt'
    });
    if (!ok) return;
    try {
      await groupApi('/api/groups/' + encodeURIComponent(group.id), { method: 'DELETE' });
      leaveGroupLocal('Grup dağıtıldı');
    } catch (err) {
      toast(err.message || 'Grup dağıtılamadı', true);
    }
  }
}

function handleGroupHubChange(event) {
  if (event.target && event.target.id === 'groupShareLocation' && state.group) {
    state.group.shareLocation = event.target.checked;
    save();
    sendGroupStatus(true);
    if (event.target.checked) sendGroupLocation(true);
    toast(event.target.checked ? 'Konum paylaşımı açıldı' : 'Konum paylaşımı kapatıldı');
  }
}

async function saveNewPlaceFromSheet() {
  const name = $('#newPlaceName').value.trim().replace(/\s+/g, ' ');
  const defaults = roleDefaults(state.role);
  const lockMinutes = minutesValue($('#newLockMinutes').value, defaults.lockMinutes, 240);
  const breakMinutes = minutesValue($('#newBreakMinutes').value, defaults.breakMinutes, 60);
  const radius = radiusValue($('#newRadius').value);
  const button = $('#newSave');

  if (!name) {
    toast('Yer adı gerekli', true);
    $('#newPlaceName').focus();
    return;
  }
  if (state.places.some((p) => norm(p.name) === norm(name))) {
    toast('Bu isimde bir yer zaten var', true);
    return;
  }

  setBusy(button, true, 'Konum alınıyor…');
  try {
    const fix = await ensurePosition(20000, true);
    if (!fix) {
      toast('Konum alınamadı. İzinleri kontrol et.', true);
      return;
    }

    const place = createPlace(name, fix, { lockMinutes, breakMinutes, radius });
    $('#newPlaceName').value = '';
    $('#newRadius').value = DEFAULT_RADIUS;
    closeSheet();
    openPlace(place.id);
    toast('Yer kaydedildi: ' + place.name);
  } finally {
    setBusy(button, false);
  }
}

function saveEditPlace() {
  const p = getPlace(selectedId);
  if (!p) return;

  const name = $('#editName').value.trim().replace(/\s+/g, ' ');
  const lockMinutes = minutesValue($('#editLockMinutes').value, p.lockMinutes || 0, 240);
  const breakMinutes = minutesValue($('#editBreakMinutes').value, p.breakMinutes || 0, 60);
  const radius = radiusValue($('#editRadius').value, p.radius);

  if (!name) {
    toast('Yer adı boş olamaz', true);
    return;
  }
  if (state.places.some((other) => other.id !== p.id && norm(other.name) === norm(name))) {
    toast('Bu isimde başka bir yer var', true);
    return;
  }

  p.name = name.slice(0, 40);
  p.lockMinutes = lockMinutes;
  p.breakMinutes = breakMinutes;
  p.radius = radius;
  p.breakUntil = 0;
  if (lastFix) evaluatePositions();

  if (locked && locked.source === 'personal' && locked.placeId === p.id) {
    const adult = isAdult();
    locked.lockMinutes = adult ? lockMinutes : 0;
    locked.breakMinutes = adult ? breakMinutes : 0;
    locked.autoUnlockAt = adult && lockMinutes > 0 ? locked.startedAt + lockMinutes * 60000 : 0;
    state.activeLock = locked;
  }
  save();
  renderAll();
  closeSheet();
  toast('Yer güncellendi');
}

async function setPlaceHere() {
  const p = getPlace(selectedId);
  if (!p) return;

  const fix = await ensurePosition(20000, true);
  if (!fix) {
    toast('Konum alınamadı. İzinleri kontrol et.', true);
    return;
  }

  p.lat = fix.lat;
  p.lng = fix.lng;
  const d = distanceM(fix, p);
  p.inside = d <= p.radius;
  p.knownInside = p.inside;
  save();
  renderAll();
  closeSheet();
  toast('Konum buraya ayarlandı');
}

async function resetPlaceCounter() {
  const p = getPlace(selectedId);
  if (!p) return;

  const ok = await askConfirm({
    title: 'Sayaç sıfırlansın mı?',
    text: '“' + p.name + '” için kapanma sayısı ve toplam süre silinir. Konum ayarı korunur.',
    yes: 'Sıfırla'
  });
  if (!ok) return;

  p.count = 0;
  p.totalMs = 0;
  p.lastAt = null;
  p.history = [];
  save();
  renderAll();
  toast('Sayaç sıfırlandı');
}

async function deleteSelectedPlace() {
  const p = getPlace(selectedId);
  if (!p) return;

  const ok = await askConfirm({
    title: 'Yer silinsin mi?',
    text: '“' + p.name + '” ve tüm kapanma kayıtları silinecek. Bu işlem geri alınamaz.',
    yes: 'Sil'
  });
  if (!ok) return;

  if (locked && locked.source === 'personal' && locked.placeId === p.id) {
    locked = null;
    state.activeLock = null;
    hideLock();
  }

  state.places = state.places.filter((other) => other.id !== p.id);
  save();
  closeSheet();
  goHome();
  renderAll();
  toast('Yer silindi');
}

async function resetEverything() {
  const ok = await askConfirm({
    title: 'Tüm veriler silinsin mi?',
    text: 'Bütün yerler, sayaçlar ve ayarlar bu cihazdan silinecek.',
    yes: 'Hepsini sil'
  });
  if (!ok) return;

  locked = null;
  hideLock();
  stopGroupSync();
  stopJoinPolling();
  state = defaultState();

  try { localStorage.removeItem(STORAGE_KEY); } catch {}
  save();

  closeSheet();
  goHome();
  renderAll();
  syncRoleUI();
  toast('Tüm veriler silindi');
  birthPromptPending = true;
  setTimeout(openBirthDialog, 250);
}

function exportData() {
  const data = JSON.stringify(state, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = 'nerede-kapansin-yedek-' + stamp + '.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  toast('Yedek indirildi');
}

async function importData(file) {
  if (!file) return;

  let parsed;
  try {
    const text = await file.text();
    parsed = JSON.parse(text);
  } catch {
    toast('Dosya okunamadı. Geçerli bir yedek seç.', true);
    return;
  }

  if (!parsed || !Array.isArray(parsed.places)) {
    toast('Bu dosya bir AlanKilit yedeği değil', true);
    return;
  }

  const ok = await askConfirm({
    title: 'Yedek yüklensin mi?',
    text: parsed.places.length + ' yer bulundu. Mevcut yerlerin ve sayaçların bununla değiştirilecek.',
    yes: 'Yükle'
  });
  if (!ok) return;

  const base = defaultState();
  const birthDate = normalizeBirthDate(parsed.birthDate);
  stopGroupSync();
  stopJoinPolling();
  state = {
    v: 1,
    places: parsed.places.map((p, i) => normalizePlace(p, i)),
    role: birthDate
      ? roleFromBirthDate(birthDate)
      : (parsed.role === 'student' ? 'student' : (parsed.role === 'adult' ? 'adult' : '')),
    birthDate,
    settings: { ...base.settings, ...(parsed.settings || {}) },
    profile: normalizeProfile(parsed.profile),
    group: normalizeGroup(parsed.group),
    pendingJoin: normalizePendingJoin(parsed.pendingJoin),
    activeLock: null
  };
  locked = null;

  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
  hideLock();
  closeSheet();
  goHome();
  renderAll();
  syncRoleUI();
  if (state.group) startGroupSync();
  if (state.pendingJoin) startJoinPolling();
  if (!state.birthDate) {
    birthPromptPending = true;
    setTimeout(openBirthDialog, 200);
  }
  toast(state.places.length + ' yer yüklendi');
}

function askConfirm({ title, text, yes = 'Evet' }) {
  return new Promise((resolve) => {
    const dialog = $('#confirmDialog');
    const yesBtn = $('#confirmYes');
    const noBtn = $('#confirmNo');

    $('#confirmTitle').textContent = title;
    $('#confirmText').textContent = text;
    yesBtn.textContent = yes;

    const cleanup = () => {
      yesBtn.removeEventListener('click', onYes);
      noBtn.removeEventListener('click', onNo);
      dialog.removeEventListener('cancel', onCancel);
    };
    const finish = (value) => {
      cleanup();
      if (dialog.open) dialog.close();
      resolve(value);
    };
    const onYes = () => finish(true);
    const onNo = () => finish(false);
    const onCancel = (event) => { event.preventDefault(); finish(false); };

    yesBtn.addEventListener('click', onYes);
    noBtn.addEventListener('click', onNo);
    dialog.addEventListener('cancel', onCancel);

    if (dialog.open) dialog.close();
    dialog.showModal();
  });
}

/* ---------------- acil çıkış ---------------- */

let sosTimer = null;

function bindSos() {
  const button = $('#sosBtn');
  if (!button) return;

  const start = (event) => {
    if (!state.settings.emergency) return;
    if (event.cancelable) event.preventDefault();
    clearTimeout(sosTimer);
    sosTimer = setTimeout(openSosDialog, 1600);
  };
  const cancel = () => clearTimeout(sosTimer);

  button.addEventListener('pointerdown', start);
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((evt) => {
    button.addEventListener(evt, cancel);
  });
  button.addEventListener('contextmenu', (event) => event.preventDefault());
  button.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openSosDialog();
    }
  });
}

function openSosDialog() {
  if (!locked || !state.settings.emergency) return;
  const dialog = $('#sosDialog');
  if (!dialog || dialog.open) return;

  $('#sosInput').value = '';
  $('#sosError').hidden = true;
  dialog.showModal();
  setTimeout(() => $('#sosInput').focus(), 60);
}

function confirmSos() {
  if (!state.settings.emergency) {
    $('#sosDialog').close();
    return;
  }

  const value = $('#sosInput').value.trim().toLocaleUpperCase('tr-TR');
  const accepted = value === 'AÇ' || value === 'AC';

  if (!accepted) {
    $('#sosError').hidden = false;
    $('#sosInput').select();
    return;
  }

  $('#sosDialog').close();
  unlockPlace('emergency');
}

/* ---------------- kurulum / PWA ---------------- */

function showUpdateBanner(worker) {
  if (!worker || updateDismissed) return;
  pendingUpdate = worker;
  const banner = $('#updateBanner');
  const wasHidden = !banner || banner.hidden;
  if (banner) banner.hidden = false;
  const text = $('#updateText');
  const button = $('#updateBtn');
  if (text) text.textContent = 'Yeni sürüm indirildi. Güncellemek için dokun.';
  if (button) button.textContent = 'Güncelle';

  const sheet = $('#settingsSheet');
  if (wasHidden && sheet && !sheet.hidden) {
    toast('Güncelleme hazır — Ayarlar kapanınca Güncelle düğmesi görünecek');
  }
}

function showRemoteUpdate(version) {
  if (!version || pendingUpdate) return;
  if (version !== remoteUpdateAvailable) updateDismissed = false;
  if (updateDismissed) return;
  remoteUpdateAvailable = version;
  const banner = $('#updateBanner');
  if (banner) banner.hidden = false;
  const text = $('#updateText');
  const button = $('#updateBtn');
  if (text) text.textContent = 'AlanKilit ' + version + ' sürümü hazır. İndirme sayfasını aç.';
  if (button) button.textContent = 'Yeni sürümü indir';
}

function hideUpdateBanner() {
  const banner = $('#updateBanner');
  if (banner) banner.hidden = true;
}

function applyUpdate() {
  if (!pendingUpdate && remoteUpdateAvailable) {
    window.location.assign(REMOTE_UPDATE_URL);
    return;
  }

  try { save(); } catch {}
  refreshing = true;

  const button = $('#updateBtn');
  if (button) {
    button.disabled = true;
    button.textContent = 'Güncelleniyor…';
  }

  if (pendingUpdate) {
    try { pendingUpdate.postMessage({ type: 'SKIP_WAITING' }); } catch {}
  }

  // Tarayıcı controllerchange olayını geciktirirse uygulamayı yine de yenile.
  setTimeout(() => location.reload(), 1200);
}

function checkForUpdates(force = false) {
  if (!swRegistration) return Promise.resolve();
  const now = Date.now();
  if (!force && now - lastUpdateCheck < 5 * 60 * 1000) return Promise.resolve();
  lastUpdateCheck = now;
  return swRegistration.update().catch(() => {});
}

function compareVersions(left, right) {
  const parse = (value) => {
    if (!/^\d+(?:\.\d+){1,3}$/.test(String(value || ''))) return null;
    return String(value).split('.').map(Number);
  };
  const a = parse(left);
  const b = parse(right);
  if (!a || !b) return null;

  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const difference = (a[i] || 0) - (b[i] || 0);
    if (difference) return Math.sign(difference);
  }
  return 0;
}

async function checkLatestVersion(force = false) {
  const now = Date.now();
  if (!force && now - lastRemoteVersionCheck < 5 * 60 * 1000) {
    return remoteUpdateAvailable ? 'available' : 'unchecked';
  }
  lastRemoteVersionCheck = now;

  try {
    const response = await fetch(REMOTE_VERSION_URL + '?check=' + now, {
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    });
    if (!response.ok) return 'unavailable';
    const data = await response.json();
    const comparison = compareVersions(APP_VERSION, data && data.version);
    if (comparison === null) return 'unavailable';
    if (comparison < 0) {
      showRemoteUpdate(data.version);
      return 'available';
    }

    remoteUpdateAvailable = '';
    if (!pendingUpdate) hideUpdateBanner();
    return 'current';
  } catch {
    return 'unavailable';
  }
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (!location.protocol.startsWith('http')) return;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) location.reload();
  });

  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((registration) => {
    swRegistration = registration;
    if (registration.waiting && navigator.serviceWorker.controller) {
      showUpdateBanner(registration.waiting);
    }

    registration.addEventListener('updatefound', () => {
      updateDismissed = false;
      const worker = registration.installing;
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
          showUpdateBanner(worker);
        }
      });
    });

    checkForUpdates(true);
    setInterval(() => {
      if (document.visibilityState === 'visible') checkForUpdates();
    }, 15 * 60 * 1000);
  }).catch(() => {});

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      checkForUpdates();
      checkLatestVersion();
    }
  });
  window.addEventListener('online', () => {
    checkForUpdates(true);
    checkLatestVersion(true);
  });
}

function bindInstall() {
  const banner = $('#installBanner');
  const installBtn = $('#installBtn');
  const dismissBtn = $('#installDismiss');

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
    if (banner) banner.hidden = false;
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    if (banner) banner.hidden = true;
    toast('Uygulama cihaza kuruldu');
  });

  if (installBtn) {
    installBtn.addEventListener('click', async () => {
      if (!deferredPrompt) {
        toast('Kurulum için tarayıcı menüsünden “Ana ekrana ekle” seçeneğini kullan');
        return;
      }
      deferredPrompt.prompt();
      try { await deferredPrompt.userChoice; } catch {}
      deferredPrompt = null;
      if (banner) banner.hidden = true;
    });
  }

  if (dismissBtn) {
    dismissBtn.addEventListener('click', () => {
      if (banner) banner.hidden = true;
    });
  }
}

function bindUpdate() {
  const updateBtn = $('#updateBtn');
  const dismissBtn = $('#updateDismiss');
  const checkBtn = $('#checkUpdateBtn');

  if (updateBtn) updateBtn.addEventListener('click', applyUpdate);

  if (dismissBtn) {
    dismissBtn.addEventListener('click', () => {
      updateDismissed = true;
      pendingUpdate = null;
      hideUpdateBanner();
    });
  }

  if (checkBtn) {
    checkBtn.addEventListener('click', async () => {
      if (swRegistration && swRegistration.waiting) {
        updateDismissed = false;
        showUpdateBanner(swRegistration.waiting);
        return;
      }

      toast('Güncellemeler denetleniyor…');
      const [versionStatus] = await Promise.all([
        checkLatestVersion(true),
        checkForUpdates(true)
      ]);
      if (versionStatus === 'available') toast('Yeni sürüm indirme sayfasında hazır');
      else if (versionStatus === 'current') toast('AlanKilit güncel');
      else toast('Sürüm denetlenemedi. İnternet bağlantısını kontrol et.', true);
    });
  }
}

/* ---------------- saat ---------------- */

function tick() {
  refreshAgeRole();
  maybeRefreshFix();

  if (locked && locked.autoUnlockAt && Date.now() >= locked.autoUnlockAt) {
    unlockPlace('break');
  }

  let needsFix = false;
  if (document.visibilityState === 'visible') {
    for (const place of state.places) {
      if (place.breakUntil && Date.now() >= place.breakUntil) {
        place.breakUntil = 0;
        place.knownInside = false;
        needsFix = true;
      }
    }
    if (state.group && state.group.override && state.group.override.until && Date.now() >= state.group.override.until) {
      state.group.override = null;
      needsFix = true;
    }
  }
  if (needsFix) {
    save();
    ensurePosition(15000, true).catch(() => {});
  }

  if (locked) {
    updateLockUI();
    if (currentView === 'place') updatePlaceLive();
  } else if (viewReady && currentView === 'place') {
    updatePlaceLive();
  }
}

/* ---------------- olaylar ---------------- */

function bindEvents() {
  $('#addForm').addEventListener('submit', onAddSubmit);

  $('#backBtn').addEventListener('click', goHome);
  $('#backLink').addEventListener('click', goHome);

  $('#settingsBtn').addEventListener('click', openSheet);
  $('#placeSettingsBtn').addEventListener('click', openSheet);

  $$('[data-close-sheet]').forEach((el) => el.addEventListener('click', closeSheet));

  $('#placeList').addEventListener('click', (event) => {
    const item = event.target.closest('.place-item[data-id]');
    if (item) openPlace(item.dataset.id);
  });

  $('#gpsPill').addEventListener('click', refreshPosition);

  $('#setHereBtn').addEventListener('click', setPlaceHere);

  if ($('#roleChip')) $('#roleChip').addEventListener('click', openBirthDialog);
  if ($('#birthSave')) $('#birthSave').addEventListener('click', saveBirthDateFromDialog);
  if ($('#birthCancel')) {
    $('#birthCancel').addEventListener('click', () => {
      const dialog = $('#birthDialog');
      if (dialog && dialog.open) dialog.close();
    });
  }
  if ($('#settingsBirthSave')) $('#settingsBirthSave').addEventListener('click', saveBirthDateFromSettings);

  ['#birthDateInput', '#settingsBirthDate'].forEach((sel) => {
    const el = $(sel);
    if (!el) return;
    el.addEventListener('input', () => {
      if (sel === '#birthDateInput') {
        updateBirthPreview();
      } else {
        const age = ageFromBirthDate(el.value);
        const summary = $('#ageSummary');
        if (summary) summary.textContent = age == null ? 'Doğum tarihi girilmedi.' : ageModeText(age);
      }
    });
    el.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      if (sel === '#birthDateInput') saveBirthDateFromDialog();
      else saveBirthDateFromSettings();
    });
  });

  if ($('#birthDialog')) {
    $('#birthDialog').addEventListener('cancel', (event) => event.preventDefault());
  }

  $('#profileSave').addEventListener('click', saveProfile);
  $('#groupSummary').addEventListener('click', handleGroupAction);
  $('#groupHubContent').addEventListener('click', handleGroupAction);
  $('#groupHubContent').addEventListener('change', handleGroupHubChange);

  $$('[data-close-group-hub]').forEach((el) => el.addEventListener('click', closeGroupHub));
  $$('[data-close-group-dialog]').forEach((el) => el.addEventListener('click', () => {
    $$('.group-dialog[open], #mapDialog[open]').forEach((dialog) => dialog.close());
  }));

  $('#createGroupConfirm').addEventListener('click', createGroupFromDialog);
  $('#joinGroupConfirm').addEventListener('click', sendJoinRequest);
  $('#inviteCreateConfirm').addEventListener('click', createInvitesFromDialog);
  $('#groupPlaceSave').addEventListener('click', saveGroupPlaceFromDialog);
  $('#inviteAcceptConfirm').addEventListener('click', acceptInviteFromDialog);

  ['#createGroupName', '#createGroupAdmin', '#createGroupPhone'].forEach((sel) => {
    const el = $(sel);
    if (!el) return;
    el.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      createGroupFromDialog();
    });
  });
  ['#joinGroupCode', '#joinGroupName', '#joinGroupPhone'].forEach((sel) => {
    const el = $(sel);
    if (!el) return;
    el.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      if (!state.pendingJoin) sendJoinRequest();
    });
  });
  ['#inviteAcceptName', '#inviteAcceptPhone'].forEach((sel) => {
    const el = $(sel);
    if (!el) return;
    el.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      if (!$('#inviteAcceptConfirm').disabled) acceptInviteFromDialog();
    });
  });

  $('#newSave').addEventListener('click', saveNewPlaceFromSheet);
  $('#editSave').addEventListener('click', saveEditPlace);
  $('#editUseCurrent').addEventListener('click', setPlaceHere);

  ['#newPlaceName', '#newLockMinutes', '#newBreakMinutes', '#newRadius'].forEach((sel) => {
    const el = $(sel);
    if (!el) return;
    el.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      saveNewPlaceFromSheet();
    });
  });
  $('#editName').addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    saveEditPlace();
  });
  $('#editRadius').addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    saveEditPlace();
  });
  $('#editZero').addEventListener('click', resetPlaceCounter);
  $('#editDelete').addEventListener('click', deleteSelectedPlace);

  $('#optSound').addEventListener('change', (e) => {
    state.settings.sound = e.target.checked;
    save();
  });
  $('#optVibrate').addEventListener('change', (e) => {
    state.settings.vibrate = e.target.checked;
    save();
  });
  $('#optEmergency').addEventListener('change', (e) => {
    state.settings.emergency = e.target.checked;
    save();
    $('#sosBtn').hidden = !state.settings.emergency;
  });
  $('#optPowerSave').addEventListener('change', (e) => {
    state.settings.powerSave = e.target.checked;
    save();
    if (geoWatch !== null) {
      try { navigator.geolocation.clearWatch(geoWatch); } catch {}
      geoWatch = null;
    }
    if (document.visibilityState === 'visible') startGeo();
    if (state.group) startGroupSync();
    toast(e.target.checked ? 'Pil tasarrufu açıldı' : 'Yüksek doğruluk açıldı');
  });

  $('#notifyBtn').addEventListener('click', async () => {
    if (!('Notification' in window)) {
      toast('Bu tarayıcı bildirim desteklemiyor', true);
      return;
    }
    const result = await Notification.requestPermission();
    toast(result === 'granted' ? 'Bildirim izni verildi' : 'Bildirim izni verilmedi', result !== 'granted');
  });

  $('#demoBtn').addEventListener('click', () => {
    const p = (selectedId && getPlace(selectedId)) || state.places[0];
    if (!p) {
      toast('Önce bir yer ekle', true);
      return;
    }
    if (locked) {
      toast('Zaten kilitli', true);
      return;
    }
    closeSheet();
    setTimeout(() => lockPlace(p, { demo: true }), 180);
  });

  $('#exportBtn').addEventListener('click', exportData);
  $('#importBtn').addEventListener('click', () => $('#importFile').click());
  $('#importFile').addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    await importData(file);
  });
  $('#resetAll').addEventListener('click', resetEverything);

  $('#sosConfirm').addEventListener('click', confirmSos);
  $('#sosCancel').addEventListener('click', () => $('#sosDialog').close());
  $('#sosInput').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      confirmSos();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (locked) {
      if (event.key === 'Escape' || event.key === 'Tab') {
        event.preventDefault();
        event.stopPropagation();
      }
      if (event.key === 'F5' || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'r')) {
        event.preventDefault();
      }
      return;
    }
    if (event.key === 'Escape') {
      if (!$$('dialog[open]').length) closeSheet();
    }
  }, true);

  document.addEventListener('contextmenu', (event) => {
    if (locked) event.preventDefault();
  });

  document.addEventListener('focusin', (event) => {
    if (!locked) return;
    const screen = $('#lockScreen');
    if (screen && !screen.contains(event.target)) {
      const target = screen.querySelector('.lock-inner');
      if (target) {
        target.setAttribute('tabindex', '-1');
        target.focus({ preventScroll: true });
      }
    }
  });

  window.addEventListener('beforeunload', (event) => {
    if (!locked) return;
    event.preventDefault();
    event.returnValue = '';
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') {
      if (geoWatch !== null) {
        try { navigator.geolocation.clearWatch(geoWatch); } catch {}
        geoWatch = null;
      }
      return;
    }

    if (locked) {
      acquireWakeLock();
      updateLockUI();
    }
    if (geoWatch === null && geoState !== 'denied' && geoState !== 'unavailable') {
      startGeo();
    }
    if (geoState === 'active' && (!lastFix || Date.now() - lastFix.at > 45000)) {
      ensurePosition(12000, true).catch(() => {});
    }
    if (state.group) {
      syncGroup();
      sendGroupStatus(true);
      sendGroupLocation(true);
    }
    checkLatestVersion();
  });

  window.addEventListener('hashchange', route);
  window.addEventListener('online', () => {
    toast('Bağlantı geri geldi');
    checkLatestVersion(true);
    if (state.group) syncGroup();
    if (state.pendingJoin) checkJoinStatus();
  });
}

/* ---------------- başlangıç ---------------- */

function beginGeo() {
  initGeo();
  armGeoOnGesture();
  if (state.places.length > 0 && geoState === 'idle') startGeo();
}

function init() {
  refreshAgeRole();

  if (state.group) {
    const validMember = state.group.role === 'admin' ||
      (state.group.role === 'member' && state.group.memberId && state.group.memberToken);
    if (!groupToken() || !validMember) {
      state.group = null;
      state.pendingJoin = null;
      save();
    }
  }

  if (state.group && state.pendingJoin) {
    state.pendingJoin = null;
    save();
  }

  if (locked) {
    const source = locked.source || 'personal';
    const place = source === 'group' ? resolveLockPlace(locked) : (source === 'personal' ? getPlace(locked.placeId) : true);
    if (source !== 'remote' && !place) {
      locked = null;
      state.activeLock = null;
      save();
    } else if (source !== 'personal' && !state.group) {
      locked = null;
      state.activeLock = null;
      save();
    }
  }

  applyAgeScheduleToActiveLock();

  bindEvents();
  bindSos();
  bindInstall();
  bindUpdate();
  registerServiceWorker();
  checkLatestVersion();
  setInterval(() => {
    if (document.visibilityState === 'visible') checkLatestVersion();
  }, 60 * 60 * 1000);

  if (locked) {
    showLock();
    startGeo();
  }

  route();
  renderAll();
  syncSettings();
  syncRoleUI();

  const needsBirth = !state.birthDate && !locked;
  if (!needsBirth) beginGeo();

  if (state.group) startGroupSync();
  if (state.pendingJoin) startJoinPolling();

  if (needsBirth) {
    birthPromptPending = true;
    setTimeout(openBirthDialog, 200);
  } else {
    handleStartupLink();
  }

  viewReady = true;
  setInterval(tick, 1000);
}

init();
