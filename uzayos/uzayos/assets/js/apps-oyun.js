/* =========================================================
   uzayOS — Oyunlar
   Uzay Yılanı · 2048 (Yörünge) · Mayın Tarlası · Roket Kaçış
   ========================================================= */
(() => {
  'use strict';
  const OS = window.UzayOS;

  /* ================= UZAY YILANI ================= */
  OS.uygulamaKaydet({
    id: 'yilan', ad: 'Uzay Yılanı', ikon: '🐍', kategori: 'oyun',
    varsayilan: { g: 500, y: 620 },
    kur(icerik, pencere) {
      const H = 20, KARE = 21; // 420x420
      icerik.innerHTML = `
        <div class="oyun">
          <div class="oyun-ust">
            <span>SKOR <b class="y-skor">0</b></span>
            <span>REKOR <b class="y-rekor">0</b></span>
            <span>HIZ <b class="y-hiz">1</b></span>
          </div>
          <canvas width="420" height="420"></canvas>
          <div class="tus-kosesi">
            <span></span><button data-yon="up">⬆</button><span></span>
            <button data-yon="left">⬅</button><button data-yon="down">⬇</button><button data-yon="right">➡</button>
          </div>
          <div class="oyun-katman">
            <h3>🐍 UZAY YILANI</h3>
            <p>Yıldızları topla, kuyruğun uzasın. Ok tuşları / WASD ile yön, Boşluk ile başlat-duraklat. Duvarlara ve kendine çarpma!</p>
            <button class="dugme" id="y-baslat">▶ Göreve Başla</button>
          </div>
        </div>`;

      const canvas = icerik.querySelector('canvas');
      const ctx = canvas.getContext('2d');
      const skorEl = icerik.querySelector('.y-skor');
      const rekorEl = icerik.querySelector('.y-rekor');
      const hizEl = icerik.querySelector('.y-hiz');
      const katman = icerik.querySelector('.oyun-katman');

      let yilan, yon, siradakiYon, yemek, skor, oyunBitti, calisiyor, hizMs, t;

      const anahtar = 'uzayos-yilan-rekor';
      let rekor = +(localStorage.getItem(anahtar) || 0);
      rekorEl.textContent = rekor;

      const sifirla = () => {
        yilan = [{ x: 8, y: 10 }, { x: 7, y: 10 }, { x: 6, y: 10 }];
        yon = { x: 1, y: 0 }; siradakiYon = { x: 1, y: 0 };
        skor = 0; oyunBitti = false; hizMs = 140;
        yemekUret();
        skorEl.textContent = '0'; hizEl.textContent = '1';
      };

      const yemekUret = () => {
        do {
          yemek = { x: Math.floor(Math.random() * H), y: Math.floor(Math.random() * H) };
        } while (yilan.some(g => g.x === yemek.x && g.y === yemek.y));
      };

      const adim = () => {
        if (oyunBitti) return;
        yon = siradakiYon;
        const bas = { x: yilan[0].x + yon.x, y: yilan[0].y + yon.y };
        if (bas.x < 0 || bas.x >= H || bas.y < 0 || bas.y >= H || yilan.some(g => g.x === bas.x && g.y === bas.y)) {
          bitis();
          return;
        }
        yilan.unshift(bas);
        if (bas.x === yemek.x && bas.y === yemek.y) {
          skor += 10;
          skorEl.textContent = skor;
          hizMs = Math.max(70, 140 - Math.floor(skor / 40) * 8);
          hizEl.textContent = Math.round((140 / hizMs) * 10) / 10;
          OS.gorev.rekor('yilanEn', skor);
          if (skor > rekor) { rekor = skor; localStorage.setItem(anahtar, rekor); rekorEl.textContent = rekor; }
          yemekUret();
          clearInterval(t); t = setInterval(adim, hizMs);
        } else yilan.pop();
        cizGercek();
      };

      const bitis = () => {
        oyunBitti = true; calisiyor = false;
        clearInterval(t);
        katman.innerHTML = `
          <h3 style="color:#ff5470">☄️ ÇARPIŞMA!</h3>
          <p>Skorun: <b style="color:#35e0ff">${skor}</b> · Rekor: <b style="color:#ffd166">${rekor}</b></p>
          <button class="dugme" id="y-tekrar">🔄 Tekrar Dene</button>`;
        katman.style.display = 'flex';
        katman.querySelector('#y-tekrar').addEventListener('click', () => baslat());
      };

      const baslat = () => {
        sifirla();
        katman.style.display = 'none';
        calisiyor = true;
        clearInterval(t);
        t = setInterval(adim, hizMs);
        cizGercek();
      };

      const cizGercek = () => {
        ctx.fillStyle = '#050b1e';
        ctx.fillRect(0, 0, 420, 420);
        // hafif ızgara
        ctx.strokeStyle = 'rgba(53,224,255,.05)';
        for (let i = 1; i < H; i++) {
          ctx.beginPath(); ctx.moveTo(i * KARE, 0); ctx.lineTo(i * KARE, 420); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(0, i * KARE); ctx.lineTo(420, i * KARE); ctx.stroke();
        }
        // yemek (yıldız)
        ctx.font = '20px serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('⭐', yemek.x * KARE + KARE / 2, yemek.y * KARE + KARE / 2 + 1);
        // yılan
        yilan.forEach((g, i) => {
          const x = g.x * KARE, y = g.y * KARE;
          if (i === 0) ctx.fillStyle = '#52ffa8';
          else ctx.fillStyle = `rgba(53,224,255,${Math.max(.35, 1 - i / (yilan.length + 4))})`;
          ctx.beginPath();
          ctx.roundRect(x + 2, y + 2, KARE - 4, KARE - 4, 6);
          ctx.fill();
          if (i === 0) { // gözler
            ctx.fillStyle = '#04202c';
            const gx = x + KARE / 2 + yon.x * 4, gy = y + KARE / 2 + yon.y * 4;
            ctx.beginPath(); ctx.arc(gx - 3, gy - 2, 1.7, 0, 7); ctx.fill();
            ctx.beginPath(); ctx.arc(gx + 3, gy - 2, 1.7, 0, 7); ctx.fill();
          }
        });
      };

      const tuslar = { ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 }, ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 }, w: { x: 0, y: -1 }, s: { x: 0, y: 1 }, a: { x: -1, y: 0 }, d: { x: 1, y: 0 } };
      const tusIsle = ad => {
        const y = tuslar[ad];
        if (!y) return;
        if (y.x === -yon.x && y.y === -yon.y) return;
        siradakiYon = y;
      };

      const keyH = e => {
        if (pencere.dataset.odak !== '1') return;
        const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
        if (tuslar[k]) { e.preventDefault(); tusIsle(k); }
        if (e.key === ' ' && !calisiyor && !oyunBitti) { e.preventDefault(); baslat(); }
      };
      document.addEventListener('keydown', keyH);
      icerik.querySelector('#y-baslat').addEventListener('click', () => baslat());
      icerik.querySelectorAll('.tus-kosesi button').forEach(b => {
        b.addEventListener('click', () => tusIsle(b.dataset.yon === 'up' ? 'ArrowUp' : b.dataset.yon === 'down' ? 'ArrowDown' : b.dataset.yon === 'left' ? 'ArrowLeft' : 'ArrowRight'));
      });

      // ilk çizim
      sifirla();
      cizGercek();

      return () => { document.removeEventListener('keydown', keyH); clearInterval(t); };
    }
  });

  /* ================= 2048 (YÖRÜNGE) ================= */
  OS.uygulamaKaydet({
    id: 'o2048', ad: '2048 (Yörünge)', ikon: '🧱', kategori: 'oyun',
    varsayilan: { g: 430, y: 620 },
    kur(icerik, pencere) {
      icerik.innerHTML = `
        <div class="oyun">
          <div class="oyun-ust">
            <span>SKOR <b class="s-skor">0</b></span>
            <span>REKOR <b class="s-rekor">0</b></span>
          </div>
          <div class="o2048-tahta"></div>
          <div class="tus-kosesi">
            <span></span><button data-yon="up">⬆</button><span></span>
            <button data-yon="left">⬅</button><button data-yon="down">⬇</button><button data-yon="right">➡</button>
          </div>
          <p style="font-size:11.5px;color:#8fa3d9">Ok tuşları / WASD ile kaydır. Aynı karolar birleşir. Hedef: 2048 karosu!</p>
          <div class="oyun-katman" style="display:none">
            <h3>🧱 OYUN BİTTİ</h3>
            <p>Skor: <b class="s-son-skor" style="color:#35e0ff">0</b></p>
            <button class="dugme" id="s-tekrar">🔄 Yeniden Başlat</button>
          </div>
        </div>`;
      const tahtaEl = icerik.querySelector('.o2048-tahta');
      const skorEl = icerik.querySelector('.s-skor');
      const rekorEl = icerik.querySelector('.s-rekor');
      const katman = icerik.querySelector('.oyun-katman');
      const anahtar = 'uzayos-2048-rekor';
      let skor = 0;
      let rekor = +(localStorage.getItem(anahtar) || 0);
      rekorEl.textContent = rekor;
      let tahta;

      const bosTahta = () => Array.from({ length: 4 }, () => [0, 0, 0, 0]);
      const bosluklar = () => {
        const b = [];
        for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) if (!tahta[y][x]) b.push({ x, y });
        return b;
      };
      const rastgeleKoy = () => {
        const b = bosluklar();
        if (!b.length) return;
        const s = b[Math.floor(Math.random() * b.length)];
        tahta[s.y][s.x] = Math.random() < 0.9 ? 2 : 4;
      };
      const enBuyuk = () => Math.max(...tahta.flat());

      const ciz = (yeniXY = []) => {
        tahtaEl.innerHTML = '';
        for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
          const v = tahta[y][x];
          const d = document.createElement('div');
          d.className = 'o2048-karo' + (yeniXY.some(p => p.x === x && p.y === y) ? ' yeni' : '');
          if (v) d.dataset.v = v;
          d.textContent = v || '';
          tahtaEl.appendChild(d);
        }
        skorEl.textContent = skor;
        if (skor > rekor) { rekor = skor; localStorage.setItem(anahtar, rekor); rekorEl.textContent = rekor; }
        OS.gorev.rekor('k2048En', enBuyuk());
      };

      const kaydir = satir => {
        const a = satir.filter(v => v);
        const cikti = [];
        let puan = 0;
        for (let i = 0; i < a.length; i++) {
          if (a[i] === a[i + 1]) {
            cikti.push(a[i] * 2); puan += a[i] * 2; i++;
          } else cikti.push(a[i]);
        }
        while (cikti.length < 4) cikti.push(0);
        return { satir: cikti, puan };
      };

      const dondur = (t, n = 1) => {
        for (let k = 0; k < n; k++) {
          const y = t.map((r, i) => r.map((_, j) => t[3 - j][i]));
          t = y;
        }
        return t;
      };

      const kaydirYon = yon => {
        const eski = JSON.stringify(tahta);
        let ekPuan = 0;
        const don = yon === 'up' ? 3 : yon === 'right' ? 2 : yon === 'left' ? 0 : 1;
        let t = dondur(tahta.map(r => [...r]), don);
        t = t.map(satir => { const r = kaydir(satir); ekPuan += r.puan; return r.satir; });
        t = dondur(t, (4 - don) % 4);
        tahta = t;
        if (JSON.stringify(tahta) !== eski) {
          skor += ekPuan;
          rastgeleKoy();
          ciz();
          if (bosluklar().length === 0 && !hareketVar()) bitisEkrani();
        }
      };

      const hareketVar = () => {
        for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
          const v = tahta[y][x];
          if (v && ((x < 3 && tahta[y][x + 1] === v) || (y < 3 && tahta[y + 1][x] === v))) return true;
        }
        return false;
      };

      const bitisEkrani = () => {
        icerik.querySelector('.s-son-skor').textContent = skor;
        katman.style.display = 'flex';
      };

      const sifirla = () => {
        tahta = bosTahta(); skor = 0;
        rastgeleKoy(); rastgeleKoy();
        katman.style.display = 'none';
        ciz();
      };

      const yonler = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right' };
      const keyH = e => {
        if (pencere.dataset.odak !== '1') return;
        const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
        if (yonler[k]) { e.preventDefault(); kaydirYon(yonler[k]); }
      };
      document.addEventListener('keydown', keyH);
      icerik.querySelectorAll('.tus-kosesi button').forEach(b => {
        b.addEventListener('click', () => kaydirYon(b.dataset.yon));
      });
      icerik.querySelector('#s-tekrar').addEventListener('click', sifirla);

      sifirla();
      return () => document.removeEventListener('keydown', keyH);
    }
  });

  /* ================= MAYIN TARLASI ================= */
  OS.uygulamaKaydet({
    id: 'mayin', ad: 'Mayın Tarlası', ikon: '💣', kategori: 'oyun',
    varsayilan: { g: 400, y: 570 },
    kur(icerik) {
      const N = 9, MAYIN = 10;
      icerik.innerHTML = `
        <div class="oyun">
          <div class="oyun-ust">
            <span>💣 <b class="m-kalan">${MAYIN}</b></span>
            <span>⏱ <b class="m-sure">0</b></span>
            <button class="dugme" id="m-yeni">🔄 Yeni</button>
          </div>
          <div class="mayin-tahta"></div>
          <p style="font-size:11.5px;color:#8fa3d9">Sol tık: aç · Sağ tık: bayrak. İlk tıklaman her zaman güvenlidir!</p>
          <div class="oyun-katman" style="display:none">
            <h3 class="m-baslik">💣</h3>
            <p class="m-metin"></p>
            <button class="dugme" id="m-tekrar">🔄 Tekrar Oyna</button>
          </div>
        </div>`;
      const tahtaEl = icerik.querySelector('.mayin-tahta');
      const kalanEl = icerik.querySelector('.m-kalan');
      const sureEl = icerik.querySelector('.m-sure');
      const katman = icerik.querySelector('.oyun-katman');

      let hucreler, ilkTik, bitti, bayrakSayisi, acikSayisi, sureT, saniye;

      const komsular = (x, y) => {
        const k = [];
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && nx < N && ny >= 0 && ny < N) k.push({ x: nx, y: ny });
        }
        return k;
      };

      const mayinlariUret = (sx, sy) => {
        const yasak = new Set([sy * N + sx, ...komsular(sx, sy).map(p => p.y * N + p.x)]);
        let konuldu = 0;
        while (konuldu < MAYIN) {
          const i = Math.floor(Math.random() * N * N);
          if (yasak.has(i) || hucreler[i].mayin) continue;
          hucreler[i].mayin = true;
          konuldu++;
        }
        hucreler.forEach((h, i) => {
          h.komsu = komsular(i % N, Math.floor(i / N)).filter(p => hucreler[p.y * N + p.x].mayin).length;
        });
      };

      const ciz = () => {
        tahtaEl.innerHTML = '';
        hucreler.forEach((h, i) => {
          const d = document.createElement('div');
          d.className = 'mayin-hucre' + (h.acik ? ' acik' : '') + (h.acik && h.mayin ? ' mayin-var' : '');
          if (h.acik && !h.mayin && h.komsu) { d.dataset.sayi = h.komsu; d.textContent = h.komsu; }
          else if (h.acik && h.mayin) d.textContent = '💥';
          else if (h.bayrak) d.textContent = '🚩';
          d.addEventListener('click', () => tik(i));
          d.addEventListener('contextmenu', e => { e.preventDefault(); bayrak(i); });
          tahtaEl.appendChild(d);
        });
        kalanEl.textContent = MAYIN - bayrakSayisi;
      };

      const tik = i => {
        if (bitti) return;
        const h = hucreler[i];
        if (h.acik || h.bayrak) return;
        if (ilkTik) { ilkTik = false; mayinlariUret(i % N, Math.floor(i / N)); sureT = setInterval(() => { saniye++; sureEl.textContent = saniye; }, 1000); }
        if (h.mayin) { patlat(); return; }
        ac(h);
        kontrol();
        ciz();
      };

      const ac = h => {
        if (h.acik || h.bayrak) return;
        h.acik = true; acikSayici();
        if (!h.komsu && !h.mayin) {
          const i = hucreler.indexOf(h);
          komsular(i % N, Math.floor(i / N)).forEach(p => ac(hucreler[p.y * N + p.x]));
        }
      };
      let acikSayaciD = 0;
      const acikSayici = () => { acikSayaciD++; };
      const kontrol = () => {
        if (acikSayaciD >= N * N - MAYIN) {
          bitti = true; clearInterval(sureT);
          katman.querySelector('.m-baslik').textContent = '🏆 KAZANDIN!';
          katman.querySelector('.m-metin').textContent = `Tüm mayınlar temizlendi! Süre: ${saniye} sn`;
          katman.querySelector('.m-baslik').style.color = '#52ffa8';
          katman.style.display = 'flex';
          OS.gorev.isaretle('mayinKazan', true);
        }
      };

      const bayrak = i => {
        if (bitti || hucreler[i].acik) return;
        hucreler[i].bayrak = !hucreler[i].bayrak;
        bayrakSayisi += hucreler[i].bayrak ? 1 : -1;
        ciz();
      };

      const patlat = () => {
        bitti = true; clearInterval(sureT);
        hucreler.forEach(h => { if (h.mayin) h.acik = true; });
        katman.querySelector('.m-baslik').textContent = '💥 MAYINA BASILDI!';
        katman.querySelector('.m-baslik').style.color = '#ff5470';
        katman.querySelector('.m-metin').textContent = `Süre: ${saniye} sn — dikkatli ol Komutan!`;
        katman.style.display = 'flex';
        ciz();
      };

      const sifirla = () => {
        hucreler = Array.from({ length: N * N }, () => ({ mayin: false, acik: false, bayrak: false, komsu: 0 }));
        ilkTik = true; bitti = false; bayrakSayisi = 0; acikSayaciD = 0; saniye = 0;
        clearInterval(sureT); sureEl.textContent = '0';
        katman.style.display = 'none';
        ciz();
      };

      icerik.querySelector('#m-yeni').addEventListener('click', sifirla);
      icerik.querySelector('#m-tekrar').addEventListener('click', sifirla);
      sifirla();
      return () => clearInterval(sureT);
    }
  });

  /* ================= ROKET KAÇIŞ ================= */
  OS.uygulamaKaydet({
    id: 'roket', ad: 'Roket Kaçış', ikon: '🛰️', kategori: 'oyun',
    varsayilan: { g: 560, y: 520 },
    kur(icerik, pencere) {
      const G = 480, Y = 300;
      icerik.innerHTML = `
        <div class="oyun">
          <div class="oyun-ust">
            <span>MESAFE <b class="r-mesafe">0</b> m</span>
            <span>REKOR <b class="r-rekor">0</b> m</span>
          </div>
          <canvas width="${G}" height="${Y}"></canvas>
          <button class="dugme" id="r-boost" style="width:200px">🚀 İTİŞ (Boşluk)</button>
          <p style="font-size:11.5px;color:#8fa3d9">Boşluk tuşu veya tık ile itiş yap, asteroitlerin arasından geç. Yerçekimine karşı dikkat!</p>
          <div class="oyun-katman">
            <h3>🛰️ ROKET KAÇIŞ</h3>
            <p>Roketin yakıt itişiyle yukarı süzül, asteroit kuşaklarının arasından geç. Her kuşak +5 metre!</p>
            <button class="dugme" id="r-baslat">▶ Fırlat</button>
          </div>
        </div>`;
      const canvas = icerik.querySelector('canvas');
      const ctx = canvas.getContext('2d');
      const mesafeEl = icerik.querySelector('.r-mesafe');
      const rekorEl = icerik.querySelector('.r-rekor');
      const katman = icerik.querySelector('.oyun-katman');
      const anahtar = 'uzayos-roket-rekor';
      let rekor = +(localStorage.getItem(anahtar) || 0);
      rekorEl.textContent = rekor;

      let roket, asteroitler, yildizlar, mesafe, hiz, oyunAktif, raf;

      const sifirla = () => {
        roket = { y: Y / 2, vy: 0 };
        asteroitler = [];
        yildizlar = Array.from({ length: 46 }, () => ({ x: Math.random() * G, y: Math.random() * Y, r: Math.random() * 1.6 + .4 }));
        mesafe = 0; hiz = 2.7;
        mesafeEl.textContent = '0';
      };

      const itis = () => {
        if (oyunAktif) roket.vy = -5.4;
      };

      const asteroitUret = () => {
        const bosluk = 118;
        const gy = 45 + Math.random() * (Y - 90 - bosluk);
        asteroitler.push({ x: G + 30, gy, bosluk, gecti: false });
      };

      const dongu = () => {
        raf = requestAnimationFrame(dongu);
        roket.vy += 0.26;
        roket.vy = Math.max(-7, Math.min(7, roket.vy));
        roket.y += roket.vy;

        hiz = 2.7 + Math.min(1.8, mesafe / 400);
        mesafe += hiz / 9;
        mesafeEl.textContent = Math.floor(mesafe);

        yildizlar.forEach(y => { y.x -= hiz * .45; if (y.x < 0) { y.x = G; y.y = Math.random() * Y; } });
        if (!asteroitler.length || asteroitler[asteroitler.length - 1].x < G - 215) asteroitUret();
        asteroitler.forEach(a => a.x -= hiz);
        asteroitler = asteroitler.filter(a => a.x > -50);
        asteroitler.forEach(a => {
          if (!a.gecti && a.x + 18 < 60) { a.gecti = true; mesafe += 5; }
        });

        // çarpışma
        const rx = 52, rr = 9;
        let carpti = roket.y < 4 || roket.y > Y - 4;
        for (const a of asteroitler) {
          if (rx + rr > a.x - 16 && rx - rr < a.x + 16) {
            if (roket.y < a.gy - 2 || roket.y > a.gy + a.bosluk + 2) { carpti = true; break; }
          }
        }

        // çiz
        ctx.fillStyle = 'rgba(3,6,20,.9)';
        ctx.fillRect(0, 0, G, Y);
        yildizlar.forEach(y => { ctx.fillStyle = 'rgba(219,228,255,.8)'; ctx.beginPath(); ctx.arc(y.x, y.y, y.r, 0, 7); ctx.fill(); });
        asteroitler.forEach(a => {
          ctx.fillStyle = '#3a4670';
          ctx.beginPath(); ctx.arc(a.x, a.gy - 20, 20, 0, 7); ctx.fill();
          ctx.fillStyle = '#2c3657';
          ctx.beginPath(); ctx.arc(a.x + 6, a.gy - 26, 7, 0, 7); ctx.fill();
          ctx.fillStyle = '#3a4670';
          ctx.beginPath(); ctx.arc(a.x, a.gy + a.bosluk + 20, 20, 0, 7); ctx.fill();
          ctx.fillStyle = '#2c3657';
          ctx.beginPath(); ctx.arc(a.x - 5, a.gy + a.bosluk + 26, 7, 0, 7); ctx.fill();
        });
        // roket
        ctx.save();
        ctx.translate(rx, roket.y);
        ctx.rotate(Math.max(-.5, Math.min(.6, roket.vy / 9)));
        ctx.font = '26px serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('🚀', 0, 0);
        ctx.restore();

        if (carpti) { bitis(); return; }

        const fm = Math.floor(mesafe);
        if (fm > rekor) { rekor = fm; localStorage.setItem(anahtar, rekor); rekorEl.textContent = rekor; }
        OS.gorev.rekor('roketEn', fm);
      };

      const bitis = () => {
        cancelAnimationFrame(raf);
        oyunAktif = false;
        const fm = Math.floor(mesafe);
        katman.querySelector('h3').textContent = '☄️ ROKET KAYBEDİLDİ';
        katman.querySelector('h3').style.color = '#ff5470';
        katman.querySelector('p').innerHTML = `Mesafe: <b style="color:#35e0ff">${fm} m</b> · Rekor: <b style="color:#ffd166">${rekor} m</b>`;
        katman.querySelector('button').textContent = '🔄 Yeniden Fırlat';
        katman.style.display = 'flex';
      };

      const baslat = () => {
        sifirla();
        katman.style.display = 'none';
        oyunAktif = true;
        cancelAnimationFrame(raf);
        dongu();
      };

      const tusH = e => {
        if (pencere.dataset.odak !== '1') return;
        if (e.key === ' ') { e.preventDefault(); if (oyunAktif) itis(); else if (katman.style.display !== 'none') baslat(); }
      };
      document.addEventListener('keydown', tusH);
      canvas.addEventListener('pointerdown', itis);
      icerik.querySelector('#r-boost').addEventListener('pointerdown', itis);
      icerik.querySelector('#r-baslat').addEventListener('click', baslat);

      sifirla();
      // başlangıç çizimi
      ctx.fillStyle = '#050b1e'; ctx.fillRect(0, 0, G, Y);

      return () => { document.removeEventListener('keydown', tusH); cancelAnimationFrame(raf); };
    }
  });
})();
