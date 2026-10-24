/* uzayOS yerel sunucusu — sadece localhost (127.0.0.1) üzerinde çalışır */
const http = require('http');
const fs = require('fs');
const path = require('path');

const KOK = path.join(__dirname, 'uzayos');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

function baslat(port) {
  const sunucu = http.createServer((istek, yanit) => {
    let yol = decodeURIComponent(istek.url.split('?')[0]);
    if (yol === '/') yol = '/index.html';
    const dosya = path.join(KOK, yol);
    if (!dosya.startsWith(KOK)) { yanit.writeHead(403); return yanit.end('Yasak'); }
    fs.readFile(dosya, (hata, veri) => {
      if (hata) { yanit.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return yanit.end('404 - Bulunamadı'); }
      yanit.writeHead(200, { 'Content-Type': MIME[path.extname(dosya).toLowerCase()] || 'application/octet-stream' });
      yanit.end(veri);
    });
  });
  sunucu.on('error', e => {
    if (e.code === 'EADDRINUSE') { console.log(`[uzayOS] Port ${port} dolu, ${port + 1} deneniyor...`); baslat(port + 1); }
    else throw e;
  });
  sunucu.listen(port, '127.0.0.1', () => {
    console.log('==============================================');
    console.log('   uzayOS sunucusu çalışıyor!');
    console.log('   Tarayıcında şunu aç:  http://localhost:' + port);
    console.log('   Durdurmak için: Ctrl+C');
    console.log('==============================================');
  });
}

baslat(8080);
