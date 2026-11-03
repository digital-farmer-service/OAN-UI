// Runtime API base URL, injected at container start via /env-config.js (window.__ENV__).
const runtimeApiUrl = typeof window === 'undefined' ? undefined : window.__ENV__?.VITE_API_URL;

export const environment = {
  apiUrl: (runtimeApiUrl ?? '').trim().replace(/\/+$/, ''),
  notificationApiUrl: import.meta.env.VITE_NOTIFICATION_API_URL || 'https://registry-vistaar.da.gov.in/notification-api',
  maintenanceMode: false,
  guestUserLimit: 10,
  suggestionsDisabled: true,
  chatMessageMaxLength: 1000,
};
