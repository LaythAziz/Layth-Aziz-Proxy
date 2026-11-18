#!/bin/sh
set -eu

: "${MT_PROXY_SECRET:?Set MT_PROXY_SECRET to 32 hexadecimal characters; generate with openssl rand -hex 16}"
PORT="${MT_PROXY_PORT:-443}"
WORKERS="${MT_PROXY_WORKERS:-1}"

case "$MT_PROXY_SECRET" in
  *[!0-9a-fA-F]*|'') echo "MT_PROXY_SECRET must contain only hexadecimal characters." >&2; exit 1 ;;
esac
if [ "${#MT_PROXY_SECRET}" -ne 32 ]; then
  echo "MT_PROXY_SECRET must be exactly 32 hexadecimal characters." >&2
  exit 1
fi
case "$PORT" in
  *[!0-9]*|'') echo "MT_PROXY_PORT must be numeric." >&2; exit 1 ;;
esac
if [ "$PORT" -lt 1 ] || [ "$PORT" -gt 65535 ]; then
  echo "MT_PROXY_PORT must be between 1 and 65535." >&2
  exit 1
fi

mkdir -p /var/lib/mtproxy
cd /var/lib/mtproxy
echo "Downloading current Telegram MTProxy server secret and config..."
curl --fail --silent --show-error --location https://core.telegram.org/getProxySecret -o proxy-secret
curl --fail --silent --show-error --location https://core.telegram.org/getProxyConfig -o proxy-multi.conf
chown mtproxy:mtproxy proxy-secret proxy-multi.conf
chmod 0644 proxy-secret proxy-multi.conf

echo "Starting LAYTH AZIZ PROXY on container TCP port 8443..."
exec /usr/local/bin/mtproto-proxy -u mtproxy -p 8888 -H 8443 -S "$MT_PROXY_SECRET" --aes-pwd proxy-secret proxy-multi.conf -M "$WORKERS"
