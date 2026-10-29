# ALAN KİLİT

Konum tabanlı ekran kilidi. Seçtiğin alana **girdiğinde ekranı kilitler**, alandan **çıktığında kendiliğinden açar** ve o yerde kaç kez kapandığını sayar.

Alan Kilit önce web tarayıcısında çalışır; Android, iPhone/iPad, Windows, macOS ve Linux'ta web sayfasını açıp kullanabilirsin. Destekleyen tarayıcılarda **Cihaza kur** düğmesi uygulamayı ana ekrana veya uygulama menüsüne ekler (PWA). iPhone/iPad'de Safari → **Paylaş → Ana Ekrana Ekle** yolunu kullan.

**Web uygulaması:** https://alaaddin-617.github.io/UzayOS/

İndirme ve kurulum sayfası da bu web uygulamasıdır: buradan tarayıcıda devam edebilir veya **Cihaza kur** düğmesiyle destekleyen tarayıcılarda ana ekrana/uygulama menüsüne ekleyebilirsin. Ayrı bir Windows, macOS, Android ya da iOS mağaza paketi değildir.

Kurulu uygulama adı tarayıcı tarafından güncellenir; bazı cihazlar eski adı önbellekte tutabilir. Güncel sürümü açıp uygulama adını yenilemek için cihazın uygulama/ana ekranından kaldır ve tarayıcıdaki **Cihaza kur** seçeneğiyle yeniden ekle.

Kurulum, cihazına özgü bir mağaza uygulaması indirmek yerine tarayıcının yerleşik PWA desteğini kullanır; özellik ve arka plan konum desteği tarayıcı/işletim sistemine göre değişebilir. En iyi konum desteği için HTTPS kullan ve otomatik kilit sırasında Alan Kilit'i açık tut.

## Ne yapar?

- İlk açılışta **doğum tarihini (gün / ay / yıl)** sorar. Yaş her açılışta ve uygulama açıkken yeniden hesaplanır; 18 yaşına gelince otomatik olarak yetişkin kabul edilir.
- **18 yaş altı:** alana girince kilitlenir, alandan çıkınca açılır. Kilit süresi ve mola kullanılmaz.
- **18 yaş ve üzeri:** her yerde **kilit süresi** ve **mola** vardır. Örneğin 50 dk kilit + 10 dk mola: alana girince kilitlenir, 50 dk sonra mola için açılır, 10 dk sonra hâlâ içerideysen tekrar kilitlenir. Süre 0 ise çıkınca açılır.
- Bir yer adı yazıp **Kilidi kur** dersin; yeni alanlar ayarlardan da eklenebilir.
- Şu anki konumun o yerin merkezi olur. Algılama yarıçapı varsayılan 100 metredir ve her kişisel yer için 50–1000 metre arasında ayarlanabilir.
- Kaydedince yerin kendi ekranına geçer: radar, konum durumu, **kaç kez kapandığı**, toplam kilit süresi ve son kapanma zamanı.
- Alanın içine girdiğinde tam ekran **siyah, animasyonsuz** kilit perdesi açılır; çıkınca otomatik kapanır. Bu, gerçek ekran kapanması değildir; web uygulaması ekranı fiziksel olarak kapatamaz.
- Sağ alttaki **ayarlar** düğmesinden yeni yerler ekleyebilir, mevcut yerin adını ve sürelerini değiştirebilir, sayacı sıfırlayabilir, yedek alabilirsin.
- Kilit ekranında sesli uyarı, titreşim ve bildirim vardır.
- **Pil tasarrufu** varsayılan olarak açıktır: konum daha seyrek ve düşük doğrulukla güncellenir, uygulama arka plana atılınca takip durur.
- Kişisel veriler yalnızca cihazda (localStorage) tutulur. Grup kullanırsan grup verileri sunucuda saklanır.

## Çalıştırma (Linux / macOS)

