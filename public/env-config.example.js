// Local-dev copy: cp public/env-config.example.js public/env-config.js
// In containers this file is generated at start by docker-entrypoint.d/40-env-config.sh.
// All values are strings; an empty string means "use the app default".
window.__ENV__ = {
  // API base URL. Empty = same origin.
  VITE_API_URL: "",
  // Upstream relay /api/telemetry/events + /error. "true" enables; default false in this fork.
  TELEMETRY_ENABLED: "",
  // Upstream relay /api/telemetry/feedback. "true" enables; default false in this fork.
  FEEDBACK_ENABLED: "",
  // Bihar Krishi Sunbird V3 telemetry. "false" disables; default true.
  SUNBIRD_TELEMETRY_ENABLED: "",
  // Sunbird host override. Default <VITE_API_URL>/observability-service (off when both are empty).
  SUNBIRD_TELEMETRY_HOST: ""
};
