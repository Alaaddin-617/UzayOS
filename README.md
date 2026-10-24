# uzayOS

Kendi bilgisayarına özel, uzay temalı **ders + oyun** işletim sistemi arayüzü.

Sadece `127.0.0.1` üzerinde çalışır. Tarayıcı tabanlı ama tamamen yerel bir deneyim sunar.

## Özellikler

- **Uzay Teması** – Yıldız alanı, roket fırlatma ekranı, gezegen animasyonları
- **Masaüstü Ortamı** – Pencere yönetimi, görev çubuğu, görev merkezi
- **Ders Araçları** – Komutan Konsolu, Notlar, Hesap Makinesi, Birim Dönüştürücü, Bilgi Testi, Pomodoro, Sistem Monitörü
- **Oyunlar** – Uzay Yılanı, 2048 (Yörünge), Mayın Tarlası, Roket Kaçış
- **NebulaNET** – uzayOS'a özel sekmeli tarayıcı (proxy destekli)
- **Uzay Görevleri** – Görevleri tamamlayarak roket yakıtı kazan
- **Terminal İndir** – Komutan Konsolu'nda `indir <url>` komutu ile doğrudan dosya indirme

## Kurulum

### Gereksinimler
- [Node.js](https://nodejs.org/) (LTS önerilir)

### Çalıştırma

1. Repoyu klonla
```bash
git clone https://github.com/alaaddinerol/uzayOS.git
cd uzayOS
```

2. Sunucuyu başlat
```bash
cd uzayos
node server.js
```

3. Tarayıcıda aç
```
http://127.0.0.1:8080
```

## Dosya Yapısı

```text
uzayOS/
├── uzayos/
│   ├ 5. server.js
│   └ uzayos/
│       ├ assets/css/style.css
│       ├ assets/js/*.js
│       ├ assets/img/uzayos-mark.svg
│       └ index.html
```

## Lisans

MIT
