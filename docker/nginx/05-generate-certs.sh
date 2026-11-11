#!/bin/sh
set -e

CERT_DIR="/etc/nginx/certs"
mkdir -p "$CERT_DIR"

if [ ! -f "$CERT_DIR/nulldrive.crt" ] || [ ! -f "$CERT_DIR/nulldrive.key" ]; then
  if ! command -v openssl >/dev/null 2>&1; then
    apk add --no-cache openssl >/dev/null
  fi
  openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
    -keyout "$CERT_DIR/nulldrive.key" \
    -out "$CERT_DIR/nulldrive.crt" \
    -subj "/C=BR/ST=SP/L=SaoPaulo/O=NullDrive/CN=localhost" \
    -addext "subjectAltName=DNS:localhost,DNS:nulldrive.local,IP:127.0.0.1"
  chmod 600 "$CERT_DIR/nulldrive.key"
  chmod 644 "$CERT_DIR/nulldrive.crt"
fi
