import { afterEach, describe, expect, it, vi } from "vitest";

// Sunbird V3 emitter config (doc 80 §4.3, §6.1). Loaded through a path variable so the suite
// compiles before ./config exists.

interface SunbirdConfig {
	enabled: boolean;
	endpointUrl: string;
	pdata: { id: string; ver: string };
	channel: string;
}

interface ConfigModule {
	getSunbirdConfig: (
		env?: Record<string, string | undefined>,
		apiUrl?: string,
		origin?: string
	) => SunbirdConfig;
}

const CONFIG_MODULE = "./config";
const API = "https://api.t";
const ORIGIN = "https://www.biharkrishi.in";
const TELEMETRY_PATH = "/action/data/v3/telemetry";

async function loadConfig(): Promise<ConfigModule> {
	vi.resetModules();
	return (await import(/* @vite-ignore */ CONFIG_MODULE)) as ConfigModule;
}

afterEach(() => {
	vi.unstubAllGlobals();
	vi.resetModules();
});

describe("getSunbirdConfig", () => {
	it("defaults: enabled, host from apiUrl, BiharKrishi pdata and channel", async () => {
		const { getSunbirdConfig } = await loadConfig();

		const config = getSunbirdConfig({}, API, ORIGIN);

		expect(config.enabled).toBe(true);
		expect(config.endpointUrl).toBe(`${API}/observability-service${TELEMETRY_PATH}`);
		expect(config.pdata).toStrictEqual({ id: "BiharKrishi", ver: "v0.1" });
		expect(config.channel).toBe("BiharKrishi-https://www.biharkrishi.in");
	});

	it.each(["false", " FALSE ", "False"])(
		"SUNBIRD_TELEMETRY_ENABLED '%s' disables",
		async (value) => {
			const { getSunbirdConfig } = await loadConfig();

			expect(getSunbirdConfig({ SUNBIRD_TELEMETRY_ENABLED: value }, API, ORIGIN).enabled).toBe(
				false
			);
		}
	);

	it.each(["true", " TRUE ", "", "garbage"])(
		"SUNBIRD_TELEMETRY_ENABLED '%s' keeps the default (on)",
		async (value) => {
			const { getSunbirdConfig } = await loadConfig();

			expect(getSunbirdConfig({ SUNBIRD_TELEMETRY_ENABLED: value }, API, ORIGIN).enabled).toBe(
				true
			);
		}
	);

	it("SUNBIRD_TELEMETRY_HOST overrides and strips trailing slash", async () => {
		const { getSunbirdConfig } = await loadConfig();

		const config = getSunbirdConfig(
			{ SUNBIRD_TELEMETRY_HOST: " https://obs.t/observability-service/ " },
			API,
			ORIGIN
		);

		expect(config.enabled).toBe(true);
		expect(config.endpointUrl).toBe(`https://obs.t/observability-service${TELEMETRY_PATH}`);
	});

	it("strips trailing slashes from apiUrl when deriving the host", async () => {
		const { getSunbirdConfig } = await loadConfig();

		expect(getSunbirdConfig({}, `${API}//`, ORIGIN).endpointUrl).toBe(
			`${API}/observability-service${TELEMETRY_PATH}`
		);
	});

	it("empty apiUrl and no host -> disabled (no dev fallback)", async () => {
		const { getSunbirdConfig } = await loadConfig();

		const config = getSunbirdConfig({ SUNBIRD_TELEMETRY_HOST: "  " }, "", ORIGIN);

		expect(config.enabled).toBe(false);
		expect(config.endpointUrl).not.toContain("dev-vistaar");
	});

	it("empty apiUrl with an explicit host stays enabled", async () => {
		const { getSunbirdConfig } = await loadConfig();

		const config = getSunbirdConfig(
			{ SUNBIRD_TELEMETRY_HOST: "https://obs.t/observability-service" },
			"",
			ORIGIN
		);

		expect(config.enabled).toBe(true);
		expect(config.endpointUrl).toBe(`https://obs.t/observability-service${TELEMETRY_PATH}`);
	});

	it("without arguments reads window.__ENV__, environment.apiUrl and window.location.origin", async () => {
		vi.stubGlobal("window", {
			__ENV__: { VITE_API_URL: "https://api.from-env.t/" },
			location: { origin: "https://qa.biharkrishi.t" }
		});
		const { getSunbirdConfig } = await loadConfig();

		const config = getSunbirdConfig();

		expect(config.enabled).toBe(true);
		expect(config.endpointUrl).toBe(
			`https://api.from-env.t/observability-service${TELEMETRY_PATH}`
		);
		expect(config.channel).toBe("BiharKrishi-https://qa.biharkrishi.t");
	});
});
