import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Upstream relay (/api/telemetry/{events,error,feedback}) is OFF by default in this fork
// (doc 80 §5): TELEMETRY_ENABLED gates events + error, FEEDBACK_ENABLED gates feedback.
// Disabled guards are silent no-ops: no token refresh, no axios call, no rejection.
// Also the public token seam for the Sunbird emitter: getTelemetryAuthToken({ forceRefresh }).

const { axiosPost, instancePost } = vi.hoisted(() => ({
	axiosPost: vi.fn(),
	instancePost: vi.fn()
}));

vi.mock("axios", () => {
	const instance = {
		defaults: { headers: { common: {} as Record<string, string> } },
		interceptors: { response: { use: vi.fn() }, request: { use: vi.fn() } },
		get: vi.fn(),
		post: instancePost,
		request: vi.fn()
	};
	return { default: { create: vi.fn(() => instance), post: axiosPost, isAxiosError: () => false } };
});

// The chat store (used by the toast case) will call the Sunbird singleton; keep it inert here.
vi.mock("@/lib/sunbird-telemetry", () => {
	const noop = vi.fn(async () => undefined);
	return {
		sunbirdTelemetry: { logQuestion: noop, logResponse: noop, logError: noop, logFeedback: noop },
		markRequestStart: vi.fn(),
		markFirstByte: vi.fn(),
		markResponseEnd: vi.fn(),
		markPainted: vi.fn(),
		clearTimers: vi.fn()
	};
});

const API_URL = "https://api.example.test";

