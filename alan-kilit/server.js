/* Alan Kilit yerel sunucusu
   Bilgisayarda: http://localhost:8090
   Aynı Wi-Fi'daki telefon/tablet: http://<bilgisayar-ip>:8090
   (Telefonda otomatik konum için HTTPS gerekir; README'ye bak.)

   Grup özelliği bu sunucu üzerinden çalışır. Sunucu kapanırsa
   grup üyeleri birbirini göremez; cihazlar yerel olarak çalışmaya devam eder. */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const KOK = __dirname;
const BASLANGIC_PORT = Number(process.env.PORT) || 8090;
const DATA_KLASORU = path.join(KOK, 'data');
const DATA_DOSYASI = path.join(DATA_KLASORU, 'groups.json');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8'
};

/* ---------------- kalıcı veri ---------------- */

let store = { groups: {} };

function veriyiYukle() {
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_DOSYASI, 'utf8'));
    if (parsed && parsed.groups && typeof parsed.groups === 'object') {
      store = parsed;
    }
  } catch {
    /* ilk çalıştırma veya bozuk dosya: boş başla */
  }

  for (const grup of Object.values(store.groups || {})) {
    grup.places = Array.isArray(grup.places) ? grup.places : [];
    grup.members = Array.isArray(grup.members) ? grup.members : [];
    grup.pending = Array.isArray(grup.pending) ? grup.pending : [];
    grup.invites = Array.isArray(grup.invites) ? grup.invites : [];
    grup.events = Array.isArray(grup.events) ? grup.events : [];
    grup.joinResults = grup.joinResults && typeof grup.joinResults === 'object' ? grup.joinResults : {};
    grup.seq = Number(grup.seq) || 0;

    for (const uye of grup.members) {
      uye.shareLocation = uye.shareLocation !== false;
      uye.phone = uye.phone || '';
      uye.location = uye.location || null;
    }
  }
}

function kaydet() {
  try {
    fs.mkdirSync(DATA_KLASORU, { recursive: true });
    fs.writeFileSync(DATA_DOSYASI, JSON.stringify(store, null, 2));
  } catch (hata) {
    console.error('[Alan Kilit] Grup verisi yazılamadı:', hata.message);
  }
}

veriyiYukle();

/* ---------------- yardımcılar ---------------- */

function simdi() {
  return Date.now();
}

function yeniId(onek = 'id') {
  return onek + '_' + crypto.randomBytes(9).toString('base64url');
}

function yeniToken() {
  return crypto.randomBytes(24).toString('base64url');
}

function yeniKod() {
  const harfler = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let kod = '';
  for (let i = 0; i < 6; i++) kod += harfler[crypto.randomInt(harfler.length)];
  return kod;
}

function temizAd(deger, uzunluk = 40) {
  return String(deger || '').trim().replace(/\s+/g, ' ').slice(0, uzunluk);
}

function telefonRakamlari(deger) {
  return String(deger || '').replace(/\D/g, '').slice(0, 15);
}

function telefonAnahtari(deger) {
  return telefonRakamlari(deger).slice(-10);
}

function telefonGecerli(deger) {
  const rakam = telefonRakamlari(deger);
  return rakam.length >= 10 && rakam.length <= 15;
}

function telefonGizle(deger) {
  const rakam = telefonRakamlari(deger);
  if (rakam.length < 4) return '•••';
  return '••• ••• ' + rakam.slice(-4);
}

