import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The singleton the chat store calls (doc 80 §6.1): wired to window.__ENV__ / environment,
// apiService.getTelemetryAuthToken and the global fetch. The store imports the timer marks
// from the same entry point.

const { getTelemetryAuthToken } = vi.hoisted(() => ({ getTelemetryAuthToken: vi.fn() }));

vi.mock("@/lib/api-service", () => ({ default: { getTelemetryAuthToken } }));
vi.mock("@fingerprintjs/fingerprintjs", () => ({
	default: { load: vi.fn(async () => ({ get: async () => ({ visitorId: "vis-1" }) })) }
}));

interface IndexModule {
	sunbirdTelemetry: {
		logQuestion(p: { qid: string; sessionId: string; questionText: string }): Promise<void>;
	};
	markRequestStart: (qid: string, t?: number) => void;
	markFirstByte: (qid: string, t?: number) => void;
	markResponseEnd: (qid: string, t?: number) => void;
	markPainted: (qid: string, t?: number) => void;
	clearTimers: (qid: string) => void;
}

const INDEX_MODULE = "./index";
const Q = { qid: "c1", sessionId: "sess-1", questionText: "q" };

let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

async function loadIndex(env: Record<string, string>): Promise<IndexModule> {
	vi.stubGlobal("window", {
		__ENV__: env,
		location: { origin: "https://www.biharkrishi.in" },
		navigator: { userAgent: "Mozilla/5.0" }
	});
	vi.resetModules();
	return (await import(/* @vite-ignore */ INDEX_MODULE)) as IndexModule;
}

beforeEach(() => {
	getTelemetryAuthToken.mockReset().mockResolvedValue("t1");
	fetchMock = vi.fn<typeof fetch>().mockResolvedValue({ ok: true, status: 200 } as Response);
	vi.stubGlobal("fetch", fetchMock);
	vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0" });
	vi.stubGlobal("localStorage", {
		getItem: vi.fn(() => null),
		setItem: vi.fn(),
		removeItem: vi.fn()
	});
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.resetModules();
});

describe("sunbirdTelemetry singleton", () => {
	it("exports the store seams", async () => {
		const mod = await loadIndex({ VITE_API_URL: "https://api.t" });

		expect(typeof mod.sunbirdTelemetry.logQuestion).toBe("function");
		for (const name of [
			"markRequestStart",
			"markFirstByte",
			"markResponseEnd",
			"markPainted",
			"clearTimers"
		] as const) {
			expect(typeof mod[name]).toBe("function");
		}
	});

	it("posts to <apiUrl>/observability-service with the apiService telemetry token", async () => {
		const { sunbirdTelemetry } = await loadIndex({ VITE_API_URL: "https://api.t/" });

		await sunbirdTelemetry.logQuestion(Q);

		expect(getTelemetryAuthToken).toHaveBeenCalled();
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe("https://api.t/observability-service/action/data/v3/telemetry");
		expect(new Headers(init.headers).get("authorization")).toBe("Bearer t1");
		const body = JSON.parse(String(init.body)) as { events: { channel: string; pdata: unknown }[] };
		expect(body.events[0]?.channel).toBe("BiharKrishi-https://www.biharkrishi.in");
		expect(body.events[0]?.pdata).toStrictEqual({ id: "BiharKrishi", ver: "v0.1" });
	});

	it("SUNBIRD_TELEMETRY_ENABLED=false sends nothing", async () => {
		const { sunbirdTelemetry } = await loadIndex({
			VITE_API_URL: "https://api.t",
			SUNBIRD_TELEMETRY_ENABLED: "false"
		});

		await sunbirdTelemetry.logQuestion(Q);

		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("SUNBIRD_TELEMETRY_HOST overrides the host", async () => {
		const { sunbirdTelemetry } = await loadIndex({
			VITE_API_URL: "https://api.t",
			SUNBIRD_TELEMETRY_HOST: "https://obs.t/observability-service/"
		});

		await sunbirdTelemetry.logQuestion(Q);

		expect(fetchMock.mock.calls[0]?.[0]).toBe(
			"https://obs.t/observability-service/action/data/v3/telemetry"
		);
	});
});