Gereksinim: [Node.js 18+](https://nodejs.org/)

```bash
cd alan-kilit
chmod +x baslat.sh
./baslat.sh
```

Alternatif:

```bash
npm start
# veya doğrudan:
node server.js
```

Sonra tarayıcıda:

```
http://localhost:8090
```

Sunucu Node.js ile yazıldığı için Linux ve macOS üzerinde ek bağımlılık gerektirmez. `baslat.sh` Linux'ta `xdg-open`, macOS'te `open` ile tarayıcıyı açar. `baslat.bat` yalnızca Windows için opsiyonel bir kısayoldur; Linux/macOS'ta kullanılmaz.

## Tarayıcıda kullanma ve cihaza kurma

1. Yukarıdaki web sayfasını cihazının tarayıcısında aç.
2. Destekleniyorsa sayfadaki **Cihaza kur** düğmesine basıp tarayıcının kurulum istemini onayla.
3. Kurulum düğmesi sunulmuyorsa tarayıcı menüsünü açıp **Uygulamayı yükle / Ana ekrana ekle** seçeneğini kullan. iPhone/iPad'de Safari'nin **Paylaş → Ana Ekrana Ekle** seçeneğini kullan.

### Güncelleme

Aynı web adresinden kullanılan kurulu uygulama, yeni dosyaları açılışta ve belirli aralıklarla denetler; güncellemeyi uygulama içindeki **Güncelle** düğmesiyle yükleyebilirsin. İndirilen/eski sürümler de GitHub'daki son sürümü denetler; yeni sürüm varsa Ayarlar → Genel bölümünden **Güncellemeyi denetle** veya ekrandaki **Yeni sürümü indir** düğmesiyle güncel web uygulamasını açıp cihaza kurabilirsin.

Güvenlik nedeniyle tarayıcı, indirilen bir klasördeki dosyaların üzerine uygulamanın kendisinin yazmasına izin vermez. Klasör kopyalarında **Yeni sürümü indir** güncel web sayfasını açar; kalıcı kullanım için bu sayfadan PWA olarak yeniden kur. `data/groups.json` gibi yerel verileri silme. Uzaktan sürüm denetimi 1.1.0 ve sonrası sürümlerde bulunur; daha eski kopyalar önce güncel sürümle değiştirilmelidir.

### Otomatik konum için HTTPS şart

Tarayıcılar konum iznini yalnızca **güvenli kaynaklarda** (HTTPS veya localhost) verir. Telefonda `http://192.168...` adresiyle konum çalışmaz.

İki seçenek:

**A) Yerel HTTPS (bu bilgisayar üzerinden)**

```bash
chmod +x tools/sertifika-olustur.sh
./tools/sertifika-olustur.sh
npm start
```

Telefonda `https://<bilgisayar-ip>:8090` aç, sertifika uyarısında **Gelişmiş → Devam et** de. Ardından konum iznini ver.

`tools/sertifika-olustur.sh` hem OpenSSL (Linux) hem LibreSSL (macOS) ile çalışacak şekilde yazıldı. macOS'te `openssl` genellikle hazırdır; değilse `brew install openssl` kullan. Sertifika oluşturduktan sonra `./baslat.sh` da otomatik olarak `https://localhost:8090` açar.

> Windows'ta yerel HTTPS için alternatif: `powershell -ExecutionPolicy Bypass -File tools\sertifika-olustur.ps1`

**B) Ücretsiz statik barındırma (en kolay ve güvenilir)**

GitHub Pages yayını bu depoda otomatik olarak güncellenir. HTTPS üzerinden açılan web uygulamasında kişisel yerler ve sayaçlar cihazda kalır. **Grup, davet ve uzaktan kilit özellikleri için Node sunucusu gerekir;** statik web yayında grup API'leri çalışmaz.

## Kullanım akışı

1. **Kilidi kur** → yerin ekranı açılır.
2. Alanın içindeysen uygulama bunu "zaten içeridesin" sayar; kilit, **çıkıp tekrar girdiğinde** devreye girer. Böylece uygulamayı açtığın anda kendini kilitlemez.
3. Alandan çıkınca kilit açılır; tekrar girince sayaç bir artar.
4. Yer ekranındaki **Konumu buraya ayarla** ile merkezi güncelleyebilirsin. 18 yaş ve üzerinde kilit süresi ve mola, ayarlardaki **Bu yer** bölümündedir. 18 yaş altında süre yerine alandan çıkınca açılır.
5. Ayarlardan **Kilidi 5 sn test et** ile sayaç artırmadan deneme yapabilirsin.

## Grup kullanımı

Grup özelliği için `server.js` çalışıyor olmalıdır. Grup verileri `data/groups.json` dosyasında tutulur; bu dosya `.gitignore` içindedir.

18 yaş altındaki kullanıcılar **grup oluşturamaz**; yalnızca davet veya grup koduyla bir gruba katılabilir. Grup oluşturma düğmesi bu yaş grubunda görünmez.

