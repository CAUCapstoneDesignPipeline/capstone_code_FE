#!/bin/sh
set -eu
case "${CAPSTONE_WEB_MODE:-api-only}" in
  api-only) root=/usr/share/nginx/ready ;;
  notes-web) root=/usr/share/nginx/app ;;
  *) printf 'Unsupported web mode\n' >&2; exit 78 ;;
esac
sed "s|CAPSTONE_STATIC_ROOT|$root|g" /etc/nginx/nginx.conf > /tmp/nginx.conf
nginx -t -c /tmp/nginx.conf
exec nginx -c /tmp/nginx.conf -g 'daemon off;'