function jsonYaz(yanit, durum, veri) {
  const govde = JSON.stringify(veri);
  yanit.writeHead(durum, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  yanit.end(govde);
}

function govdeOku(istek) {
  return new Promise((cozum, red) => {
    let govde = '';
    let boyut = 0;

    istek.on('data', (parca) => {
      boyut += parca.length;
      if (boyut > 1024 * 1024) {
        red(new Error('İstek çok büyük'));
        istek.destroy();
        return;
      }
      govde += parca;
    });

    istek.on('end', () => {
      if (!govde) return cozum({});
      try {
        cozum(JSON.parse(govde));
      } catch {
        red(new Error('Geçersiz JSON'));
      }
    });

    istek.on('error', red);
  });
}

function tokenOku(istek, url) {
  const baslik = istek.headers.authorization || '';
  if (baslik.startsWith('Bearer ')) return baslik.slice(7).trim();
  return url.searchParams.get('token') || '';
}

function grupBul(id) {
  return store.groups[id] || null;
}

function kodIleGrupBul(kod) {
  const aranan = String(kod || '').trim().toUpperCase();
  return Object.values(store.groups).find((g) => g.code === aranan) || null;
}

function davetIleBul(token) {
  const aranan = String(token || '').trim();
  if (!aranan) return null;
  for (const grup of Object.values(store.groups)) {
    const davet = (grup.invites || []).find((i) => i.token === aranan);
    if (davet) return { grup, davet };
  }
  return null;
}

function izleyiciBul(grup, token) {
  if (!token) return null;
  if (token === grup.adminToken) return { role: 'admin', member: null };
  const uye = (grup.members || []).find((m) => m.token === token);
  if (uye) return { role: 'member', member: uye };
  return null;
}

function uyeOzeti(uye) {
  return {
    id: uye.id,
    name: uye.name,
    phone: uye.phone || '',
    joinedAt: uye.joinedAt,
    lastSeen: uye.lastSeen || 0,
    locked: Boolean(uye.locked),
    placeId: uye.placeId || null,
    placeName: uye.placeName || '',
    shareLocation: uye.shareLocation !== false,
    location: uye.shareLocation === false || !uye.location
      ? null
      : {
          lat: uye.location.lat,
          lng: uye.location.lng,
          accuracy: uye.location.accuracy || 0,
          at: uye.location.at
        },
    remote: uye.remote
      ? { mode: uye.remote.mode, at: uye.remote.at, seq: uye.remote.seq }
      : null
  };
}

function olayEkle(grup, tip, metin, uye) {
  if (!grup.events) grup.events = [];
  grup.events.unshift({
    id: yeniId('evt'),
    at: simdi(),
    type: tip,
    text: metin,
    memberId: uye ? uye.id : null,
    memberName: uye ? uye.name : ''
  });
  if (grup.events.length > 120) grup.events.length = 120;
}

function grupGorunumu(grup, izleyici) {
  return {
    id: grup.id,
    name: grup.name,
    code: grup.code,
    adminName: grup.adminName,
    adminPhone: grup.adminPhone || '',
    createdAt: grup.createdAt,
    seq: grup.seq || 0,
    places: (grup.places || []).map((p) => ({
      id: p.id,
      name: p.name,
      lat: p.lat,
      lng: p.lng,
      lockMinutes: Math.max(0, Math.min(240, Math.floor(Number(p.lockMinutes) || 0))),
      breakMinutes: Math.max(0, Math.min(60, Math.floor(Number(p.breakMinutes) || 0))),
      createdAt: p.createdAt
    })),
    members: (grup.members || []).map((uye) => {
      const ozet = uyeOzeti(uye);
      if (!izleyici || izleyici.role !== 'admin') {
        if (!izleyici || !izleyici.member || izleyici.member.id !== uye.id) {
          ozet.location = null;
        }
      }
      return ozet;
    }),
    pending: izleyici && izleyici.role === 'admin'
      ? (grup.pending || []).map((r) => ({
          id: r.id,
          name: r.name,
          phone: r.phone || '',
          at: r.at
        }))
      : [],
    invites: izleyici && izleyici.role === 'admin'
      ? (grup.invites || []).map((i) => ({
          id: i.id,
          name: i.name || '',
          phone: i.phone || '',
          at: i.at,
          acceptedAt: i.acceptedAt || null,
          memberId: i.memberId || null,
          token: i.token
        }))
      : [],
    events: izleyici && izleyici.role === 'admin'
      ? (grup.events || []).slice(0, 60)
      : []
  };
}

function eskiIstekleriTemizle(grup) {
  const sinir = simdi() - 30 * 60 * 1000;
  for (const [id, sonuc] of Object.entries(grup.joinResults || {})) {
    if (!sonuc || Number(sonuc.at) < sinir) delete grup.joinResults[id];
  }
}

/* ---------------- canlı bağlantılar (SSE) ---------------- */

const istemciler = new Map(); // groupId -> Set<{res, token, memberId}>

function sseYaz(yanit, olay, veri) {
  try {
    yanit.write('event: ' + olay + '\ndata: ' + JSON.stringify(veri) + '\n\n');
  } catch {
    /* bağlantı kapanmış olabilir */
  }
}

function istemciKapat(istemci) {
  try { istemci.res.end(); } catch {}
}

function grupYayinla(grupId) {
  const grup = grupBul(grupId);
  const kume = istemciler.get(grupId);
  if (!kume) return;

  for (const istemci of Array.from(kume)) {
    if (!grup) {
      sseYaz(istemci.res, 'deleted', {});
      istemciKapat(istemci);
      kume.delete(istemci);
      continue;
    }

    const izleyici = izleyiciBul(grup, istemci.token);
    if (!izleyici) {
      sseYaz(istemci.res, 'removed', {});
      istemciKapat(istemci);
      kume.delete(istemci);
      continue;
    }

    sseYaz(istemci.res, 'update', {
      group: grupGorunumu(grup, izleyici),
      role: izleyici.role,
      memberId: izleyici.member ? izleyici.member.id : null
    });
  }

  if (kume.size === 0) istemciler.delete(grupId);
}

function uyeyiBaglantidanCikar(grupId, uyeId) {
  const kume = istemciler.get(grupId);
  if (!kume) return;
  for (const istemci of Array.from(kume)) {
    if (istemci.memberId !== uyeId) continue;
    sseYaz(istemci.res, 'removed', {});
    istemciKapat(istemci);
    kume.delete(istemci);
  }
}

/* ---------------- API ---------------- */

async function apiIsle(istek, yanit) {
  const url = new URL(istek.url, 'http://localhost');
  const yol = url.pathname;
  const metot = istek.method || 'GET';

  /* Yeni grup */
  if (yol === '/api/groups' && metot === 'POST') {
    const govde = await govdeOku(istek);
    const ad = temizAd(govde.name);
    const yonetici = temizAd(govde.adminName) || 'Yönetici';
    const telefon = telefonRakamlari(govde.adminPhone);

    if (!ad) return jsonYaz(yanit, 400, { error: 'Grup adı gerekli' });
    if (telefon && !telefonGecerli(telefon)) {
      return jsonYaz(yanit, 400, { error: 'Geçerli bir telefon numarası gir' });
    }

    let kod = yeniKod();
    while (kodIleGrupBul(kod)) kod = yeniKod();

    const grup = {
      id: yeniId('grp'),
      name: ad,
      code: kod,
      adminName: yonetici,
      adminPhone: telefon,
      adminToken: yeniToken(),
      createdAt: simdi(),
      seq: 0,
      places: [],
      members: [],
      pending: [],
      invites: [],
      events: [],
      joinResults: {}
    };

    olayEkle(grup, 'group-created', 'Grup oluşturuldu: ' + ad);
    store.groups[grup.id] = grup;
    kaydet();
    return jsonYaz(yanit, 201, {
      group: grupGorunumu(grup, { role: 'admin' }),
      role: 'admin',
      token: grup.adminToken
    });
  }

  /* Gruba katılma isteği */
  if (yol === '/api/groups/join-request' && metot === 'POST') {
    const govde = await govdeOku(istek);
    const kod = String(govde.code || '').trim().toUpperCase();
    const ad = temizAd(govde.name);
    const telefon = telefonRakamlari(govde.phone);
    const cihaz = temizAd(govde.deviceId, 80) || yeniId('dev');
    const grup = kodIleGrupBul(kod);

    if (!grup) return jsonYaz(yanit, 404, { error: 'Bu kodla bir grup bulunamadı' });
    if (!ad) return jsonYaz(yanit, 400, { error: 'Adın gerekli' });
    if (!telefonGecerli(telefon)) return jsonYaz(yanit, 400, { error: 'Geçerli bir telefon numarası gir' });
    if ((grup.pending || []).length >= 50) return jsonYaz(yanit, 429, { error: 'Çok fazla bekleyen istek var' });

    const ayniCihaz = (grup.members || []).find((m) => m.deviceId === cihaz);
    if (ayniCihaz) {
      return jsonYaz(yanit, 409, { error: 'Bu cihaz zaten grupta. Önce cihazdaki grubu bırak.' });
    }

    if ((grup.members || []).some((m) => telefonAnahtari(m.phone) === telefonAnahtari(telefon))) {
      return jsonYaz(yanit, 409, { error: 'Bu telefon numarası zaten grupta' });
    }

    const bekleyen = (grup.pending || []).find((r) => r.deviceId === cihaz);
    if (bekleyen) {
      return jsonYaz(yanit, 200, {
        status: 'pending',
        groupId: grup.id,
        requestId: bekleyen.id,
        requestToken: bekleyen.requestToken,
        group: { id: grup.id, name: grup.name, adminName: grup.adminName }
      });
    }

    const istek = {
      id: yeniId('req'),
      name: ad,
      phone: telefon,
      deviceId: cihaz,
      requestToken: yeniToken(),
      at: simdi()
    };

    grup.pending.push(istek);
    olayEkle(grup, 'join-request', ad + ' gruba katılma isteği gönderdi');
    grup.seq = (grup.seq || 0) + 1;
    kaydet();
    grupYayinla(grup.id);

    return jsonYaz(yanit, 201, {
      status: 'pending',
      groupId: grup.id,
      requestId: istek.id,
      requestToken: istek.requestToken,
      group: { id: grup.id, name: grup.name, adminName: grup.adminName }
    });
  }

  /* Katılma isteğinin sonucu */
  const durumEslesme = yol.match(/^\/api\/join-status\/([^/]+)\/([^/]+)$/);
  if (durumEslesme && metot === 'GET') {
    const grup = grupBul(decodeURIComponent(durumEslesme[1]));
    if (!grup) return jsonYaz(yanit, 404, { error: 'Grup bulunamadı' });

    const istekId = decodeURIComponent(durumEslesme[2]);
    const token = tokenOku(istek, url);
    const bekleyen = (grup.pending || []).find((r) => r.id === istekId && r.requestToken === token);
    if (bekleyen) return jsonYaz(yanit, 200, { status: 'pending' });

    const sonuc = (grup.joinResults || {})[istekId];
    if (!sonuc || sonuc.requestToken !== token) {
      return jsonYaz(yanit, 404, { error: 'İstek bulunamadı' });
    }

    if (sonuc.status === 'rejected') {
      return jsonYaz(yanit, 200, { status: 'rejected' });
    }

    const uye = (grup.members || []).find((m) => m.id === sonuc.memberId);
    if (!uye) return jsonYaz(yanit, 410, { error: 'Üyelik artık geçerli değil' });

    return jsonYaz(yanit, 200, {
      status: 'approved',
      role: 'member',
      memberId: uye.id,
      memberToken: uye.token,
      group: grupGorunumu(grup, { role: 'member', member: uye })
    });
  }

  /* Davet bilgisi (herkese açık) */
  const davetEslesme = yol.match(/^\/api\/invites\/([^/]+)$/);
  if (davetEslesme && metot === 'GET') {
    const bulunan = davetIleBul(decodeURIComponent(davetEslesme[1]));
    if (!bulunan) return jsonYaz(yanit, 404, { error: 'Davet bulunamadı' });

    const { grup, davet } = bulunan;
    const suAn = simdi();
    const gecerli = !davet.acceptedAt && suAn - Number(davet.at || 0) < 7 * 24 * 60 * 60 * 1000;

    return jsonYaz(yanit, 200, {
      valid: gecerli,
      accepted: Boolean(davet.acceptedAt),
      groupName: grup.name,
      adminName: grup.adminName,
      phoneMasked: telefonGizle(davet.phone),
      expiresAt: Number(davet.at || 0) + 7 * 24 * 60 * 60 * 1000
    });
  }

  /* Daveti kabul et (davet edilen numara) */
  if (yol === '/api/groups/accept-invite' && metot === 'POST') {
    const govde = await govdeOku(istek);
    const bulunan = davetIleBul(govde.token);
    if (!bulunan) return jsonYaz(yanit, 404, { error: 'Davet bulunamadı' });

    const { grup, davet } = bulunan;
    const ad = temizAd(govde.name) || temizAd(davet.name) || 'Üye';
    const telefon = telefonRakamlari(govde.phone);
    const cihaz = temizAd(govde.deviceId, 80) || yeniId('dev');

    if (davet.acceptedAt) return jsonYaz(yanit, 409, { error: 'Bu davet daha önce kullanılmış' });
    if (simdi() - Number(davet.at || 0) > 7 * 24 * 60 * 60 * 1000) {
      return jsonYaz(yanit, 410, { error: 'Davetin süresi dolmuş' });
    }
    if (!telefonGecerli(telefon)) return jsonYaz(yanit, 400, { error: 'Geçerli bir telefon numarası gir' });
    if (telefonAnahtari(telefon) !== telefonAnahtari(davet.phone)) {
      return jsonYaz(yanit, 403, { error: 'Bu davet başka bir telefon numarasına gönderilmiş' });
    }
    if ((grup.members || []).some((m) => m.deviceId === cihaz)) {
      return jsonYaz(yanit, 409, { error: 'Bu cihaz zaten grupta' });
    }
    if ((grup.members || []).some((m) => telefonAnahtari(m.phone) === telefonAnahtari(telefon))) {
      return jsonYaz(yanit, 409, { error: 'Bu telefon numarası zaten grupta' });
    }

    const uye = {
      id: yeniId('mem'),
      name: ad,
      phone: telefon,
      deviceId: cihaz,
      token: yeniToken(),
      joinedAt: simdi(),
      lastSeen: simdi(),
      locked: false,
      placeId: null,
      placeName: '',
      shareLocation: true,
      location: null,
      remote: null
    };

    grup.members.push(uye);
    davet.acceptedAt = simdi();
    davet.memberId = uye.id;
    olayEkle(grup, 'invite-accepted', uye.name + ' davetle gruba katıldı', uye);
    grup.seq = (grup.seq || 0) + 1;
    kaydet();
    grupYayinla(grup.id);

    return jsonYaz(yanit, 200, {
      role: 'member',
      memberId: uye.id,
      memberToken: uye.token,
      group: grupGorunumu(grup, { role: 'member', member: uye })
    });
  }

  /* /api/groups/:id/... */
  const grupEslesme = yol.match(/^\/api\/groups\/([^/]+)(?:\/(.*))?$/);
  if (!grupEslesme) return jsonYaz(yanit, 404, { error: 'Bulunamadı' });

  const grup = grupBul(decodeURIComponent(grupEslesme[1]));
  if (!grup) return jsonYaz(yanit, 404, { error: 'Grup bulunamadı' });

  const kalan = grupEslesme[2] || '';
  const token = tokenOku(istek, url);
  const izleyici = izleyiciBul(grup, token);

  if (!izleyici) return jsonYaz(yanit, 403, { error: 'Yetki yok' });

  /* Canlı akış */
  if (kalan === 'stream' && metot === 'GET') {
    yanit.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
      'X-Content-Type-Options': 'nosniff'
    });
    yanit.write('retry: 3000\n\n');

    if (izleyici.role === 'member') {
      izleyici.member.lastSeen = simdi();
    }

    const istemci = {
      res: yanit,
      token,
      memberId: izleyici.member ? izleyici.member.id : null
    };
    const kume = istemciler.get(grup.id) || new Set();
    kume.add(istemci);
    istemciler.set(grup.id, kume);

    sseYaz(yanit, 'snapshot', {
      group: grupGorunumu(grup, izleyici),
      role: izleyici.role,
      memberId: izleyici.member ? izleyici.member.id : null
    });

    const kalp = setInterval(() => {
      try { yanit.write(': ping\n\n'); } catch {}
    }, 20000);

    istek.on('close', () => {
      clearInterval(kalp);
      kume.delete(istemci);
      if (kume.size === 0) istemciler.delete(grup.id);
    });

    return;
  }

  /* Grup özeti */
  if (kalan === '' && metot === 'GET') {
    if (izleyici.role === 'member') izleyici.member.lastSeen = simdi();
    return jsonYaz(yanit, 200, {
      group: grupGorunumu(grup, izleyici),
      role: izleyici.role,
      memberId: izleyici.member ? izleyici.member.id : null
    });
  }

  /* Üyenin kendi işlemleri */
  const uyeDurumEslesme = kalan.match(/^members\/([^/]+)\/status$/);
  if (uyeDurumEslesme && metot === 'POST') {
    return uyeDurumuIsle(istek, yanit, grup, decodeURIComponent(uyeDurumEslesme[1]));
  }

  const uyeKonumEslesme = kalan.match(/^members\/([^/]+)\/location$/);
  if (uyeKonumEslesme && metot === 'POST') {
    return uyeKonumIsle(istek, yanit, grup, decodeURIComponent(uyeKonumEslesme[1]));
  }

  if (kalan === 'leave' && metot === 'POST') {
    return uyeAyrilIsle(istek, yanit, grup);
  }

  /* Yönetici işlemleri */
  if (izleyici.role !== 'admin') {
    return jsonYaz(yanit, 403, { error: 'Bu işlem için yönetici olmalısın' });
  }

  /* Yönetici profilini güncelle */
  if (kalan === 'profile' && metot === 'POST') {
    const govde = await govdeOku(istek);
    const ad = temizAd(govde.adminName);
    const telefon = telefonRakamlari(govde.adminPhone);

    if (!ad) return jsonYaz(yanit, 400, { error: 'Yönetici adı gerekli' });
    if (telefon && !telefonGecerli(telefon)) {
      return jsonYaz(yanit, 400, { error: 'Geçerli bir telefon numarası gir' });
    }

    grup.adminName = ad;
    grup.adminPhone = telefon;
    olayEkle(grup, 'admin-profile', 'Yönetici profilini güncelledi');
    grup.seq = (grup.seq || 0) + 1;
    kaydet();
    grupYayinla(grup.id);
    return jsonYaz(yanit, 200, { group: grupGorunumu(grup, izleyici) });
  }

  /* Telefon numaralarına davet oluştur */
  if (kalan === 'invites' && metot === 'POST') {
    const govde = await govdeOku(istek);
    const girdiler = Array.isArray(govde.phones) ? govde.phones : [govde.phone];
    const olusan = [];
    const atlanan = [];

    for (const girdi of girdiler.slice(0, 30)) {
      const telefon = telefonRakamlari(girdi);
      if (!telefonGecerli(telefon)) {
        atlanan.push({ phone: String(girdi || ''), reason: 'Geçersiz numara' });
        continue;
      }
      if ((grup.members || []).some((m) => telefonAnahtari(m.phone) === telefonAnahtari(telefon))) {
        atlanan.push({ phone: telefon, reason: 'Zaten üye' });
        continue;
      }

      let davet = (grup.invites || []).find(
        (i) => !i.acceptedAt && telefonAnahtari(i.phone) === telefonAnahtari(telefon)
      );
      if (!davet) {
        davet = {
          id: yeniId('inv'),
          name: temizAd(govde.name),
          phone: telefon,
          token: yeniToken(),
          at: simdi(),
          acceptedAt: null,
          memberId: null
        };
        grup.invites.push(davet);
        olayEkle(grup, 'invite-sent', 'Davet gönderildi: ' + telefon);
      }
      olusan.push(davet);
    }

    if (olusan.length) {
      grup.seq = (grup.seq || 0) + 1;
      kaydet();
      grupYayinla(grup.id);
    }

    return jsonYaz(yanit, 200, {
      invites: olusan.map((i) => ({
        id: i.id,
        name: i.name || '',
        phone: i.phone,
        token: i.token,
        at: i.at,
        acceptedAt: i.acceptedAt || null
      })),
      skipped: atlanan,
      group: grupGorunumu(grup, izleyici)
    });
  }

  const davetSilEslesme = kalan.match(/^invites\/([^/]+)$/);
  if (davetSilEslesme && metot === 'DELETE') {
    const davetId = decodeURIComponent(davetSilEslesme[1]);
    const once = (grup.invites || []).length;
    grup.invites = (grup.invites || []).filter((i) => i.id !== davetId);
    if (grup.invites.length === once) return jsonYaz(yanit, 404, { error: 'Davet bulunamadı' });
    grup.seq = (grup.seq || 0) + 1;
    kaydet();
    grupYayinla(grup.id);
    return jsonYaz(yanit, 200, { ok: true, group: grupGorunumu(grup, izleyici) });
  }

  /* Grubu dağıt */
  if (kalan === '' && metot === 'DELETE') {
    for (const istemci of Array.from(istemciler.get(grup.id) || [])) {
      sseYaz(istemci.res, 'deleted', {});
      istemciKapat(istemci);
    }
    istemciler.delete(grup.id);
    delete store.groups[grup.id];
    kaydet();
    return jsonYaz(yanit, 200, { ok: true });
  }

  /* Yer ekle */
  if (kalan === 'places' && metot === 'POST') {
    const govde = await govdeOku(istek);
    const ad = temizAd(govde.name) || 'Grup yeri';
    const lat = Number(govde.lat);
    const lng = Number(govde.lng);
    const kilitDakika = Math.max(0, Math.min(240, Math.floor(Number(govde.lockMinutes) || 0)));
    const molaDakika = Math.max(0, Math.min(60, Math.floor(Number(govde.breakMinutes) || 0)));

    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return jsonYaz(yanit, 400, { error: 'Geçerli bir konum gerekli' });
    }
    if ((grup.places || []).length >= 100) {
      return jsonYaz(yanit, 400, { error: 'En fazla 100 grup yeri eklenebilir' });
    }

    grup.places.push({
      id: yeniId('gp'),
      name: ad,
      lat,
      lng,
      lockMinutes: kilitDakika,
      breakMinutes: molaDakika,
      createdAt: simdi()
    });
    olayEkle(grup, 'place-added', 'Grup yeri eklendi: ' + ad);
    grup.seq = (grup.seq || 0) + 1;
    kaydet();
    grupYayinla(grup.id);
    return jsonYaz(yanit, 201, { group: grupGorunumu(grup, izleyici) });
  }

  /* Yer sil */
  const yerEslesme = kalan.match(/^places\/([^/]+)$/);
  if (yerEslesme && metot === 'DELETE') {
    const yerId = decodeURIComponent(yerEslesme[1]);
    const silinen = grup.places.find((p) => p.id === yerId);
    const once = grup.places.length;
    grup.places = grup.places.filter((p) => p.id !== yerId);
    if (grup.places.length === once) return jsonYaz(yanit, 404, { error: 'Yer bulunamadı' });
    olayEkle(grup, 'place-removed', 'Grup yeri silindi: ' + (silinen ? silinen.name : ''));
    grup.seq = (grup.seq || 0) + 1;
    kaydet();
    grupYayinla(grup.id);
    return jsonYaz(yanit, 200, { group: grupGorunumu(grup, izleyici) });
  }

  /* Uzaktan kilitle / aç */
  if ((kalan === 'lock' || kalan === 'unlock') && metot === 'POST') {
    const govde = await govdeOku(istek);
    const hedefId = govde.memberId ? String(govde.memberId) : null;
    const hedefler = hedefId
      ? grup.members.filter((m) => m.id === hedefId)
      : grup.members.slice();

    if (!hedefler.length) return jsonYaz(yanit, 404, { error: 'Üye bulunamadı' });

    const sira = (grup.seq || 0) + 1;
    grup.seq = sira;
    const mod = kalan === 'lock' ? 'lock' : 'unlock';

    for (const uye of hedefler) {
      uye.remote = { mode: mod, at: simdi(), seq: sira };
    }

    if (hedefId) {
      olayEkle(
        grup,
        mod === 'lock' ? 'remote-lock' : 'remote-unlock',
        'Yönetici ' + hedefler[0].name + (mod === 'lock' ? ' cihazını kilitledi' : ' kilidini açtı'),
        hedefler[0]
      );
    } else {
      olayEkle(
        grup,
        mod === 'lock' ? 'remote-lock-all' : 'remote-unlock-all',
        mod === 'lock' ? 'Yönetici tüm üyeleri kilitledi' : 'Yönetici tüm üyelerin kilidini açtı'
      );
    }

    kaydet();
    grupYayinla(grup.id);
    return jsonYaz(yanit, 200, {
      ok: true,
      affected: hedefler.length,
      group: grupGorunumu(grup, izleyici)
    });
  }

  /* Katılma isteğini onayla / reddet */
  const istekEslesme = kalan.match(/^requests\/([^/]+)\/(approve|reject)$/);
  if (istekEslesme && metot === 'POST') {
    const istekId = decodeURIComponent(istekEslesme[1]);
    const karar = istekEslesme[2];
    const istek = (grup.pending || []).find((r) => r.id === istekId);
    if (!istek) return jsonYaz(yanit, 404, { error: 'İstek bulunamadı' });

    grup.pending = grup.pending.filter((r) => r.id !== istekId);
    grup.joinResults = grup.joinResults || {};

    if (karar === 'reject') {
      grup.joinResults[istekId] = {
        status: 'rejected',
        requestToken: istek.requestToken,
        at: simdi()
      };
      grup.seq = (grup.seq || 0) + 1;
      kaydet();
      grupYayinla(grup.id);
      return jsonYaz(yanit, 200, { ok: true, status: 'rejected' });
    }

    if ((grup.members || []).some((m) => m.name.toLocaleLowerCase('tr-TR') === istek.name.toLocaleLowerCase('tr-TR'))) {
      return jsonYaz(yanit, 409, { error: 'Bu isimde bir üye zaten var' });
    }

    const uye = {
      id: yeniId('mem'),
      name: istek.name,
      phone: istek.phone || '',
      deviceId: istek.deviceId,
      token: yeniToken(),
      joinedAt: simdi(),
      lastSeen: simdi(),
      locked: false,
      placeId: null,
      placeName: '',
      shareLocation: true,
      location: null,
      remote: null
    };

    grup.members.push(uye);
    olayEkle(grup, 'member-joined', uye.name + ' gruba katıldı', uye);
    grup.joinResults[istekId] = {
      status: 'approved',
      requestToken: istek.requestToken,
      memberId: uye.id,
      at: simdi()
    };
    grup.seq = (grup.seq || 0) + 1;
    eskiIstekleriTemizle(grup);
    kaydet();
    grupYayinla(grup.id);

    return jsonYaz(yanit, 200, {
      ok: true,
      status: 'approved',
      member: { id: uye.id, name: uye.name },
      group: grupGorunumu(grup, izleyici)
    });
  }

  /* Üyeyi çıkar */
  const uyeEslesme = kalan.match(/^members\/([^/]+)$/);
  if (uyeEslesme && metot === 'DELETE') {
    const uyeId = decodeURIComponent(uyeEslesme[1]);
    const cikarilan = grup.members.find((m) => m.id === uyeId);
    const once = grup.members.length;
    grup.members = grup.members.filter((m) => m.id !== uyeId);
    if (grup.members.length === once) return jsonYaz(yanit, 404, { error: 'Üye bulunamadı' });
    olayEkle(grup, 'member-removed', 'Yönetici ' + (cikarilan ? cikarilan.name : 'üyeyi') + ' gruptan çıkardı', cikarilan);
    uyeyiBaglantidanCikar(grup.id, uyeId);
    grup.seq = (grup.seq || 0) + 1;
    kaydet();
    grupYayinla(grup.id);
    return jsonYaz(yanit, 200, { ok: true, group: grupGorunumu(grup, izleyici) });
  }

  return jsonYaz(yanit, 404, { error: 'Bulunamadı' });
}

