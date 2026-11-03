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