1. Ayarlar → **Grup oluştur**. Grubu oluşturan kişi yönetici olur.
2. Yönetici, **Telefonla davet et** ile numara ekler. **SMS / Paylaş** cihazın mesajlaşma/paylaşma ekranını açar ve davet bağlantısını kopyalar. SMS gönderimi için ayrı bir SMS servisi yoktur.
3. Davet bağlantısı `?davet=...` ile açılır. Davet yalnızca davet edilen telefon numarasıyla kabul edilir.
4. Grup koduyla katılmak isteyenler **bekleyen istek** oluşturur; yönetici onaylar veya reddeder.
5. Yönetici **Grup yeri ekle** ile ortak otomatik kilit alanları tanımlar. Konum, ekleme anındaki cihaz konumundan alınır; yarıçap sabittir.
6. Yönetici üyeleri tek tek veya **Hepsini kilitle/aç** ile uzaktan kilitleyebilir. Uzaktan kilit, üyenin uygulaması açıkken çalışır.
7. Yönetici üyelerin telefonunu, son görülme zamanını, kilit durumunu, paylaşılan konumunu ve uygulama içi hareketlerini görür. Üye konum paylaşımını kapatabilir; kilit ve durum bilgisi paylaşılmaya devam eder.
8. Bir cihaz aynı anda tek grupta olabilir. Üye gruptan ayrılabilir, yönetici üyeyi çıkarabilir veya grubu dağıtabilir.

### Grup gizliliği

- Konum yalnızca üyenin uygulaması açıkken ve **Konumumu yöneticiyle paylaş** açıksa gönderilir.
- Yönetici, üyenin bu uygulama dışındaki telefon hareketlerini veya konum geçmişini göremez.
- Grup silinince üyelerin cihazlarındaki grup kilidi açılır.

## Acil çıkış

Kilit ekranı tam siyah perdeyle kaplıyken **•••** görünmez. Sağ alt köşeye ~2 saniye bas, açılan kutuya `AÇ` yaz. Bu, güvenlik için vardır ve ayarlardan kapatılabilir.

## Önemli sınırlar

Bu bir web uygulamasıdır; işletim sisteminin yerine geçmez:

- Cihazı **tamamen kapatamaz**, uygulamaları sonlandıramaz.
- Kilit sırasında ekranı **tam siyah, animasyonsuz bir perde** kaplar; bu gerçek ekran kapanması değildir. Ekran fiziksel olarak kapanırsa konum takibi durur, bu yüzden otomatik açılma da çalışmaz. Otomatik açılma için uygulama açık kalmalıdır.
- **Gelen aramaları engelleyemez.** Bunun için Android'de **Rahatsız Etme** iznini, iOS'ta **Odaklanma** modunu ayrıca açmalısın.
- Kilit yalnızca uygulama açıkken ve konum izni verildiğinde çalışır. Tarayıcıyı kapatmak veya uygulamayı arka plana atmak takibi durdurur; bu nedenle otomatik kilit ve uzaktan kilit için uygulamayı açık tut.
- Sayfa yenilenirse kilit kaydı korunur; konum alınınca durum yeniden değerlendirilir. Süreli kilitte mola süresi de cihazda saklanır.
- 18 yaş altı için “alandan çıkınca” ifadesi seçilen algılama alanının dışına çıkmak anlamına gelir; GPS hassasiyeti nedeniyle tek bir adım değil, alan sınırı esas alınır.
- Pil tasarrufu açıkken konum düşük doğrulukla güncellenir. Alan sınırında gecikme veya yanlış algılama olabilir; gerekirse yarıçapı büyüt veya ayarlardan pil tasarrufunu kapat.
- Web uygulaması arka planda konum izleyemediği için **uygulama kapalıyken veya tamamen kapatılmışken otomatik kilit çalışmaz**.
- Grup yöneticisi yalnızca bu uygulamanın paylaştığı verileri görür; telefonun diğer uygulamalarını, aramaları veya gerçek konum geçmişini göremez.

## Dosya yapısı

```text
alan-kilit/
  index.html
  assets/style.css
  assets/app.js
  manifest.webmanifest
  sw.js
  icon.svg, icon-192.png, icon-512.png, icon-maskable-512.png
  server.js
  package.json
  baslat.sh
  baslat.bat
  tools/make-icons.sh
  tools/sertifika-olustur.sh
  tools/make-icons.ps1
  tools/sertifika-olustur.ps1
  README.md
```

### Linux / macOS yardımcıları

```bash
chmod +x baslat.sh tools/*.sh
./tools/sertifika-olustur.sh   # HTTPS sertifikası (openssl)
./tools/make-icons.sh          # PNG ikonları (ImageMagick)
```

macOS'te ImageMagick yoksa: `brew install imagemagick`
