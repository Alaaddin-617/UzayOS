/* =========================================================
   uzayOS — UzayÇekirdek 1.0
   Çekirdek: pencere yöneticisi, görev sistemi, sanal dosya sistemi
   ========================================================= */
window.UzayOS = (() => {
  'use strict';

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const kaydetJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const yukleJSON = (k, y) => { try { const s = localStorage.getItem(k); return s ? JSON.parse(s) : y; } catch (e) { return y; } };

  /* ---------------- Sanal Dosya Sistemi ---------------- */
  const FS_ANAHTAR = 'uzayos-fs-v1';
  const norm = yol => {
    yol = (yol || '/').replace(/\/+/g, '/');
    if (!yol.startsWith('/')) yol = '/' + yol;
    if (yol.length > 1 && yol.endsWith('/')) yol = yol.slice(0, -1);
    return yol;
  };
  const varsayilanFS = {
    '/home/komutan/hosgeldin.txt':
      'Hoş geldin Komutan!\n\n' +
      'uzayOS sadece bu bilgisayar için tasarlandı:\n' +
      'Lenovo 81WB · i5-10210U · 12GB RAM · GeForce MX130\n\n' +
      'Komutlar için "Komutan Konsolu"nu aç ve "yardim" yaz.',
    '/home/komutan/notlar/ornek-not.txt':
      'Bu bir örnek nottur.\nYeni not oluşturduğunda sol listede belirir.',
    '/home/komutan/dersler/matematik.txt':
      'TÜREV: f(x) = x^n  →  f\'(x) = n·x^(n-1)\n' +
      'İNTEGRAL: ∫x^n dx = x^(n+1)/(n+1) + C\n' +
      'ÖZEL: ∫(1/x)dx = ln|x| + C\n' +
      'ZİNCİR KURALI: (f∘g)\' = f\'(g(x))·g\'(x)',
    '/home/komutan/dersler/fizik.txt':
      'NEWTON: F = m·a\n' +
      'KİNETİK ENERJİ: E_k = ½mv²\n' +
      'POTANSİYEL: E_p = m·g·h\n' +
      'OHM: V = I·R\n' +
      'IŞIK HIZI: c ≈ 300.000 km/s',
    '/ders/program.txt':
      'DERS PROGRAMI — HİBRİT MOD\n' +
      'Pazartesi : Matematik + 2048 (Yörünge)\n' +
      'Salı      : Fizik + Uzay Yılanı\n' +
      'Çarşamba  : Kimya + Mayın Tarlası\n' +
      'Perşembe  : Bilgisayar + Roket Kaçış\n' +
      'Cuma      : İngilizce + Serbest Oyun',
    '/sistem/cekirdek.txt':
      'uzayOS Çekirdek Sürüm 1.0 (UzayÇekirdek)\n' +
      'Çekirdek modu : Hafif (bu donanıma özel)\n' +
      'Görev profili : Ders + Oyun Hibrit\n' +
      'İstasyon      : Yörünge-1 · Yedekleme: Yıldız Bulutu',
    '/sistem/donanim.txt':
      'İşlemci    : Intel Core i5-10210U (4 çekirdek / 8 iş parçacığı) @ 1.60GHz\n' +
      'Bellek     : 12 GB DDR4\n' +
      'GPU        : Intel UHD Graphics + NVIDIA GeForce MX130 2GB\n' +
      'Depolama   : 256 GB NVMe SSD (Toshiba KBG40ZNT256G)\n' +
      'Ekran      : 1920×1080\n' +
      'Gövde      : Lenovo 81WB ( IdeaPad )',
    '/gunluk/not.txt':
      'Görev günlüğü burada tutulur.\nTerminalde "gorevler" yazarak görebilirsin.'
  };
  let fsVeri = yukleJSON(FS_ANAHTAR, null) || { ...varsayilanFS };
  const fsKaydet = () => kaydetJSON(FS_ANAHTAR, fsVeri);
  const fs = {
    oku: yol => Object.prototype.hasOwnProperty.call(fsVeri, norm(yol)) ? fsVeri[norm(yol)] : null,
    yaz: (yol, icerik) => { fsVeri[norm(yol)] = String(icerik); fsKaydet(); },
    sil: yol => { delete fsVeri[norm(yol)]; fsKaydet(); },
    liste: yol => {
      const p = norm(yol), onek = p === '/' ? '/' : p + '/';
      const kume = new Set();
      for (const k of Object.keys(fsVeri)) {
        if (!k.startsWith(onek)) continue;
        const kalan = k.slice(onek.length);
        if (!kalan) continue;
        const ilk = kalan.split('/')[0];
        kume.add(kalan.includes('/') ? ilk + '/' : ilk);
      }
      return [...kume].sort();
    }
  };

  /* ---------------- Uzay Görevleri ---------------- */
  const GOREV_ANAHTAR = 'uzayos-gorev-v1';
  const varsayilanGorev = {
    bitti: {}, acilan: [], dersUyg: [], oyunUyg: [],
    terminalKomut: 0, notKayit: false, pomoBitti: false, mayinKazan: false,
    yilanEn: 0, k2048En: 0, roketEn: 0, testSkor: 0, boot: false, gunluk: []
  };
  let gSt = yukleJSON(GOREV_ANAHTAR, null) || JSON.parse(JSON.stringify(varsayilanGorev));
  gSt.gunluk = gSt.gunluk || [];

  const GOREVLER = [
    { id: 'ilk',    ikon: '🚀', ad: 'Sistemi İlk Açış',  yakit: 10, aciklama: 'uzayOS çekirdeğini başlat.',                    kontrol: s => !!s.boot },
    { id: 'kesif',  ikon: '🔭', ad: 'Keşif Görevi',      yakit: 15, aciklama: '3 farklı uygulama aç.',                         kontrol: s => s.acilan.length >= 3 },
    { id: 'ders1',  ikon: '📚', ad: 'Ders Modu Aktif',   yakit: 15, aciklama: '2 farklı ders uygulaması kullan.',              kontrol: s => s.dersUyg.length >= 2 },
    { id: 'ders4',  ikon: '🎓', ad: 'Uzay Akademisi',    yakit: 30, aciklama: '4 farklı ders uygulamasını kullan.',            kontrol: s => s.dersUyg.length >= 4 },
    { id: 'konsol', ikon: '⌨️', ad: 'Komutan Konsolu', yakit: 15, aciklama: 'Terminalde 5 komut çalıştır.',              kontrol: s => s.terminalKomut >= 5 },
    { id: 'not',    ikon: '📝', ad: 'Görev Notu',        yakit: 10, aciklama: 'Notlar uygulamasına bir not kaydet.',           kontrol: s => !!s.notKayit },
    { id: 'test',   ikon: '🧠', ad: 'Bilgi Avcısı',      yakit: 20, aciklama: 'Bilgi testinde en az 7 doğru yap.',             kontrol: s => s.testSkor >= 7 },
    { id: 'pomo',   ikon: '⏳', ad: 'Odak Görevi',       yakit: 20, aciklama: 'Bir Pomodoro oturumunu tamamla.',               kontrol: s => !!s.pomoBitti },
    { id: 'oyun',   ikon: '🎮', ad: 'Oyun Zamanı',       yakit: 10, aciklama: 'Herhangi bir oyunu başlat.',                    kontrol: s => s.oyunUyg.length >= 1 },
    { id: 'yilan',  ikon: '🐍', ad: 'Yılan Ustası', yakit: 25, aciklama: 'Uzay Yılanı oyununda 50 puana ulaş.',       kontrol: s => s.yilanEn >= 50 },
    { id: 'k2048',  ikon: '🧱', ad: 'Yörünge 2048',      yakit: 25, aciklama: '2048 oyununda 1024 karosu yap.',   kontrol: s => s.k2048En >= 1024 },
    { id: 'mayin',  ikon: '💣', ad: 'Mayın Temizleyici', yakit: 25, aciklama: 'Mayın Tarlası oyununu kazan.',            kontrol: s => !!s.mayinKazan },
    { id: 'roket',  ikon: '🛰️', ad: 'Roket Kaçışçı', yakit: 20, aciklama: 'Roket Kaçış oyununda 100 metreye ulaş.',   kontrol: s => s.roketEn >= 100 }
  ];

  const gorevKaydet = () => kaydetJSON(GOREV_ANAHTAR, gSt);
  const yakitToplam = () => GOREVLER.reduce((t, g) => t + (gSt.bitti[g.id] ? g.yakit : 0), 0);

  function gorevGunluk(metin) {
    const d = new Date();
    const zs = d.toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    gSt.gunluk.unshift(`${zs} — ${metin}`);
    gSt.gunluk = gSt.gunluk.slice(0, 40);
  }

  const gorevSinyali = () => document.dispatchEvent(new CustomEvent('uzayos:gorev'));

  function gorevKontrol() {
    let yeni = false;
    for (const g of GOREVLER) {
      if (!gSt.bitti[g.id] && g.kontrol(gSt)) {
        gSt.bitti[g.id] = true; yeni = true;
        gorevGunluk(`🏁 ${g.ad} (+${g.yakit} yakıt)`);
        bildir(`🏁 Görev tamam: <b>${g.ad}</b> <span class="yakit-art">+${g.yakit} yakıt</span>`, g.ikon);
        yakitGuncelle();
      }
    }
    if (yeni) { gorevKaydet(); gorevSinyali(); }
  }

  const gorev = {
    get durum() { return gSt; },
    liste: GOREVLER,
    yakitToplam,
    uygulama(app) {
      if (!gSt.acilan.includes(app.id)) gSt.acilan.push(app.id);
      if (app.kategori === 'ders' && !gSt.dersUyg.includes(app.id)) gSt.dersUyg.push(app.id);
      if (app.kategori === 'oyun' && !gSt.oyunUyg.includes(app.id)) gSt.oyunUyg.push(app.id);
      gorevKaydet(); gorevKontrol();
    },
    artir(anahtar, n = 1) { gSt[anahtar] = (gSt[anahtar] || 0) + n; gorevKaydet(); gorevKontrol(); },
    isaretle(anahtar, deger = true) { gSt[anahtar] = deger; gorevKaydet(); gorevKontrol(); },
    rekor(anahtar, deger) {
      if (deger > (gSt[anahtar] || 0)) { gSt[anahtar] = deger; gorevKaydet(); gorevKontrol(); return true; }
      return false;
    },
    sifirla() {
      gSt = JSON.parse(JSON.stringify(varsayilanGorev));
      gorevKaydet(); gorevSinyali(); yakitGuncelle();
      bildir('Görevler sıfırlandı. Yeni görevler seni bekliyor!', '🌌');
    }
  };

  /* ---------------- Bildirim (toast) ---------------- */
  function bildir(html, ikon = '🛸') {
    const kutu = $('#bildirimler');
    if (!kutu) return;
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `<span class="toast-ikon">${ikon}</span><span class="toast-metin">${html}</span>`;
    kutu.appendChild(el);
    requestAnimationFrame(() => el.classList.add('goster'));
    setTimeout(() => { el.classList.remove('goster'); setTimeout(() => el.remove(), 450); }, 3800);
  }

  /* ---------------- Pencere Yöneticisi ---------------- */
  const uygulamalar = {};
  const pencereler = new Map();
  let zSayac = 100, sayac = 0;

  const uygulamaKaydet = app => { uygulamalar[app.id] = app; };
  const uygulamaListe = () => Object.values(uygulamalar);

  function uygulamaAc(id) {
    const app = uygulamalar[id];
    if (!app) { bildir(`Uygulama bulunamadı: ${id}`, '⚠️'); return null; }
    return pencereAc(app);
  }

  function odakVer(el) {
    $$('.pencere').forEach(w => { w.dataset.odak = '0'; w.classList.add('arka'); });
    el.dataset.odak = '1';
    el.classList.remove('arka');
    el.style.zIndex = ++zSayac;
    taskbarGuncelle();
  }

  function pencereAc(app) {
    for (const p of pencereler.values()) {
      if (p.app.id === app.id) {
        if (p.min) { p.min = false; p.el.classList.remove('gizli'); }
        odakVer(p.el);
        return p.el;
      }
    }
    const genislik = Math.min(app.varsayilan?.g ?? 620, innerWidth - 30);
    const yukseklik = Math.min(app.varsayilan?.y ?? 440, innerHeight - 90);
    const el = document.createElement('div');
    el.className = 'pencere';
    el.dataset.odak = '1';
    const kay = (sayac % 7);
    el.style.width = genislik + 'px';
    el.style.height = yukseklik + 'px';
    el.style.left = Math.max(8, 70 + kay * 32) + 'px';
    el.style.top = Math.max(8, 26 + kay * 26) + 'px';
    el.style.zIndex = ++zSayac;
    el.innerHTML = `
      <div class="baslik-cubugu">
        <span class="win-ikon">${app.ikon}</span>
        <span class="win-baslik">${app.ad}</span>
        <span class="kontroller">
          <button class="wc" data-e="min" title="Küçült">–</button>
          <button class="wc" data-e="max" title="Büyüt / Geri Al">▢</button>
          <button class="wc kapat" data-e="kapat" title="Kapat">✕</button>
        </span>
      </div>
      <div class="icerik"></div>`;
    $('#pencereler').appendChild(el);
    const kayit = { el, app, min: false, temizle: null };
    pencereler.set(app.id, kayit);
    sayac++;

    el.addEventListener('pointerdown', () => odakVer(el));
    const tb = el.querySelector('.baslik-cubugu');
    tb.addEventListener('pointerdown', e => { if (!e.target.closest('.wc')) surukle(el, e); });
    tb.addEventListener('dblclick', e => { if (!e.target.closest('.wc')) genislet(el); });

    el.querySelectorAll('.wc').forEach(b => b.addEventListener('click', ev => {
      ev.stopPropagation();
      const e = b.dataset.e;
      if (e === 'kapat') pencereKapat(app.id);
      else if (e === 'min') { kayit.min = true; el.classList.add('gizli'); taskbarGuncelle(); }
      else if (e === 'max') genislet(el);
    }));

    const sonuc = app.kur ? app.kur(el.querySelector('.icerik'), el) : null;
    if (typeof sonuc === 'function') kayit.temizle = sonuc;

    gorev.uygulama(app);
    gorevSinyali();
    taskbarGuncelle();
    return el;
  }

  function pencereKapat(id) {
    const p = pencereler.get(id);
    if (!p) return;
    try { if (p.temizle) p.temizle(); } catch (e) {}
    p.el.remove();
    pencereler.delete(id);
    taskbarGuncelle();
    gorevSinyali();
  }

  function tumPencereleriKapat() {
    for (const id of [...pencereler.keys()]) pencereKapat(id);
  }

  function genislet(el) {
    if (el.dataset.genis === '1') {
      const r = JSON.parse(el.dataset.onceki || '{}');
      el.classList.remove('genis');
      el.dataset.genis = '0';
      if (r.left != null) { el.style.left = r.left; el.style.top = r.top; el.style.width = r.width; el.style.height = r.height; }
    } else {
      el.dataset.onceki = JSON.stringify({ left: el.style.left, top: el.style.top, width: el.style.width, height: el.style.height });
      el.dataset.genis = '1';
      el.classList.add('genis');
    }
  }

  function surukle(el, e) {
    if (el.dataset.genis === '1') return;
    odakVer(el);
    const sx = e.clientX, sy = e.clientY;
    const r = el.getBoundingClientRect();
    const move = ev => {
      let nl = r.left + ev.clientX - sx;
      let nt = r.top + ev.clientY - sy;
      nt = Math.max(0, Math.min(innerHeight - 80, nt));
      nl = Math.max(-r.width + 100, Math.min(innerWidth - 100, nl));
      el.style.left = nl + 'px';
      el.style.top = nt + 'px';
    };
    const up = () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  }

  /* ---------------- Görev Çubuğu ---------------- */
  function taskbarGuncelle() {
    const alan = $('#acik-uygulamalar');
    if (!alan) return;
    alan.innerHTML = '';
    for (const [, p] of pencereler) {
      const b = document.createElement('button');
      b.className = 'tb-uyg' + (p.el.dataset.odak === '1' && !p.min ? ' aktif' : '');
      b.innerHTML = `<span>${p.app.ikon}</span><span class="tb-ad">${p.app.ad}</span>`;
      b.title = p.app.ad;
      b.addEventListener('click', () => {
        if (p.min) { p.min = false; p.el.classList.remove('gizli'); odakVer(p.el); }
        else if (p.el.dataset.odak === '1') { p.min = true; p.el.classList.add('gizli'); taskbarGuncelle(); }
        else odakVer(p.el);
      });
      alan.appendChild(b);
    }
    yakitGuncelle();
  }

  function yakitGuncelle() {
    const e = $('#yakit');
    if (e) e.innerHTML = `⛽ Yakıt <b>${yakitToplam()}</b>`;
  }

  /* ---------------- Görev Merkezi (başlat menüsü) ---------------- */
  function menuKur() {
    const menu = $('#merkez-menu');
    const kategoriler = [
      ['ders', '📚 DERS ARAÇLARI'],
      ['oyun', '🎮 OYUNLAR'],
      ['sistem', '🛰️ SİSTEM']
    ];
    let html = `<div class="menu-baslik">🚀 GÖREV MERKEZİ</div><div class="menu-govde">`;
    for (const [kat, ad] of kategoriler) {
      html += `<div class="menu-grup">${ad}</div><div class="menu-izgara">`;
      for (const app of uygulamaListe()) {
        if (app.kategori !== kat) continue;
        html += `<button class="menu-app" data-id="${app.id}"><span class="menu-ikon">${app.ikon}</span><span>${app.ad}</span></button>`;
      }
      html += `</div>`;
    }
    html += `</div><div class="menu-alt">
      <button id="yeniden-baslat">🔄 Yeniden Başlat</button>
      <span class="menu-surum">uzayOS 1.0 · UzayÇekirdek</span>
    </div>`;
    menu.innerHTML = html;
    menu.addEventListener('click', e => {
      const b = e.target.closest('.menu-app');
      if (b) { uygulamaAc(b.dataset.id); menuKapat(); }
    });
    $('#yeniden-baslat').addEventListener('click', () => {
      menuKapat();
      document.dispatchEvent(new CustomEvent('uzayos:yeniden-baslat'));
    });
    $('#baslat-btn').addEventListener('click', e => { e.stopPropagation(); menu.classList.toggle('acik'); });
    document.addEventListener('click', e => {
      if (!e.target.closest('#merkez-menu') && !e.target.closest('#baslat-btn')) menuKapat();
    });
  }
  const menuKapat = () => $('#merkez-menu').classList.remove('acik');

  /* ---------------- Uzay zamanı & saat ---------------- */
  function uzayZamani() {
    const d = new Date();
    const yilBas = new Date(d.getFullYear(), 0, 0);
    const gun = Math.floor((d - yilBas) / 86400000);
    const kesir = ((d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()) / 864000).toFixed(4);
    return `${d.getFullYear()}.${String(gun).padStart(3, '0')}·${kesir}`;
  }

  function saatBaslat() {
    const c = $('#saat');
    const w = $('#widget');
    const guncelle = () => {
      const d = new Date();
      c.innerHTML = `<b>${d.toLocaleTimeString('tr-TR')}</b><span>${d.toLocaleDateString('tr-TR', { weekday: 'short', day: '2-digit', month: '2-digit' })} · YZ ${uzayZamani()}</span>`;
      if (w) {
        w.querySelector('.w-tarih').textContent = d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
        w.querySelector('.w-yz').textContent = 'Yıldız Zamanı ' + uzayZamani();
      }
    };
    guncelle();
    const t = setInterval(guncelle, 1000);
    return () => clearInterval(t);
  }

  function widgetGuncelle() {
    const w = $('#widget');
    if (!w) return;
    const toplam = GOREVLER.length;
    const biten = GOREVLER.filter(g => gSt.bitti[g.id]).length;
    w.querySelector('.w-bar i').style.width = (biten / toplam * 100) + '%';
    w.querySelector('.w-sayi').textContent = `${biten}/${toplam}`;
  }
  document.addEventListener('uzayos:gorev', widgetGuncelle);

  /* ---------------- Dışa aktarım ---------------- */
  return {
    fs, gorev, gorevler: GOREVLER, bildir,
    uygulamaKaydet, uygulamaListe, uygulamaAc,
    pencereAc, pencereKapat, tumPencereleriKapat,
    pencereSayisi: () => pencereler.size,
    menuKur, menuKapat, saatBaslat, uzayZamani,
    acilisZamani: Date.now(), $, $$
  };
})();
