/* =========================================================
   uzayOS — Hakkında
   ========================================================= */
(() => {
  'use strict';
  const OS = window.UzayOS;

  OS.uygulamaKaydet({
    id: 'hakkinda', ad: 'Hakkında uzayOS', ikon: 'ℹ️', kategori: 'sistem',
    varsayilan: { g: 440, y: 480 },
    kur(icerik) {
      icerik.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;text-align:center;gap:16px;background:radial-gradient(420px 220px at 50% 0%,rgba(53,224,255,.12),transparent)">
          <img src="assets/img/uzayos-mark.svg" alt="uzayOS Logo" style="width:96px;height:96px;filter:drop-shadow(0 0 44px rgba(53,224,255,.38))">
          <div style="font-size:40px;font-weight:800;letter-spacing:16px;background:linear-gradient(90deg,#35e0ff,#8b5cf6,#35e0ff);background-size:200% 100%;-webkit-background-clip:text;background-clip:text;color:transparent">uzay<span style="font-weight:300">OS</span></div>
          <div style="letter-spacing:12px;font-size:9px;color:#8fa3d9">UZAYÇEKİRDEK 1.0 · YÖRÜNGE-1 İSTASYONU</div>
          <div style="margin-top:8px;font-size:12.5px;color:#dbe4ff;line-height:1.9">
            Uzay temalı ders + oyun hibrit işletim sistemi<br>
            Tamamen yerel · Sadece 127.0.0.1 üzerinde çalışır<br>
            Pencere Yöneticisi · NebulaNET · Komutan Konsolu<br>
            Uzay Görevleri · Roket Yakıt Sistemi
          </div>
          <div style="margin-top:12px;font-size:11px;color:rgba(143,163,217,.6)">NebulaNET Proxy Motoru • Terminal İndir Desteği</div>
          <div style="font-size:10.5px;color:rgba(143,163,217,.5)">MIT Lisansı</div>
        </div>
      `;
    }
  });
})();