/* Üye kendi durumunu bildirir; üye token'ı gerekir. */
async function uyeDurumuIsle(istek, yanit, grup, uyeId) {
  const url = new URL(istek.url, 'http://localhost');
  const token = tokenOku(istek, url);
  const izleyici = izleyiciBul(grup, token);

  if (!izleyici || izleyici.role !== 'member' || izleyici.member.id !== uyeId) {
    return jsonYaz(yanit, 403, { error: 'Yetki yok' });
  }

  const govde = await govdeOku(istek);
  const uye = izleyici.member;
  const oncekiKilitli = Boolean(uye.locked);
  const kilitli = Boolean(govde.locked);
  const yerId = govde.placeId ? String(govde.placeId).slice(0, 80) : null;
  const yerAdi = temizAd(govde.placeName, 60);
  const degisti = uye.locked !== kilitli || (uye.placeId || null) !== yerId || (uye.placeName || '') !== yerAdi;
  const paylas = govde.shareLocation !== false;
  const paylasDegisti = uye.shareLocation !== paylas;

  uye.locked = kilitli;
  uye.placeId = yerId;
  uye.placeName = yerAdi;
  uye.shareLocation = paylas;
  if (!paylas) uye.location = null;
  uye.lastSeen = simdi();

  if (degisti) {
    if (kilitli && !oncekiKilitli) {
      olayEkle(grup, 'member-locked', uye.name + ' kilitlendi' + (yerAdi ? ' · ' + yerAdi : ''), uye);
    } else if (!kilitli && oncekiKilitli) {
      olayEkle(grup, 'member-unlocked', uye.name + ' kilidini açtı', uye);
    }
  }
  if (paylasDegisti) {
    olayEkle(
      grup,
      'location-share',
      uye.name + (paylas ? ' konum paylaşımını açtı' : ' konum paylaşımını kapattı'),
      uye
    );
  }

  if (degisti || paylasDegisti) {
    grup.seq = (grup.seq || 0) + 1;
    grupYayinla(grup.id);
  }
  kaydet();

  return jsonYaz(yanit, 200, { ok: true });
}

