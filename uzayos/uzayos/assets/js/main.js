/* =========================================================
   uzayOS — Ana başlatıcı
   Açılış dizisi · Yıldız alanı · Masaüstü · Görev çubuğu
   ========================================================= */
(() => {
  'use strict';
  const OS = window.UzayOS;

  /* ---------------- Yıldız alanı (uzay teması) ---------------- */
  function yildizAlani() {
    const c = document.getElementById('starfield');
    const ctx = c.getContext('2d');
    let w = 0, h = 0, yildizlar = [], fare = { x: 0, y: 0 }, t = 0;

    const boyut = () => {
      w = c.width = innerWidth;
      h = c.height = innerHeight - 52;
      const adet = Math.min(170, Math.floor(w * h / 9000));
      yildizlar = Array.from({ length: adet }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 1.5 + .3,
        hiz: Math.random() * .22 + .04,
        faz: Math.random() * Math.PI * 2,
        katman: Math.random() * .9 + .1,
        renk: Math.random() < .18 ? '#8b5cf6' : Math.random() < .2 ? '#35e0ff' : '#dbe4ff'
      }));
    };

    addEventListener('resize', boyut);
    addEventListener('mousemove', e => {
      fare.x = (e.clientX / innerWidth - .5) * 2;
      fare.y = (e.clientY / (innerHeight - 52) - .5) * 2;
    });

    const dongu = () => {
      t += .016;
      ctx.clearRect(0, 0, w, h);
      // nebula parıltısı
      const g1 = ctx.createRadialGradient(w * .8, h * .2, 0, w * .8, h * .2, w * .5);
      g1.addColorStop(0, 'rgba(139,92,246,.07)');
      g1.addColorStop(1, 'transparent');
      ctx.fillStyle = g1;
      ctx.fillRect(0, 0, w, h);

      for (const y of yildizlar) {
        y.x -= y.hiz;
        if (y.x < -3) { y.x = w + 3; y.y = Math.random() * h; }
        const parilti = .55 + .45 * Math.sin(t * 2 + y.faz);
        ctx.globalAlpha = parilti;
        ctx.fillStyle = y.renk;
        ctx.beginPath();
        ctx.arc(y.x + fare.x * y.katman * 9, y.y + fare.y * y.katman * 9, y.r, 0, 7);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      requestAnimationFrame(dongu);
    };
    boyut();
    dongu();
  }

  /* ---------------- Masaüstü ikonları ---------------- */
  function masaustuIkonalri() {
    const kutu = document.getElementById('masaustu-ikonlar');
    const sirala = { ders: 0, oyun: 1, sistem: 2 };
    const liste = OS.uygulamaListe().sort((a, b) => sirala[a.kategori] - sirala[b.kategori]);
    for (const app of liste) {
      const d = document.createElement('div');
      d.className = 'm-ikon';
      d.innerHTML = `<div class="m-kutu">${app.ikon}</div><div class="m-ad">${app.ad}</div>`;
      d.title = `${app.ad} — çift tıkla`;
      d.addEventListener('click', e => {
        e.stopPropagation();
        kutu.querySelectorAll('.m-ikon').forEach(x => x.classList.remove('secili'));
        d.classList.add('secili');
      });
      d.addEventListener('dblclick', () => OS.uygulamaAc(app.id));
      kutu.appendChild(d);
    }
    document.getElementById('masaustu').addEventListener('click', () => {
      kutu.querySelectorAll('.m-ikon').forEach(x => x.classList.remove('secili'));
    });
  }

  /* ---------------- Açılış dizisi ---------------- */
  const ACILIS_SATIRLARI = [
    'UzayÇekirdek 1.0 yükleniyor...',
    'Bellek taraması: 12 GB DDR4 .................. <span class="ok">[TAMAM]</span>',
    'GPU modülü: Intel UHD + GeForce MX130 ........ <span class="ok">[TAMAM]</span>',
    'NVMe depolama: KBG40ZNT256G ................. <span class="ok">[TAMAM]</span>',
    'Donanım profili: Lenovo 81WB (i5-10210U) .... <span class="ok">[TAMAM]</span>',
    'Görev profili: "Ders + Oyun Hibrit" ......... <span class="ok">[ETKİN]</span>',
    'Yıldız haritası ve görev merkezi hazırlanıyor...',
    'Tüm sistemler nominal. Hoş geldin, Komutan! 🚀'
  ];

  function acilisDizisi(devam = true) {
    const katman = document.getElementById('acilis');
    const satirKutu = katman.querySelector('.acilis-satirlar');
    const bar = katman.querySelector('.acilis-ilerleme i');
    katman.classList.remove('gizle');
    satirKutu.innerHTML = '';
    bar.style.width = '0%';

    let i = 0;
    const adim = () => {
      if (i < ACILIS_SATIRLARI.length) {
        const d = document.createElement('div');
        d.className = 'satir-yeni';
        d.innerHTML = ACILIS_SATIRLARI[i];
        satirKutu.appendChild(d);
        bar.style.width = ((i + 1) / ACILIS_SATIRLARI.length * 100) + '%';
        i++;
        setTimeout(adim, 180 + Math.random() * 160);
      } else {
        setTimeout(() => {
          katman.classList.add('gizle');
          document.getElementById('masaustu').classList.add('acik');
          if (devam) {
            OS.gorev.isaretle('boot', true);
            setTimeout(() => {
              OS.bildir('🛸 Hoş geldin Komutan! Görev Merkezi\'nden uygulamaları aç, uzay görevlerini tamamla.', '🚀');
              setTimeout(() => OS.bildir('💡 İpucu: Uygulamalara çift tıkla · Görevleri 🏆 Uzay Görevleri uygulamasında görebilirsin.', '🌌'), 4200);
            }, 700);
          }
        }, 550);
      }
    };
    adim();
  }

  /* ---------------- Başlat ---------------- */
  function baslat() {
    yildizAlani();
    masaustuIkonalri();
    OS.menuKur();
    OS.saatBaslat();
    acilisDizisi(true);
    document.addEventListener('uzayos:yeniden-baslat', () => {
      OS.tumPencereleriKapat();
      acilisDizisi(false);
    });
    // Esc menüyü kapatır
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') OS.menuKapat();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', baslat);
  else baslat();
})();