function b64url(value: unknown): string {
	return btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
const STORED_JWT = `${b64url({ alg: "RS256" })}.${b64url({ sub: "stored", exp: 9_999_999_999 })}.s`;
const FRESH_JWT = `${b64url({ alg: "RS256" })}.${b64url({ sub: "fresh", exp: 9_999_999_999 })}.s`;

const FEEDBACK = {
	qid: "q-1",
	session_id: "sess-1",
	message_id: "m-1",
	feedback_type: "like",
	feedback_text: "Liked the response",
	question_text: "Q?",
	answer_text: "A."
};
const ERROR = { qid: "q-1", session_id: "sess-1", error_text: "boom", question_text: "Q?" };
const UI_EVENT = { event_name: "location_granted", category: "location", metadata: { a: 1 } };

type TelemetryApi = {
	submitTelemetryFeedback: (p: typeof FEEDBACK) => Promise<void>;
	submitTelemetryError: (p: typeof ERROR) => Promise<void>;
	trackUiTelemetryEvent: (e: typeof UI_EVENT) => void;
	setSessionId: (sid: string) => void;
	getTelemetryAuthToken: (opts?: { forceRefresh?: boolean }) => Promise<string | null>;
};

let store: Map<string, string>;

function stubBrowser(env: Record<string, string>) {
	vi.stubGlobal("window", {
		__ENV__: { VITE_API_URL: API_URL, ...env },
		screen: { width: 1, height: 1, colorDepth: 24 }
	});
	vi.stubGlobal("navigator", {
		userAgent: "ua",
		platform: "p",
		language: "en",
		languages: ["en"]
	});
}

async function loadApi(env: Record<string, string> = {}): Promise<TelemetryApi> {
	stubBrowser(env);
	vi.resetModules();
	const { default: apiService } = await import("./api-service");
	return apiService as unknown as TelemetryApi;
}

async function flush() {
	for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
}

function telemetryPosts() {
	return instancePost.mock.calls.filter(([url]) => String(url).startsWith("/api/telemetry"));
}

beforeEach(() => {
	axiosPost.mockReset().mockResolvedValue({ data: { token: FRESH_JWT } });
	instancePost.mockReset().mockResolvedValue({ data: {} });
	store = new Map([
		["auth_jwt", JSON.stringify({ token: STORED_JWT, expiry: Date.now() + 600_000 })],
		["fingerprint_context", JSON.stringify({ ready: true, data: { device_id: "dev-1" } })]
	]);
	vi.stubGlobal("localStorage", {
		getItem: vi.fn((k: string) => store.get(k) ?? null),
		setItem: vi.fn((k: string, v: string) => void store.set(k, String(v))),
		removeItem: vi.fn((k: string) => void store.delete(k))
	});
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	vi.resetModules();
});

describe("relay disabled (default in this fork)", () => {
	it.each([
		["flags unset", {}],
		["flags empty", { TELEMETRY_ENABLED: "", FEEDBACK_ENABLED: "" }],
		["flags 'false'", { TELEMETRY_ENABLED: "false", FEEDBACK_ENABLED: "FALSE" }]
	])("relay disabled: no POST to /api/telemetry/* (%s)", async (_label, env) => {
		const api = await loadApi(env);

		await expect(api.submitTelemetryFeedback(FEEDBACK)).resolves.toBeUndefined();
		await expect(api.submitTelemetryError(ERROR)).resolves.toBeUndefined();
		api.trackUiTelemetryEvent(UI_EVENT);
		await flush();

		expect(instancePost).not.toHaveBeenCalled();
		expect(axiosPost).not.toHaveBeenCalled();
	});

	it("disabled guards resolve even when the relay endpoint would fail", async () => {
		instancePost.mockRejectedValue(new Error("404"));
		const api = await loadApi();

		await expect(api.submitTelemetryFeedback(FEEDBACK)).resolves.toBeUndefined();
		await expect(api.submitTelemetryError(ERROR)).resolves.toBeUndefined();
	});

	it("TELEMETRY_ENABLED does not enable the feedback relay", async () => {
		const api = await loadApi({ TELEMETRY_ENABLED: "true" });

		await api.submitTelemetryFeedback(FEEDBACK);
		await api.submitTelemetryError(ERROR);

		expect(telemetryPosts().map(([url]) => url)).toStrictEqual(["/api/telemetry/error"]);
	});

	it("FEEDBACK_ENABLED does not enable the events/error relay", async () => {
		const api = await loadApi({ FEEDBACK_ENABLED: "true" });

		await api.submitTelemetryFeedback(FEEDBACK);
		await api.submitTelemetryError(ERROR);
		api.trackUiTelemetryEvent(UI_EVENT);
		await flush();

		expect(telemetryPosts().map(([url]) => url)).toStrictEqual(["/api/telemetry/feedback"]);
	});
});

describe("relay enabled: posts as upstream", () => {
	const ENABLED = { TELEMETRY_ENABLED: "true", FEEDBACK_ENABLED: " TRUE " };
	const AUTH = { headers: { Authorization: `Bearer ${STORED_JWT}` } };

	it("feedback", async () => {
		const api = await loadApi(ENABLED);

		await api.submitTelemetryFeedback(FEEDBACK);

		expect(instancePost).toHaveBeenCalledWith("/api/telemetry/feedback", FEEDBACK, AUTH);
	});

	it("error", async () => {
		const api = await loadApi(ENABLED);

		await api.submitTelemetryError(ERROR);

		expect(instancePost).toHaveBeenCalledWith("/api/telemetry/error", ERROR, AUTH);
	});

	it("ui events", async () => {
		const api = await loadApi(ENABLED);
		api.setSessionId("sess-9");

		api.trackUiTelemetryEvent(UI_EVENT);
		await vi.waitFor(() => expect(instancePost).toHaveBeenCalledTimes(1));

		expect(instancePost).toHaveBeenCalledWith(
			"/api/telemetry/events",
			[
				{
					event_name: "location_granted",
					category: "location",
					time: expect.any(String),
					metadata: { a: 1, sid: "sess-9" }
				}
			],
			AUTH
		);
	});
});

describe("getTelemetryAuthToken", () => {
	it("returns the stored auth_jwt token without calling /api/token", async () => {
		const api = await loadApi();

		await expect(api.getTelemetryAuthToken()).resolves.toBe(STORED_JWT);

		expect(axiosPost).not.toHaveBeenCalled();
	});

	it("forceRefresh calls /api/token once and returns the new token", async () => {
		const api = await loadApi();

		await expect(api.getTelemetryAuthToken({ forceRefresh: true })).resolves.toBe(FRESH_JWT);

		expect(axiosPost).toHaveBeenCalledTimes(1);
		expect(axiosPost.mock.calls[0]?.[0]).toBe(`${API_URL}/api/token`);
		expect(JSON.parse(store.get("auth_jwt") ?? "{}").token).toBe(FRESH_JWT);
	});

	it("refreshes when no token is stored", async () => {
		store.delete("auth_jwt");
		const api = await loadApi();

		await expect(api.getTelemetryAuthToken()).resolves.toBe(FRESH_JWT);

		expect(axiosPost).toHaveBeenCalledTimes(1);
	});

	it("resolves null (never rejects) when the refresh fails", async () => {
		store.delete("auth_jwt");
		axiosPost.mockRejectedValue(new Error("down"));
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		const api = await loadApi();

		await expect(api.getTelemetryAuthToken({ forceRefresh: true })).resolves.toBeNull();
	});
});

describe("feedback relay off: chat store", () => {
	it("submitMessageFeedback leaves toast === null and posts nothing to the relay", async () => {
		// If the relay were called it would fail (endpoint not deployed for this client).
		instancePost.mockRejectedValue(new Error("relay unavailable"));
		vi.spyOn(console, "warn").mockImplementation(() => undefined);
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		stubBrowser({});
		vi.resetModules();
		const { useChatStore } = await import("@/hooks/store/chat");
		useChatStore.setState({
			sessionId: "sess-1",
			toast: null,
			messages: [
				{ id: "u1", role: "user", type: "text", text: "Q?", status: "sent", createdAt: "" },
				{ id: "a1", role: "assistant", type: "card", qid: "bq-1", body: "A.", createdAt: "" }
			] as never
		});

		await useChatStore.getState().submitMessageFeedback("a1", true);

		expect(useChatStore.getState().toast).toBeNull();
		expect(telemetryPosts()).toHaveLength(0);
	});
});