async function uyeKonumIsle(istek, yanit, grup, uyeId) {
  const url = new URL(istek.url, 'http://localhost');
  const izleyici = izleyiciBul(grup, tokenOku(istek, url));

  if (!izleyici || izleyici.role !== 'member' || izleyici.member.id !== uyeId) {
    return jsonYaz(yanit, 403, { error: 'Yetki yok' });
  }

  const uye = izleyici.member;
  if (uye.shareLocation === false) {
    return jsonYaz(yanit, 403, { error: 'Konum paylaşımı kapalı' });
  }

  const govde = await govdeOku(istek);
  const lat = Number(govde.lat);
  const lng = Number(govde.lng);
  const dogruluk = Math.max(0, Number(govde.accuracy) || 0);

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return jsonYaz(yanit, 400, { error: 'Geçerli bir konum gerekli' });
  }

  const onceki = uye.location;
  const anlamli = !onceki ||
    Math.abs(onceki.lat - lat) > 0.0001 ||
    Math.abs(onceki.lng - lng) > 0.0001 ||
    simdi() - Number(onceki.at || 0) > 30000;

  uye.location = { lat, lng, accuracy: dogruluk, at: simdi() };
  uye.lastSeen = simdi();

  if (anlamli) {
    grup.seq = (grup.seq || 0) + 1;
    grupYayinla(grup.id);
  }
  kaydet();

  return jsonYaz(yanit, 200, { ok: true });
}

