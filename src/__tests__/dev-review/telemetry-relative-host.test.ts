import { describe, expect, it } from "vitest";

import { resolveSunbirdHost } from "@/lib/config/env-flags";
import { getSunbirdConfig } from "@/lib/sunbird-telemetry/config";

// Owner dev review §5 (guard): the opt-in Vite dev proxy forwards `/observability-service`, so
// a relative SUNBIRD_TELEMETRY_HOST must be used as-is (no API base prepended, not dropped).

const RELATIVE_HOST = "/observability-service";

describe("relative Sunbird telemetry host (dev review §5)", () => {
	it("resolveSunbirdHost keeps a relative override unchanged", () => {
		expect(resolveSunbirdHost(RELATIVE_HOST, "")).toBe(RELATIVE_HOST);
	});

	it("getSunbirdConfig is enabled and posts to the relative telemetry endpoint", () => {
		const config = getSunbirdConfig({ SUNBIRD_TELEMETRY_HOST: RELATIVE_HOST }, "", "");

		expect(config.enabled).toBe(true);
		expect(config.endpointUrl).toBe("/observability-service/action/data/v3/telemetry");
	});
});
