/// <reference types="vite/client" />
declare module 'uuid';

interface Window {
  __ENV__?: {
    VITE_API_URL?: string;
    TELEMETRY_ENABLED?: string;
    FEEDBACK_ENABLED?: string;
    SUNBIRD_TELEMETRY_ENABLED?: string;
    SUNBIRD_TELEMETRY_HOST?: string;
  };
}