async function uyeAyrilIsle(istek, yanit, grup) {
  const url = new URL(istek.url, 'http://localhost');
  const izleyici = izleyiciBul(grup, tokenOku(istek, url));

  if (!izleyici || izleyici.role !== 'member') {
    return jsonYaz(yanit, 403, { error: 'Yetki yok' });
  }

  const uyeId = izleyici.member.id;
  olayEkle(grup, 'member-left', izleyici.member.name + ' gruptan ayrıldı', izleyici.member);
  grup.members = grup.members.filter((m) => m.id !== uyeId);
  uyeyiBaglantidanCikar(grup.id, uyeId);
  grup.seq = (grup.seq || 0) + 1;
  kaydet();
  grupYayinla(grup.id);
  return jsonYaz(yanit, 200, { ok: true });
}

/* ---------------- statik dosyalar ---------------- */

function guvenliYol(istekYolu) {
  let yol;
  try {
    yol = decodeURIComponent((istekYolu || '/').split('?')[0]);
  } catch {
    return null;
  }
  if (yol === '/') yol = '/index.html';

  const dosya = path.normalize(path.join(KOK, yol));
  const goreli = path.relative(KOK, dosya);
  if (goreli.startsWith('..') || path.isAbsolute(goreli)) return null;

  const goreliKucuk = goreli.toLowerCase();
  const kok = goreliKucuk.split(path.sep)[0];
  if (kok === 'data' || kok === 'certs' || kok === '.git' ||
      goreliKucuk === 'server.js' || goreliKucuk === '.gitignore') {
    return null;
  }
  return dosya;
}

