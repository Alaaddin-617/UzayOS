#!/usr/bin/env bash
# Telefonda otomatik konum için yerel HTTPS sertifikası üretir.
# Linux ve macOS uyumludur.
# Kullanım: ./tools/sertifika-olustur.sh
# Sonra sunucuyu yeniden başlat: npm start
set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v openssl >/dev/null 2>&1; then
  echo "openssl bulunamadı. Linux: sudo apt install openssl | macOS: brew install openssl" >&2
  exit 1
fi

mkdir -p certs

SAN="DNS:localhost,IP:127.0.0.1"

if command -v hostname >/dev/null 2>&1; then
  HOST="$(hostname 2>/dev/null || true)"
  if [ -n "$HOST" ]; then
    SAN="${SAN},DNS:${HOST}"
  fi
fi

# Linux: hostname -I yerel IPv4 adreslerini verir. macOS'te bu seçenek yoktur.
if command -v hostname >/dev/null 2>&1; then
  for IP in $(hostname -I 2>/dev/null || true); do
    if [[ "$IP" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}$ ]]; then
      case "$IP" in
        127.*|169.254.*) continue ;;
      esac
      SAN="${SAN},IP:${IP}"
    fi
  done
fi

# macOS: Wi-Fi / Ethernet arayüzünden IPv4 adresini ekle.
if command -v ipconfig >/dev/null 2>&1; then
  for IFACE in en0 en1 en2; do
    IP="$(ipconfig getifaddr "$IFACE" 2>/dev/null || true)"
    if [ -n "$IP" ]; then
      SAN="${SAN},IP:${IP}"
    fi
  done
fi

echo "Sertifika şu adlar için üretiliyor: ${SAN}"

# LibreSSL (macOS) -addext desteklemeyebilir; bu yüzden geçici config kullanıyoruz.
CONFIG="$(mktemp "${TMPDIR:-/tmp}/nerede-kapansin.XXXXXX")"
trap 'rm -f "$CONFIG"' EXIT

cat > "$CONFIG" <<EOF
[req]
prompt = no
distinguished_name = dn
x509_extensions = v3_req

[dn]
CN = Nerede Kapansin Local

[v3_req]
basicConstraints = CA:FALSE
keyUsage = digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = ${SAN}
EOF

openssl req -x509 -newkey rsa:2048 -sha256 -nodes -days 825 \
  -keyout certs/server.key \
  -out certs/server.crt \
  -config "$CONFIG" \
  -extensions v3_req

chmod 600 certs/server.key

echo ""
echo "Hazır: certs/server.key ve certs/server.crt"
echo "Sunucuyu yeniden başlat: npm start"
echo "Telefonda https://<bilgisayar-ip>:8090 adresini aç."
echo "Tarayıcı 'güvenli değil' derse 'Gelişmiş > Devam et' seç ve konum izni ver."
