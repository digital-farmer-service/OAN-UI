import { environment } from "@/lib/config/environment";
import {
	parseBooleanFlag,
	readRuntimeEnv,
	resolveSunbirdHost,
	type RuntimeEnv
} from "@/lib/config/env-flags";

import type { SunbirdConfig } from "./types";

export const TELEMETRY_PATH = "/action/data/v3/telemetry";
export const PDATA = { id: "BiharKrishi", ver: "v0.1" } as const;

function currentOrigin(): string {
	if (typeof window === "undefined") return "";
	return window.location?.origin ?? "";
}

/**
 * Emitter config for the old Bihar Krishi Sunbird V3 pipeline (doc 80 §4.3).
 * Disabled when the flag is "false" or when no host can be derived (no dev fallback).
 */
export function getSunbirdConfig(
	env: RuntimeEnv = readRuntimeEnv(),
	apiUrl: string = environment.apiUrl,
	origin: string = currentOrigin()
): SunbirdConfig {
	const host = resolveSunbirdHost(env.SUNBIRD_TELEMETRY_HOST, apiUrl);
	return {
		enabled: parseBooleanFlag(env.SUNBIRD_TELEMETRY_ENABLED, true) && host !== "",
		endpointUrl: host ? `${host}${TELEMETRY_PATH}` : "",
		pdata: { ...PDATA },
		channel: `BiharKrishi-${origin}`
	};
}