function sunucuIsleyici(istek, yanit) {
  if (istek.url.startsWith('/api/')) {
    return apiIsle(istek, yanit).catch((hata) => {
      if (!yanit.headersSent) {
        jsonYaz(yanit, 400, { error: hata.message || 'İstek işlenemedi' });
      } else {
        try { yanit.end(); } catch {}
      }
    });
  }

  const dosya = guvenliYol(istek.url);

  if (!dosya) {
    yanit.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    return yanit.end('403 — Yasak');
  }

  fs.stat(dosya, (hata, bilgi) => {
    if (!hata && bilgi.isDirectory()) {
      return dosyaGonder(path.join(dosya, 'index.html'), yanit);
    }
    if (hata) {
      yanit.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return yanit.end('404 — Bulunamadı');
    }
    return dosyaGonder(dosya, yanit);
  });
}

function dosyaGonder(dosya, yanit) {
  fs.readFile(dosya, (hata, veri) => {
    if (hata) {
      yanit.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return yanit.end('404 — Bulunamadı');
    }

    const uzanti = path.extname(dosya).toLowerCase();
    const onbellek = ['.html', '.js', '.css', '.webmanifest'].includes(uzanti)
      ? 'no-cache'
      : 'public, max-age=86400';

    yanit.writeHead(200, {
      'Content-Type': MIME[uzanti] || 'application/octet-stream',
      'Cache-Control': onbellek,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer'
    });
    yanit.end(veri);
  });
}

