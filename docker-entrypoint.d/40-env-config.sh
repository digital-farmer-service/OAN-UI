#!/bin/sh
# Runs via the nginx image's /docker-entrypoint.d chain before nginx starts.
# Writes runtime config consumed as window.__ENV__ (see public/env-config.example.js).
set -e

HTML_DIR=/usr/share/nginx/html

cat <<EOF > "$HTML_DIR/env-config.js"
window.__ENV__ = {
  VITE_API_URL: "${VITE_API_URL:-}"
};
EOF

# Cache-bust so a changed env-config.js is picked up after redeploy without a hard refresh.
if [ -f "$HTML_DIR/index.html" ]; then
  sed -i "s#env-config\.js\(?v=[0-9]*\)\?#env-config.js?v=$(date +%s)#" "$HTML_DIR/index.html"
fi

echo "Generated env-config.js with VITE_API_URL=${VITE_API_URL:-'(not set)'}"
