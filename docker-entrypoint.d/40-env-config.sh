#!/bin/sh
# Runs via the nginx image's /docker-entrypoint.d chain before nginx starts.
# Writes runtime config consumed as window.__ENV__ (see public/env-config.example.js).
# HTML_DIR may be overridden to run this script outside the container (local testing).
set -e

HTML_DIR="${HTML_DIR:-/usr/share/nginx/html}"

# Emit a JSON string literal: escape backslash and double quote, drop control characters.
json_str() {
  printf '"%s"' "$(printf '%s' "$1" | tr -d '\000-\037' | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g')"
}

# Empty values fall back to the app defaults (see src/lib/config/environment.ts).
cat <<EOF > "$HTML_DIR/env-config.js"
window.__ENV__ = {
  VITE_API_URL: $(json_str "${VITE_API_URL:-}"),
  TELEMETRY_ENABLED: $(json_str "${TELEMETRY_ENABLED:-}"),
  FEEDBACK_ENABLED: $(json_str "${FEEDBACK_ENABLED:-}"),
  SUNBIRD_TELEMETRY_ENABLED: $(json_str "${SUNBIRD_TELEMETRY_ENABLED:-}"),
  SUNBIRD_TELEMETRY_HOST: $(json_str "${SUNBIRD_TELEMETRY_HOST:-}")
};
EOF

# Cache-bust so a changed env-config.js is picked up after redeploy without a hard refresh.
if [ -f "$HTML_DIR/index.html" ]; then
  sed -i "s#env-config\.js\(?v=[0-9]*\)\?#env-config.js?v=$(date +%s)#" "$HTML_DIR/index.html"
fi

echo "Generated env-config.js with VITE_API_URL=${VITE_API_URL:-'(not set)'}" \
  "TELEMETRY_ENABLED=${TELEMETRY_ENABLED:-'(default false)'}" \
  "FEEDBACK_ENABLED=${FEEDBACK_ENABLED:-'(default false)'}" \
  "SUNBIRD_TELEMETRY_ENABLED=${SUNBIRD_TELEMETRY_ENABLED:-'(default true)'}" \
  "SUNBIRD_TELEMETRY_HOST=${SUNBIRD_TELEMETRY_HOST:-'(default <VITE_API_URL>/observability-service)'}"
