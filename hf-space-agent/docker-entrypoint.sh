#!/bin/sh
set -eu

RESOLV_CONF_PATH="${RESOLV_CONF_PATH:-/etc/resolv.conf}"

cat >"${RESOLV_CONF_PATH}" <<'EOF'
nameserver 8.8.8.8
nameserver 1.1.1.1
EOF

echo "Configured DNS via ${RESOLV_CONF_PATH}"
echo "Running as uid=$(id -u) gid=$(id -g)"

exec "$@"
