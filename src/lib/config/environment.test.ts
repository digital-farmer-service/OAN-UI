import { afterEach, describe, expect, it, vi } from "vitest";

// The container writes /env-config.js, which defines window.__ENV__ before the app loads.
// `environment` reads it at import time, so each case stubs window and re-imports the module.

afterEach(() => {
	vi.unstubAllGlobals();
	vi.resetModules();
});

async function loadEnvironment(runtimeEnv: unknown) {
	vi.stubGlobal("window", runtimeEnv === undefined ? {} : { __ENV__: runtimeEnv });
	vi.resetModules();
	const { environment } = await import("./environment");
	return environment;
}

describe("environment.apiUrl from window.__ENV__", () => {
	it("uses VITE_API_URL from the runtime env config", async () => {
		const environment = await loadEnvironment({ VITE_API_URL: "https://api.example.test" });

		expect(environment.apiUrl).toBe("https://api.example.test");
	});

	it.each(["https://api.example.test/", "https://api.example.test//"])(
		"strips trailing slashes: %s",
		async (url) => {
			const environment = await loadEnvironment({ VITE_API_URL: url });

			expect(environment.apiUrl).toBe("https://api.example.test");
		}
	);

	it("keeps the path of a path-bearing URL", async () => {
		const environment = await loadEnvironment({ VITE_API_URL: "https://h.test/base/" });

		expect(environment.apiUrl).toBe("https://h.test/base");
	});

	it("trims surrounding whitespace", async () => {
		const environment = await loadEnvironment({ VITE_API_URL: "  https://api.example.test/  " });

		expect(environment.apiUrl).toBe("https://api.example.test");
	});

	it.each([
		["window.__ENV__ undefined", undefined],
		["VITE_API_URL missing", {}],
		["VITE_API_URL empty", { VITE_API_URL: "" }],
		["VITE_API_URL whitespace-only", { VITE_API_URL: "   " }]
	])("falls back to same-origin '' when %s", async (_label, runtimeEnv) => {
		const environment = await loadEnvironment(runtimeEnv);

		expect(environment.apiUrl).toBe("");
	});
});

describe("environment defaults", () => {
	it("keeps the other fields unchanged when a runtime API URL is set", async () => {
		const environment = await loadEnvironment({ VITE_API_URL: "https://api.example.test" });

		expect(environment).toMatchObject({
			notificationApiUrl:
				import.meta.env.VITE_NOTIFICATION_API_URL ||
				"https://registry-vistaar.da.gov.in/notification-api",
			maintenanceMode: false,
			guestUserLimit: 10,
			suggestionsDisabled: true,
			chatMessageMaxLength: 1000
		});
	});
});

// Telemetry flags (doc 80 §4.3). Values come from window.__ENV__ as strings. "true"/"false" are
// matched case-insensitively after trimming; anything else falls back to the default.
type TelemetryFlags = {
	telemetryEnabled: boolean;
	feedbackEnabled: boolean;
	sunbirdTelemetryEnabled: boolean;
	sunbirdTelemetryHost: string;
};

async function loadFlags(runtimeEnv: unknown): Promise<TelemetryFlags> {
	return (await loadEnvironment(runtimeEnv)) as unknown as TelemetryFlags;
}

describe("environment relay flags (TELEMETRY_ENABLED / FEEDBACK_ENABLED)", () => {
	it.each([
		["window.__ENV__ undefined", undefined],
		["keys missing", {}],
		["keys empty", { TELEMETRY_ENABLED: "", FEEDBACK_ENABLED: "" }],
		["keys whitespace-only", { TELEMETRY_ENABLED: "  ", FEEDBACK_ENABLED: " " }],
		["keys 'false'", { TELEMETRY_ENABLED: "false", FEEDBACK_ENABLED: " FALSE " }],
		["keys unrecognised", { TELEMETRY_ENABLED: "yes", FEEDBACK_ENABLED: "1" }]
	])("default off in this fork when %s", async (_label, runtimeEnv) => {
		const flags = await loadFlags(runtimeEnv);

		expect(flags.telemetryEnabled).toBe(false);
		expect(flags.feedbackEnabled).toBe(false);
	});

	it.each(["true", "TRUE", " True ", "\ttrue\n"])("'%s' enables both", async (value) => {
		const flags = await loadFlags({ TELEMETRY_ENABLED: value, FEEDBACK_ENABLED: value });

		expect(flags.telemetryEnabled).toBe(true);
		expect(flags.feedbackEnabled).toBe(true);
	});

	it("parses the two relay flags independently", async () => {
		const flags = await loadFlags({ TELEMETRY_ENABLED: "true", FEEDBACK_ENABLED: "false" });

		expect(flags.telemetryEnabled).toBe(true);
		expect(flags.feedbackEnabled).toBe(false);
	});
});

describe("environment Sunbird flags (SUNBIRD_TELEMETRY_ENABLED / SUNBIRD_TELEMETRY_HOST)", () => {
	it.each([
		["window.__ENV__ undefined", undefined],
		["key missing", {}],
		["key empty", { SUNBIRD_TELEMETRY_ENABLED: "" }],
		["key unrecognised", { SUNBIRD_TELEMETRY_ENABLED: "no" }],
		["key 'true'", { SUNBIRD_TELEMETRY_ENABLED: " TRUE " }]
	])("sunbirdTelemetryEnabled defaults on when %s", async (_label, runtimeEnv) => {
		const flags = await loadFlags(runtimeEnv);

		expect(flags.sunbirdTelemetryEnabled).toBe(true);
	});

	it.each(["false", " FALSE ", "False"])("'%s' disables Sunbird telemetry", async (value) => {
		const flags = await loadFlags({ SUNBIRD_TELEMETRY_ENABLED: value });

		expect(flags.sunbirdTelemetryEnabled).toBe(false);
	});

	it("sunbirdTelemetryHost defaults to <apiUrl>/observability-service", async () => {
		const flags = await loadFlags({ VITE_API_URL: "https://api.example.test/" });

		expect(flags.sunbirdTelemetryHost).toBe("https://api.example.test/observability-service");
	});

	it("sunbirdTelemetryHost override is trimmed and loses trailing slashes", async () => {
		const flags = await loadFlags({
			VITE_API_URL: "https://api.example.test",
			SUNBIRD_TELEMETRY_HOST: "  https://obs.example.test/observability-service//  "
		});

		expect(flags.sunbirdTelemetryHost).toBe("https://obs.example.test/observability-service");
	});

	it("sunbirdTelemetryHost is empty when neither apiUrl nor an override is set (no dev fallback)", async () => {
		const flags = await loadFlags({ VITE_API_URL: "", SUNBIRD_TELEMETRY_HOST: "  " });

		expect(flags.sunbirdTelemetryHost).toBe("");
	});
});
