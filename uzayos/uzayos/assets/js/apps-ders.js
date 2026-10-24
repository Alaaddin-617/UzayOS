/* =========================================================
   uzayOS — Ders Uygulamaları
   Komutan Konsolu · Görev Notları · Hesap Makinesi ·
   Birim Dönüştürücü · Bilgi Testi · Pomodoro ·
   Sistem Monitörü · Uzay Görevleri
   ========================================================= */
(() => {
  'use strict';
  const OS = window.UzayOS;
  const kacir = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  /* ================= KOMUTAN KONSOLU (terminal) ================= */
  OS.uygulamaKaydet({
    id: 'terminal', ad: 'Komutan Konsolu', ikon: '⌨️', kategori: 'ders',
    varsayilan: { g: 700, y: 440 },
    kur(icerik) {
      icerik.innerHTML = `
        <div class="term">
          <div class="term-cikti"></div>
          <div class="term-giris">
            <span class="term-ps1">komutan@uzayos:~$</span>
            <input class="term-input" spellcheck="false" autocomplete="off" autofocus>
          </div>
        </div>`;
      const cikti = icerik.querySelector('.term-cikti');
      const input = icerik.querySelector('.term-input');
      const ps1 = icerik.querySelector('.term-ps1');
      let cwd = '/home/komutan';
      const gecmis = [];
      let gecmisI = -1;

      const yaz = (m, sinif = '') => {
        const d = document.createElement('div');
        d.className = 'term-satir ' + sinif;
        d.innerHTML = m;
        cikti.appendChild(d);
        cikti.scrollTop = cikti.scrollHeight;
      };

      const coz = yol => {
        if (yol === '~') return '/home/komutan';
        let p = yol.startsWith('/') ? yol : cwd + '/' + yol;
        const parca = [];
        for (const k of p.split('/')) { if (!k || k === '.') continue; if (k === '..') parca.pop(); else parca.push(k); }
        return '/' + parca.join('/');
      };
      const gosterYol = y => y === '/home/komutan' ? '~' : y.startsWith('/home/komutan/') ? '~' + y.slice(14) : y;
      const ps1Guncelle = () => { ps1.textContent = `komutan@uzayos:${gosterYol(cwd)}$`; };

      const MOTD = [
        '🌌 Yıldızlara bak, Komutan — her biri bir görev.',
        '🛰️ Yörünge-1 istasyonu seni izliyor.',
        '🪐 Bugün gezegen keşfi için harika bir gün.',
        '☄️ Kuyruklu yıldız raporları temiz.',
        '⭐ Yakıt depoları dolu, ders ve oyun için hazır.'
      ];

      const komutlar = {
        yardim: {
          aciklama: 'Tüm komutları listeler',
          calistir() {
            yaz('<span class="bilgi">KOMUT LİSTESİ</span>');
            for (const [ad, k] of Object.entries(komutlar)) yaz(`  ${ad.padEnd(12)} ${k.aciklama}`);
          }
        },
        sistem: {
          aciklama: 'Donanım bilgilerini gösterir',
          calistir() {
            yaz('<span class="bilgi">SİSTEM: Lenovo 81WB — uzayOS donanım profili</span>');
            yaz('İşlemci    : Intel Core i5-10210U (4 çekirdek / 8 iş parçacığı) @ 1.60GHz');
            yaz('Bellek     : 12 GB DDR4');
            yaz('GPU        : Intel UHD Graphics + NVIDIA GeForce MX130 2GB');
            yaz('Depolama   : 256 GB NVMe SSD (Toshiba KBG40ZNT256G)');
            yaz('Ekran      : 1920×1080');
            yaz(`Çekirdek   : UzayÇekirdek 1.0 — Hafif mod aktif`);
            yaz(`Tarayıcı işlemci kanalı: ${navigator.hardwareConcurrency || 'bilinmiyor'} mantıksal çekirdek`, 'basari');
          }
        },
        tarih: { aciklama: 'Bugünün tarihini gösterir', calistir: () => yaz(new Date().toLocaleDateString('tr-TR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }), 'basari') },
        saat: { aciklama: 'Saat ve yıldız zamanı', calistir: () => yaz(`${new Date().toLocaleTimeString('tr-TR')} · Yıldız Zamanı: ${OS.uzayZamani()}`, 'basari') },
        uzayzaman: { aciklama: 'Yıldız zamanını gösterir', calistir: () => yaz('YZ ' + OS.uzayZamani(), 'basari') },
        pwd: { aciklama: 'Bulunduğun dizini gösterir', calistir: () => yaz(cwd) },
        kim: { aciklama: 'Kim olduğunu söyler', calistir: () => yaz('Komutan — uzayOS Yörünge-1 İstasyonu Sorumlusu', 'basari') },
        motd: { aciklama: 'Günün mesajı', calistir: () => yaz(MOTD[Math.floor(Math.random() * MOTD.length)], 'bilgi') },
        hakkimizda: {
          aciklama: 'uzayOS hakkında',
          calistir() {
            yaz('<span class="bilgi">uzayOS 1.0 — UzayÇekirdek</span>');
            yaz('Ders ve oyun için tasarlanmış hafif uzay temelli işletim sistemi.');
            yaz('Bu donanıma özel: i5-10210U · 12GB · MX130 → Hafif Çekirdek modu.');
          }
        },
        ls: {
          aciklama: 'Dizindeki dosyaları listeler: ls [dizin]',
          calistir(a) {
            const yol = a[0] ? coz(a[0]) : cwd;
            const liste = OS.fs.liste(yol);
            if (!liste.length) { yaz('(boş dizin)'); return; }
            yaz(liste.map(e => e.endsWith('/') ? `<span class="bilgi">${e}</span>` : e).join('   '));
          }
        },
        cd: {
          aciklama: 'Dizin değiştir: cd <dizin>',
          calistir(a) {
            const yol = coz(a[0] || '~');
            if (OS.fs.liste(yol).length || yol === '/' || OS.fs.oku(yol) !== null) { cwd = yol; ps1Guncelle(); }
            else yaz(`cd: dizin yok: ${a[0]}`, 'hata');
          }
        },
        cat: {
          aciklama: 'Dosya içeriğini göster: cat <dosya>',
          calistir(a) {
            if (!a[0]) { yaz('cat: dosya adı gerekli', 'hata'); return; }
            const icerik = OS.fs.oku(coz(a[0]));
            if (icerik === null) yaz(`cat: dosya yok: ${a[0]}`, 'hata');
            else yaz(kacir(icerik));
          }
        },
        echo: { aciklama: 'Metin yazdır: echo <metin>', calistir: (a) => yaz(kacir(a.join(' '))) },
        yaz: {
          aciklama: 'Dosyaya yazar: yaz <dosya> <metin>',
          calistir(a) {
            if (a.length < 2) { yaz('kullanım: yaz <dosya> <metin>', 'hata'); return; }
            OS.fs.yaz(coz(a[0]), a.slice(1).join(' '));
            yaz(`✓ ${a[0]} dosyasına yazıldı.`, 'basari');
          }
        },
        sil: {
          aciklama: 'Dosya siler: sil <dosya>',
          calistir(a) {
            if (!a[0]) { yaz('sil: dosya adı gerekli', 'hata'); return; }
            if (OS.fs.oku(coz(a[0])) === null) { yaz(`sil: dosya yok: ${a[0]}`, 'hata'); return; }
            OS.fs.sil(coz(a[0]));
            yaz(`✓ ${a[0]} silindi.`, 'basari');
          }
        },
        temizle: { aciklama: 'Ekranı temizler', calistir: () => { cikti.innerHTML = ''; } },
        uygulamalar: {
          aciklama: 'Kurulu uygulamaları listeler',
          calistir() {
            yaz('<span class="bilgi">KURULU UYGULAMALAR</span>');
            for (const app of OS.uygulamaListe()) yaz(`  ${app.id.padEnd(10)} ${app.ikon} ${app.ad}  [${app.kategori}]`);
          }
        },
        baslat: {
          aciklama: 'Uygulama başlat: baslat <id>',
          calistir(a) {
            if (!a[0]) { yaz('kullanım: baslat <uygulama-id>', 'hata'); return; }
            const el = OS.uygulamaAc(a[0]);
            if (el) yaz(`✓ ${a[0]} başlatıldı.`, 'basari');
          }
        },
        gorevler: {
          aciklama: 'Uzay görevlerini listeler',
          calistir() {
            yaz('<span class="bilgi">UZAY GÖREVLERİ</span>');
            for (const g of OS.gorevler) {
              const durum = OS.gorev.durum.bitti[g.id] ? '<span class="basari">✔</span>' : '<span class="hata">✘</span>';
              yaz(`  ${durum} ${g.ikon} ${g.ad.padEnd(22)} +${g.yakit} yakıt`);
            }
            yaz(`<span class="basari">Toplam yakıt: ${OS.gorev.yakitToplam()}</span>`);
          }
        },
        yakit: { aciklama: 'Roket yakıtını gösterir', calistir: () => yaz(`⛽ Roket yakıtı: ${OS.gorev.yakitToplam()}`, 'basari') },
        kapat: { aciklama: 'Bu konsolu kapatır', calistir: () => OS.pencereKapat('terminal') }
      };

      const calistir = ham => {
        const parca = ham.trim().split(/\s+/);
        const ad = (parca[0] || '').toLowerCase();
        const args = parca.slice(1);
        yaz(`<span class="basari">komutan@uzayos:${gosterYol(cwd)}$</span> ${kacir(ham)}`);
        if (!ad) return;
        if (komutlar[ad]) komutlar[ad].calistir(args);
        else yaz(`${ad}: komut bulunamadı — "yardim" dene`, 'hata');
        OS.gorev.artir('terminalKomut');
      };

      yaz('<span class="bilgi">uzayOS Komutan Konsolu — UzayÇekirdek 1.0</span>');
      yaz('Komut yaz ve Enter\'a bas. Başlamak için: <span class="basari">yardim</span>');
      yaz(' ');

      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          const ham = input.value;
          if (ham.trim()) { gecmis.push(ham.trim()); if (gecmis.length > 50) gecmis.shift(); }
          calistir(ham);
          input.value = '';
          gecmisI = -1;
        }
        else if (e.key === 'ArrowUp') {
          e.preventDefault();
          if (gecmis.length) { gecmisI = Math.min(gecmisI + 1, gecmis.length - 1); input.value = gecmis[gecmis.length - 1 - gecmisI]; }
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          if (gecmisI > 0) { gecmisI--; input.value = gecmis[gecmis.length - 1 - gecmisI]; }
          else { gecmisI = -1; input.value = ''; }
        }
      });
      icerik.addEventListener('click', () => input.focus());
      setTimeout(() => input.focus(), 60);
    }
  });

  /* ================= GÖREV NOTLARI ================= */
  OS.uygulamaKaydet({
    id: 'notlar', ad: 'Görev Notları', ikon: '📝', kategori: 'ders',
    varsayilan: { g: 740, y: 480 },
    kur(icerik) {
      const DIZIN = '/home/komutan/notlar';
      icerik.innerHTML = `
        <div class="notlar">
          <aside class="not-liste">
            <button class="dugme btn-yeni">＋ Yeni Not</button>
            <ul></ul>
          </aside>
          <section class="not-editor">
            <input class="not-baslik" placeholder="Not başlığı">
            <textarea class="not-govde" placeholder="Notunu buraya yaz... (Ctrl+S ile kaydet)"></textarea>
            <div class="not-alt">
              <span class="not-durum">Kaydedilmedi</span>
              <button class="dugme btn-kaydet">💾 Kaydet</button>
            </div>
          </section>
        </div>`;
      const liste = icerik.querySelector('.not-liste ul');
      const baslik = icerik.querySelector('.not-baslik');
      const govde = icerik.querySelector('.not-govde');
      const durum = icerik.querySelector('.not-durum');
      let secili = null;

      const dosyalariListele = () => {
        liste.innerHTML = '';
        const dosyalar = OS.fs.liste(DIZIN).filter(d => !d.endsWith('/'));
        for (const d of dosyalar) {
          const li = document.createElement('li');
          li.textContent = d.replace('.txt', '');
          li.dataset.dosya = d;
          if (secili === d) li.classList.add('secili');
          li.addEventListener('click', () => yukle(d));
          liste.appendChild(li);
        }
        if (!dosyalar.length) liste.innerHTML = '<li style="color:#8fa3d9">Henüz not yok</li>';
      };

      const yukle = ad => {
        secili = ad;
        baslik.value = ad.replace('.txt', '');
        govde.value = OS.fs.oku(`${DIZIN}/${ad}`) || '';
        durum.textContent = 'Yüklendi · ' + ad;
        dosyalariListele();
      };

      const kaydet = () => {
        if (!secili) return;
        const yeniAd = (baslik.value.trim() || 'adsiz-not') + '.txt';
        const eskiAd = secili;
        const govdeDeger = govde.value;
        if (yeniAd !== eskiAd) OS.fs.sil(`${DIZIN}/${eskiAd}`);
        OS.fs.yaz(`${DIZIN}/${yeniAd}`, govdeDeger);
        secili = yeniAd;
        durum.textContent = '💾 Kaydedildi · ' + yeniAd;
        durum.style.color = '#52ffa8';
        setTimeout(() => { durum.style.color = ''; }, 1500);
        OS.gorev.isaretle('notKayit', true);
        dosyalariListele();
      };

      icerik.querySelector('.btn-yeni').addEventListener('click', () => {
        const ad = (prompt('Yeni notun adı:', 'yeni-gorev-notu') || '').trim();
        if (!ad) return;
        OS.fs.yaz(`${DIZIN}/${ad}.txt`, '');
        yukle(ad + '.txt');
      });
      icerik.querySelector('.btn-kaydet').addEventListener('click', kaydet);
      govde.addEventListener('keydown', e => { if (e.ctrlKey && e.key.toLowerCase() === 's') { e.preventDefault(); kaydet(); } });

      dosyalariListele();
      const ilk = OS.fs.liste(DIZIN).filter(d => !d.endsWith('/'))[0];
      if (ilk) yukle(ilk);
    }
  });

  /* ================= HESAP MAKİNESİ ================= */
  OS.uygulamaKaydet({
    id: 'hesap', ad: 'Hesap Makinesi', ikon: '🧮', kategori: 'ders',
    varsayilan: { g: 380, y: 520 },
    kur(icerik) {
      icerik.innerHTML = `
        <div class="hesap">
          <div class="hesap-ekran">
            <div class="hesap-ifade">&nbsp;</div>
            <div class="hesap-sonuc">0</div>
          </div>
          <div class="hesap-tuslar">
            <button class="sifirla" data-t="C">C</button><button data-t="(">(</button><button data-t=")">)</button><button class="op" data-t="⌫">⌫</button>
            <button data-t="7">7</button><button data-t="8">8</button><button data-t="9">9</button><button class="op" data-t="/">÷</button>
            <button data-t="4">4</button><button data-t="5">5</button><button data-t="6">6</button><button class="op" data-t="*">×</button>
            <button data-t="1">1</button><button data-t="2">2</button><button data-t="3">3</button><button class="op" data-t="-">−</button>
            <button data-t="0">0</button><button data-t=".">.</button><button class="op" data-t="%">%</button><button class="op" data-t="+">+</button>
            <button class="esit" data-t="=">=</button>
          </div>
        </div>`;
      const ifadeEl = icerik.querySelector('.hesap-ifade');
      const sonucEl = icerik.querySelector('.hesap-sonuc');
      let ifade = '';
      let sonIsaret = false;

      const goster = () => {
        ifadeEl.textContent = ifade.replace(/\//g, '÷').replace(/\*/g, '×').replace(/-/g, '−') || ' ';
      };
      const hesapla = () => {
        if (!ifade.trim()) return;
        if (!/^[0-9+\-*/.()%\s]+$/.test(ifade)) { sonucEl.textContent = 'HATA'; return; }
        try {
          const v = Function('"use strict";return (' + ifade.replace(/%/g, '/100') + ')')();
          if (v === undefined || !isFinite(v)) { sonucEl.textContent = 'HATA'; return; }
          const yuvarli = Math.round(v * 1e10) / 1e10;
          sonucEl.textContent = yuvarli;
          ifade = String(yuvarli);
          goster();
          sonIsaret = true;
        } catch (e) { sonucEl.textContent = 'HATA'; }
      };

      icerik.querySelector('.hesap-tuslar').addEventListener('click', e => {
        const b = e.target.closest('button');
        if (!b) return;
        const t = b.dataset.t;
        if (t === 'C') { ifade = ''; sonucEl.textContent = '0'; goster(); return; }
        if (t === '⌫') { ifade = ifade.slice(0, -1); goster(); return; }
        if (t === '=') { hesapla(); return; }
        if (sonIsaret && /[0-9.]/.test(t)) { ifade = ''; sonucEl.textContent = '0'; sonIsaret = false; }
        if (sonIsaret && /[+\-*/]/.test(t)) sonIsaret = false;
        ifade += t;
        goster();
      });
    }
  });

  /* ================= BİRİM DÖNÜŞTÜRÜCÜ ================= */
  OS.uygulamaKaydet({
    id: 'cevirici', ad: 'Birim Dönüştürücü', ikon: '📐', kategori: 'ders',
    varsayilan: { g: 480, y: 470 },
    kur(icerik) {
      const gruplar = {
        uzunluk: { ad: 'Uzunluk', birimler: { 'metre (m)': 1, 'kilometre (km)': 1000, 'santimetre (cm)': 0.01, 'milimetre (mm)': 0.001, 'mil (statute)': 1609.344, 'inç': 0.0254, 'fit': 0.3048, 'yarda': 0.9144, 'deniz mili': 1852 } },
        kutle: { ad: 'Kütle', birimler: { 'kilogram (kg)': 1, 'gram (g)': 0.001, 'ton': 1000, 'libre (lb)': 0.45359237, 'ons (oz)': 0.028349523125 } },
        hiz: { ad: 'Hız', birimler: { 'km/saat': 1, 'metre/saniye': 3.6, 'mil/saat (mph)': 1.609344, 'knot': 1.852 } },
        sicaklik: { ad: 'Sıcaklık', ozel: true }
      };
      const sicakliklar = ['Santigrat (°C)', 'Fahrenheit (°F)', 'Kelvin (K)'];

      icerik.innerHTML = `
        <div class="cevirici">
          <div class="cevirici-secimler">
            <select class="c-grup"></select>
            <select class="c-birim1"></select>
            <select class="c-birim2"></select>
          </div>
          <input type="number" class="c-deger" value="1" placeholder="Değer">
          <div class="cevirici-sonuc">—</div>
          <div class="cevirici-formul"></div>
        </div>`;
      const grupSel = icerik.querySelector('.c-grup');
      const b1 = icerik.querySelector('.c-birim1');
      const b2 = icerik.querySelector('.c-birim2');
      const deger = icerik.querySelector('.c-deger');
      const sonuc = icerik.querySelector('.cevirici-sonuc');
      const formul = icerik.querySelector('.cevirici-formul');

      for (const [k, g] of Object.entries(gruplar)) {
        grupSel.innerHTML += `<option value="${k}">${g.ad}</option>`;
      }

      const birimleriDoldur = () => {
        const g = gruplar[grupSel.value];
        const liste = g.ozel ? sicakliklar : Object.keys(g.birimler);
        b1.innerHTML = liste.map(u => `<option>${u}</option>`).join('');
        b2.innerHTML = liste.map(u => `<option>${u}</option>`).join('');
        b2.selectedIndex = Math.min(1, liste.length - 1);
      };

      const cevir = () => {
        const g = gruplar[grupSel.value];
        const v = parseFloat(deger.value);
        if (isNaN(v)) { sonuc.textContent = '—'; formul.textContent = ''; return; }
        let s;
        if (g.ozel) {
          let c;
          if (b1.selectedIndex === 0) c = v;                       // °C
          else if (b1.selectedIndex === 1) c = (v - 32) * 5 / 9;   // F → C
          else c = v - 273.15;                                      // K → C
          if (b2.selectedIndex === 0) s = c;
          else if (b2.selectedIndex === 1) s = c * 9 / 5 + 32;
          else s = c + 273.15;
          formul.textContent = `${v} ${b1.value} → ${b2.value} (°C üzerinden dönüşüm)`;
        } else {
          s = v * g.birimler[b1.value] / g.birimler[b2.value];
          formul.textContent = `1 ${b1.value} = ${(g.birimler[b1.value] / g.birimler[b2.value]).toPrecision(6)} ${b2.value}`;
        }
        sonuc.textContent = `${Math.round(s * 1e8) / 1e8} ${b2.value.match(/\(([^)]+)\)/)?.[1] || b2.value}`;
      };

      grupSel.addEventListener('change', () => { birimleriDoldur(); cevir(); });
      b1.addEventListener('change', cevir);
      b2.addEventListener('change', cevir);
      deger.addEventListener('input', cevir);
      birimleriDoldur();
      cevir();
    }
  });

  /* ================= BİLGİ TESTİ ================= */
  OS.uygulamaKaydet({
    id: 'test', ad: 'Bilgi Testi', ikon: '🧠', kategori: 'ders',
    varsayilan: { g: 520, y: 500 },
    kur(icerik) {
      const sorular = [
        { s: '7 × 8 = ?', a: ['54', '56', '58', '64'], d: 1 },
        { s: 'Türkiye\'nin başkenti neresidir?', a: ['İstanbul', 'İzmir', 'Ankara', 'Bursa'], d: 2 },
        { s: 'Su deniz seviyesinde kaç °C\'de kaynar?', a: ['90°C', '95°C', '100°C', '110°C'], d: 2 },
        { s: 'Işığın uzaydaki hızı yaklaşık kaçtır?', a: ['3.000 km/s', '30.000 km/s', '300.000 km/s', '3.000.000 km/s'], d: 2 },
        { s: 'En küçük asal sayı hangisidir?', a: ['0', '1', '2', '3'], d: 2 },
        { s: 'Güneş sisteminin en büyük gezegeni?', a: ['Satürn', 'Neptün', 'Jüpiter', 'Mars'], d: 2 },
        { s: '"E = mc²" formülü kime aittir?', a: ['Newton', 'Tesla', 'Hawking', 'Einstein'], d: 3 },
        { s: 'Periyodik tabloda "O" sembolü hangi elementtir?', a: ['Altın', 'Osmiyum', 'Oksijen', 'Gümüş'], d: 2 },
        { s: 'DNA\'nın çift sarmal modelini açıklayan ikili?', a: ['Darwin ve Wallace', 'Bohr ve Heisenberg', 'Watson ve Crick', 'Curie ve Becquerel'], d: 2 },
        { s: '2² + 3² = ?', a: ['10', '12', '13', '16'], d: 2 },
        { s: 'Su kimyasal formülü nedir?', a: ['CO₂', 'H₂O', 'O₂', 'NaCl'], d: 1 },
        { s: 'Dünya\'nın doğal uydusu?', a: ['Mars-2', 'Phobos', 'Ay', 'Titan'], d: 2 }
      ];
      let i = 0, skor = 0, durumlar = [], cevaplandi = false;

      const ciz = () => {
        if (i >= sorular.length) {
          icerik.innerHTML = `
            <div class="test">
              <div class="test-sonuc">
                <div class="etiket">GÖREV RAPORU</div>
                <div class="test-puan">${skor} / ${sorular.length}</div>
                <p style="color:#8fa3d9;font-size:13px">${skor >= 10 ? '🏆 Mükemmel, Komutan!' : skor >= 7 ? '🚀 İyi gidiyorsun!' : '🌌 Tekrar denemeye değer.'}</p>
                <button class="dugme" id="test-tekrar">🔄 Testi Tekrarla</button>
              </div>
            </div>`;
          icerik.querySelector('#test-tekrar').addEventListener('click', () => {
            i = 0; skor = 0; durumlar = []; ciz();
          });
          OS.gorev.rekor('testSkor', skor);
          if (skor >= 7) OS.bildir(`🧠 Bilgi testi: ${skor}/${sorular.length} doğru!`, '🧠');
          return;
        }
        const q = sorular[i];
        icerik.innerHTML = `
          <div class="test">
            <div class="test-ust">
              <span class="etiket">SORU ${i + 1}/${sorular.length}</span>
              <span class="etiket">SKOR: ${skor}</span>
            </div>
            <div class="test-ilerleme">${sorular.map((_, j) => `<span class="test-nokta ${durumlar[j] || ''}"></span>`).join('')}</div>
            <div class="test-soru">${q.s}</div>
            <div class="test-secenekler">
              ${q.a.map((x, j) => `<button class="test-secenek" data-j="${j}">${x}</button>`).join('')}
            </div>
          </div>`;
        icerik.querySelectorAll('.test-secenek').forEach(b => b.addEventListener('click', () => {
          if (cevaplandi) return;
          cevaplandi = true;
          const j = +b.dataset.j;
          const dogruMu = j === q.d;
          if (dogruMu) skor++;
          durumlar[i] = dogruMu ? 'dogru' : 'yanlis';
          icerik.querySelectorAll('.test-secenek').forEach((bb, jj) => {
            bb.disabled = true;
            if (jj === q.d) bb.classList.add('dogru');
            else if (jj === j && !dogruMu) bb.classList.add('yanlis');
          });
          setTimeout(() => { cevaplandi = false; i++; ciz(); }, 850);
        }));
      };
      ciz();
    }
  });

  /* ================= POMODORO ================= */
  OS.uygulamaKaydet({
    id: 'pomodoro', ad: 'Pomodoro (Odak)', ikon: '⏳', kategori: 'ders',
    varsayilan: { g: 400, y: 500 },
    kur(icerik) {
      const ODAK = 25 * 60, MOLA = 5 * 60;
      let kalan = ODAK, mod = 'odak', calisiyor = false, t = null;
      const YARCAP = 92, CEVRE = 2 * Math.PI * YARCAP;

      icerik.innerHTML = `
        <div class="pomo">
          <div class="pomo-halka">
            <svg width="210" height="210" viewBox="0 0 210 210">
              <defs>
                <linearGradient id="pomo-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stop-color="#35e0ff"/><stop offset="100%" stop-color="#8b5cf6"/>
                </linearGradient>
              </defs>
              <circle class="halka-yol" cx="105" cy="105" r="${YARCAP}" fill="none" stroke-width="13"/>
              <circle class="halka-ilerleme" cx="105" cy="105" r="${YARCAP}" fill="none" stroke-width="13"
                stroke-dasharray="${CEVRE}" stroke-dashoffset="0"/>
            </svg>
            <div class="pomo-metin">
              <div class="pomo-sure">25:00</div>
              <div class="pomo-mod">ODAK MODU</div>
            </div>
          </div>
          <div class="pomo-dugmeler">
            <button class="dugme" id="pomo-baslat">▶ Başlat</button>
            <button class="dugme" id="pomo-sifirla">↺ Sıfırla</button>
            <button class="dugme" id="pomo-mod">Mod: Odak</button>
          </div>
          <p style="font-size:11.5px;color:#8fa3d9;text-align:center;max-width:280px">
            25 dakika ders + 5 dakika mola. Tamamlanan odak oturumu bir uzay görevidir. 🚀
          </p>
        </div>`;

      const sureEl = icerik.querySelector('.pomo-sure');
      const modEl = icerik.querySelector('.pomo-mod');
      const halka = icerik.querySelector('.halka-ilerleme');
      const btnBaslat = icerik.querySelector('#pomo-baslat');
      const toplam = () => mod === 'odak' ? ODAK : MOLA;

      const ciz = () => {
        const dk = Math.floor(kalan / 60), sn = kalan % 60;
        sureEl.textContent = `${String(dk).padStart(2, '0')}:${String(sn).padStart(2, '0')}`;
        modEl.textContent = mod === 'odak' ? 'ODAK MODU' : 'MOLA MODU';
        halka.style.strokeDashoffset = CEVRE * (1 - kalan / toplam());
      };

      const bitir = () => {
        clearInterval(t); t = null; calisiyor = false;
        btnBaslat.textContent = '▶ Başlat';
        if (mod === 'odak') {
          OS.gorev.isaretle('pomoBitti', true);
          OS.bildir('⏳ Odak oturumu tamamlandı! 5 dakikalık mola hak kazandın.', '⏳');
          mod = 'mola';
        } else {
          OS.bildir('☕ Mola bitti. Göreve devam Komutan!', '🚀');
          mod = 'odak';
        }
        kalan = toplam();
        ciz();
      };

      btnBaslat.addEventListener('click', () => {
        if (calisiyor) {
          clearInterval(t); t = null; calisiyor = false;
          btnBaslat.textContent = '▶ Devam Et';
        } else {
          calisiyor = true;
          btnBaslat.textContent = '⏸ Duraklat';
          t = setInterval(() => { kalan--; ciz(); if (kalan <= 0) bitir(); }, 1000);
        }
      });
      icerik.querySelector('#pomo-sifirla').addEventListener('click', () => {
        clearInterval(t); t = null; calisiyor = false;
        btnBaslat.textContent = '▶ Başlat';
        kalan = toplam(); ciz();
      });
      icerik.querySelector('#pomo-mod').addEventListener('click', () => {
        clearInterval(t); t = null; calisiyor = false;
        btnBaslat.textContent = '▶ Başlat';
        mod = mod === 'odak' ? 'mola' : 'odak';
        kalan = toplam(); ciz();
      });

      ciz();
      return () => clearInterval(t);
    }
  });

  /* ================= SİSTEM MONİTÖRÜ ================= */
  OS.uygulamaKaydet({
    id: 'sistem', ad: 'Sistem Monitörü', ikon: '🛰️', kategori: 'sistem',
    varsayilan: { g: 640, y: 480 },
    kur(icerik) {
      icerik.innerHTML = `
        <div class="sistem-mon">
          <div class="sys-kart">
            <h4>🔧 DONANIM (BU MAKİNE)</h4>
            <div class="satir"><span>İşlemci</span><span>Intel Core i5-10210U</span></div>
            <div class="satir"><span>Çekirdek</span><span>4 çekirdek / 8 iş parçacığı</span></div>
            <div class="satir"><span>Bellek</span><span>12 GB DDR4</span></div>
            <div class="satir"><span>GPU</span><span>Intel UHD + MX130 2GB</span></div>
            <div class="satir"><span>Depolama</span><span>256 GB NVMe SSD</span></div>
            <div class="satir"><span>Gövde</span><span>Lenovo 81WB</span></div>
          </div>
          <div class="sys-kart">
            <h4>📡 CANLI VERİLER</h4>
            <div class="satir"><span>Ekran</span><span id="sy-ekran">—</span></div>
            <div class="satir"><span>Mantıksal çekirdek</span><span id="sy-cekirdek">—</span></div>
            <div class="satir"><span>Cihaz belleği</span><span id="sy-bellek">—</span></div>
            <div class="satir"><span>Pil</span><span id="sy-pil">—</span></div>
            <div class="satir"><span>Açık pencere</span><span id="sy-pencere">—</span></div>
            <div class="satir"><span>Oturum süresi</span><span id="sy-oturum">—</span></div>
          </div>
          <div class="sys-kart sys-mod">
            <span class="sys-rozet">MOD: HİBRİT</span>
            <div style="font-size:12px;color:#dbe4ff">
              uzayOS bu makine için optimize edildi: entegre grafikte hafif arayüz, MX130 aktif olduğunda oyun modu hazır.
              Çekirdek: <b style="color:#52ffa8">UzayÇekirdek 1.0</b>
            </div>
          </div>
        </div>`;

      icerik.querySelector('#sy-ekran').textContent = `${screen.width}×${screen.height}`;
      icerik.querySelector('#sy-cekirdek').textContent = navigator.hardwareConcurrency ? `${navigator.hardwareConcurrency} iş parçacığı` : 'Bilinmiyor';
      icerik.querySelector('#sy-bellek').textContent = navigator.deviceMemory ? `~${navigator.deviceMemory} GB` : 'Bilinmiyor (tarayıcı gizliyor)';

      const pilKutu = icerik.querySelector('#sy-pil');
      if (navigator.getBattery) {
        navigator.getBattery().then(b => {
          const guncelle = () => {
            pilKutu.textContent = `%${Math.round(b.level * 100)} · ${b.charging ? 'şarjda' : 'batarya'}`;
          };
          guncelle();
          b.addEventListener('levelchange', guncelle);
          b.addEventListener('chargingchange', guncelle);
        }).catch(() => { pilKutu.textContent = 'Bilinmiyor'; });
      } else pilKutu.textContent = 'Bilinmiyor';

      const oturum = icerik.querySelector('#sy-oturum');
      const pencere = icerik.querySelector('#sy-pencere');
      const t = setInterval(() => {
        const sn = Math.floor((Date.now() - OS.acilisZamani) / 1000);
        oturum.textContent = `${Math.floor(sn / 60)} dk ${sn % 60} sn`;
        pencere.textContent = String(OS.pencereSayisi());
      }, 1000);
      return () => clearInterval(t);
    }
  });

  /* ================= UZAY GÖREVLERİ ================= */
  OS.uygulamaKaydet({
    id: 'gorevler', ad: 'Uzay Görevleri', ikon: '🏆', kategori: 'sistem',
    varsayilan: { g: 560, y: 560 },
    kur(icerik) {
      icerik.innerHTML = `
        <div class="gorev-panel">
          <div class="gorev-ust">
            <div class="gorev-yakit-kutu"><b>0</b><span>ROKET YAKITI</span></div>
            <div class="gorev-ilerleme">
              <div class="etiket" style="margin-bottom:6px">GÖREV İLERLEMESİ <span class="g-sayi"></span></div>
              <div class="w-bar"><i></i></div>
            </div>
          </div>
          <div class="gorev-liste"></div>
          <div class="gorev-gunluk"></div>
          <div class="gorev-alt">
            <button class="dugme kirmizi" id="gorev-sifirla">Görevleri Sıfırla</button>
            <span class="etiket">Görev tamamla · yakıt topla · roketi fırlat 🚀</span>
          </div>
        </div>`;

      const listeEl = icerik.querySelector('.gorev-liste');
      const gunlukEl = icerik.querySelector('.gorev-gunluk');
      const yakitEl = icerik.querySelector('.gorev-yakit-kutu b');
      const barEl = icerik.querySelector('.gorev-ilerleme .w-bar i');
      const sayiEl = icerik.querySelector('.g-sayi');

      const ciz = () => {
        const st = OS.gorev.durum;
        const biten = OS.gorevler.filter(g => st.bitti[g.id]).length;
        yakitEl.textContent = OS.gorev.yakitToplam();
        barEl.style.width = (biten / OS.gorevler.length * 100) + '%';
        sayiEl.textContent = `(${biten}/${OS.gorevler.length})`;
        listeEl.innerHTML = OS.gorevler.map(g => `
          <div class="gorev-kart ${st.bitti[g.id] ? 'bitti' : ''}">
            <span class="g-ikon">${g.ikon}</span>
            <div class="g-bilgi">
              <div class="g-ad">${g.ad}</div>
              <div class="g-aciklama">${g.aciklama}</div>
            </div>
            <span class="g-yakit">${st.bitti[g.id] ? '✔' : ''} +${g.yakit}</span>
          </div>`).join('');
        gunlukEl.innerHTML = st.gunluk.length ? st.gunluk.map(g => `<div>${kacir(g)}</div>`).join('') : '<div>Görev günlüğü boş — ilk görev için hazır!</div>';
      };

      const dinle = () => ciz();
      document.addEventListener('uzayos:gorev', dinle);
      icerik.querySelector('#gorev-sifirla').addEventListener('click', () => {
        if (confirm('Tüm görev ilerlemesi ve yakıt sıfırlansın mı?')) OS.gorev.sifirla();
      });
      ciz();
      return () => document.removeEventListener('uzayos:gorev', dinle);
    }
  });
})();