function yerelAdresler() {
  const adresler = [];
  const arayuzler = os.networkInterfaces();
  for (const ad of Object.values(arayuzler)) {
    for (const bilgi of ad || []) {
      if (bilgi.family === 'IPv4' && !bilgi.internal) adresler.push(bilgi.address);
    }
  }
  return adresler;
}

function sertifikaBul() {
  const certKlasoru = path.join(KOK, 'certs');
  const pfx = path.join(certKlasoru, 'server.pfx');
  const anahtar = path.join(certKlasoru, 'server.key');
  const sertifika = path.join(certKlasoru, 'server.crt');

  if (fs.existsSync(pfx)) {
    let parola = '';
    const parolaDosyasi = path.join(certKlasoru, 'passphrase.txt');
    if (fs.existsSync(parolaDosyasi)) parola = fs.readFileSync(parolaDosyasi, 'utf8').trim();
    return { tip: 'pfx', pfx: fs.readFileSync(pfx), passphrase: parola };
  }
  if (fs.existsSync(anahtar) && fs.existsSync(sertifika)) {
    return { tip: 'pem', key: fs.readFileSync(anahtar), cert: fs.readFileSync(sertifika) };
  }
  return null;
}

function baslat(port, deneme = 0) {
  const sertifika = sertifikaBul();
  const guvenli = Boolean(sertifika);
  const sunucu = guvenli
    ? https.createServer({ ...sertifika }, sunucuIsleyici)
    : http.createServer(sunucuIsleyici);

  sunucu.on('error', (hata) => {
    if (hata.code === 'EADDRINUSE' && deneme < 10) {
      console.log(`[Alan Kilit] ${port} portu dolu, ${port + 1} deneniyor…`);
      baslat(port + 1, deneme + 1);
    } else {
      console.error('[Alan Kilit] Sunucu hatası:', hata.message);
    }
  });

  sunucu.listen(port, '0.0.0.0', () => {
    const sema = guvenli ? 'https' : 'http';
    const adresler = yerelAdresler();

    console.log('');
    console.log('  ==============================================');
    console.log('     Alan Kilit çalışıyor');
    console.log('  ==============================================');
    console.log(`     Bilgisayar : ${sema}://localhost:${port}`);
    adresler.forEach((adres) => {
      console.log(`     Telefon    : ${sema}://${adres}:${port}`);
    });
    console.log('');
    if (guvenli) {
      console.log('     HTTPS açık (certs klasörü bulundu).');
      console.log('     Telefonda sertifika uyarısını kabul etmen gerekebilir.');
    } else {
      console.log('     Not: Telefonda otomatik konum için HTTPS gerekir.');
      console.log('     Ayrıntılar README.md dosyasında.');
    }
    console.log('     Grup verileri: data/groups.json');
    console.log('     Durdurmak için: Ctrl+C');
    console.log('  ==============================================');
    console.log('');
  });
}

baslat(BASLANGIC_PORT);
