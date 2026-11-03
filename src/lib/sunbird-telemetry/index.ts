import apiService from "@/lib/api-service";

import { createSunbirdTelemetry } from "./client";
import { getSunbirdConfig } from "./config";
import { newMid } from "./events";
import { getFingerprintDetails } from "./fingerprint";

// Singleton the chat store calls (doc 80 §6.1). Config is read once from window.__ENV__.

export const sunbirdTelemetry = createSunbirdTelemetry({
	config: getSunbirdConfig(),
	getToken: (opts) => apiService.getTelemetryAuthToken(opts),
	fetch: (input, init) => globalThis.fetch(input, init),
	now: () => Date.now(),
	newMid,
	getFingerprint: () => getFingerprintDetails()
});

export {
	clearTimers,
	getPerformance,
	markFirstByte,
	markPainted,
	markRequestStart,
	markResponseEnd
} from "./timers";
export type { SunbirdTelemetry } from "./types";
