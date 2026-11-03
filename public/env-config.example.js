// Local-dev copy: cp public/env-config.example.js public/env-config.js
// In containers this file is generated at start by docker-entrypoint.d/40-env-config.sh.
// All values are strings; an empty string means "use the app default".
// Local dev: same-origin API needs the dev proxy (set VITE_DEV_PROXY_TARGET=https://<backend> in
// .env.local) and GA_ENABLED must be "false" (see below).
window.__ENV__ = {
  // API base URL. Empty = same origin (nginx in the container has no /api proxy: set the backend URL there).
  VITE_API_URL: "",
  // Upstream relay /api/telemetry/events + /error. "true" enables; default false in this fork.
  TELEMETRY_ENABLED: "",
  // Upstream relay /api/telemetry/feedback. "true" enables; default false in this fork.
  FEEDBACK_ENABLED: "",
  // Bihar Krishi Sunbird V3 telemetry. "false" disables; default true.
  SUNBIRD_TELEMETRY_ENABLED: "",
  // Sunbird host override. Default <VITE_API_URL>/observability-service (off when both are empty).
  SUNBIRD_TELEMETRY_HOST: "",
  // Google Analytics (GA4). "false" disables; default true (when empty). QA/dev and LOCAL DEV must set
  // "false", otherwise localhost traffic goes to the production GA property.
  GA_ENABLED: "",
  // GA4 measurement id (G-XXXXXXX). Default G-SV0TLS2S41 (prod); an invalid value disables GA.
  GA_MEASUREMENT_ID: ""
};
