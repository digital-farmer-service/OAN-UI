// Parsing helpers for the runtime keys in window.__ENV__ (written by docker-entrypoint.d/40-env-config.sh).
// Pure functions so environment.ts and the Sunbird config share one definition.

export type RuntimeEnv = Record<string, string | undefined>;

export const SUNBIRD_HOST_SUFFIX = "/observability-service";

export function readRuntimeEnv(): RuntimeEnv {
	if (typeof window === "undefined") return {};
	return (window.__ENV__ as RuntimeEnv | undefined) ?? {};
}

/** Trims and removes trailing slashes; non-strings become "". */
export function normalizeUrl(value: unknown): string {
	return typeof value === "string" ? value.trim().replace(/\/+$/, "") : "";
}

/** "true" / "false" (trimmed, case-insensitive); anything else gives the default. */
export function parseBooleanFlag(value: unknown, defaultValue: boolean): boolean {
	if (typeof value !== "string") return defaultValue;
	const normalized = value.trim().toLowerCase();
	if (normalized === "true") return true;
	if (normalized === "false") return false;
	return defaultValue;
}

/** SUNBIRD_TELEMETRY_HOST override, else `${apiUrl}/observability-service`, else "" (no dev fallback). */
export function resolveSunbirdHost(override: unknown, apiUrl: string): string {
	const explicit = normalizeUrl(override);
	if (explicit) return explicit;
	const base = normalizeUrl(apiUrl);
	return base ? `${base}${SUNBIRD_HOST_SUFFIX}` : "";
}

export const DEFAULT_GA_MEASUREMENT_ID = "G-SV0TLS2S41";
const GA_MEASUREMENT_ID_PATTERN = /^G-[A-Z0-9]{6,}$/;

/** GA_MEASUREMENT_ID: unset/empty gives the prod id; a value that is not a GA4 id gives "" (GA off). */
export function resolveGaMeasurementId(value: unknown): string {
	const trimmed = typeof value === "string" ? value.trim() : "";
	if (!trimmed) return DEFAULT_GA_MEASUREMENT_ID;
	return GA_MEASUREMENT_ID_PATTERN.test(trimmed) ? trimmed : "";
}
