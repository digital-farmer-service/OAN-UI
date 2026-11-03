import {
  normalizeUrl,
  parseBooleanFlag,
  readRuntimeEnv,
  resolveGaMeasurementId,
  resolveSunbirdHost,
} from './env-flags';

// Runtime config, injected at container start via /env-config.js (window.__ENV__).
const runtimeEnv = readRuntimeEnv();
const apiUrl = normalizeUrl(runtimeEnv.VITE_API_URL);

export const environment = {
  apiUrl,
  notificationApiUrl: import.meta.env.VITE_NOTIFICATION_API_URL || 'https://registry-vistaar.da.gov.in/notification-api',
  maintenanceMode: false,
  guestUserLimit: 10,
  suggestionsDisabled: true,
  chatMessageMaxLength: 1000,
  // Upstream relay (/api/telemetry/*): off by default in this fork.
  telemetryEnabled: parseBooleanFlag(runtimeEnv.TELEMETRY_ENABLED, false),
  feedbackEnabled: parseBooleanFlag(runtimeEnv.FEEDBACK_ENABLED, false),
  // Re-ported Bihar Krishi Sunbird V3 emitter.
  sunbirdTelemetryEnabled: parseBooleanFlag(runtimeEnv.SUNBIRD_TELEMETRY_ENABLED, true),
  sunbirdTelemetryHost: resolveSunbirdHost(runtimeEnv.SUNBIRD_TELEMETRY_HOST, apiUrl),
  // Google Analytics (GA4, kept from the old app). QA/dev set GA_ENABLED=false.
  gaEnabled: parseBooleanFlag(runtimeEnv.GA_ENABLED, true),
  // "" when GA_MEASUREMENT_ID is set but invalid: the GA module then stays disabled.
  gaMeasurementId: resolveGaMeasurementId(runtimeEnv.GA_MEASUREMENT_ID),
};
