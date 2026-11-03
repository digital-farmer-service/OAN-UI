import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Sunbird V3 sender (doc 80 §2.1, §6.1, §6.2). Every dependency is injected: fetch, token,
// clock, mid, fingerprint. Methods never reject; the token is read fresh for each send.

interface SunbirdConfig {
	enabled: boolean;
	endpointUrl: string;
	pdata: { id: string; ver: string };
	channel: string;
}
type FingerprintDetails = Record<string, unknown>;
interface SunbirdDeps {
	config: SunbirdConfig;
	getToken: (opts?: { forceRefresh?: boolean }) => Promise<string | null>;
	fetch: typeof fetch;
	now: () => number;
	newMid: () => string;
	getFingerprint: () => Promise<FingerprintDetails | null>;
}
interface SunbirdTelemetry {
	logQuestion(p: { qid: string; sessionId: string; questionText: string }): Promise<void>;
	logResponse(p: {
		qid: string;
		sessionId: string;
		questionText: string;
		answerText: string;
		messageId?: string;
		backendQid?: string;
	}): Promise<void>;
	logError(p: { qid: string; sessionId: string; errorText: string }): Promise<void>;
	logFeedback(p: {
		messageId: string;
		fallbackQid: string;
		sessionId: string;
		feedbackText: string;
		feedbackType: "like" | "dislike";
		questionText: string;
		answerText: string;
	}): Promise<void>;
}
interface ClientModule {
	createSunbirdTelemetry: (deps: SunbirdDeps) => SunbirdTelemetry;
}
interface TimersModule {
	markFirstByte: (qid: string, t?: number) => void;
	markResponseEnd: (qid: string, t?: number) => void;
	markPainted: (qid: string, t?: number) => void;
	getPerformance: (qid: string) => {
		server_response_time_ms: number | null;
		browser_render_time_ms: number | null;
	};
}
type Eks = Record<string, unknown> & {
	qid?: string;
	target?: { type: string; [k: string]: unknown };
	fingerprint_details?: unknown;
};
interface Envelope {
	id: string;
	ver: string;
	ets: number;
	events: { eid: string; uid: string; did: string; sid: string; edata: { eks: Eks } }[];
}

const CLIENT_MODULE = "./client";
const TIMERS_MODULE = "./timers";
const ENDPOINT = "https://api.t/observability-service/action/data/v3/telemetry";
const CONFIG: SunbirdConfig = {
	enabled: true,
	endpointUrl: ENDPOINT,
	pdata: { id: "BiharKrishi", ver: "v0.1" },
	channel: "BiharKrishi-https://www.biharkrishi.in"
};
const FP = { device_id: "dev-1" };
const Q = { qid: "c1", sessionId: "sess-1", questionText: "secret question about wheat" };

function b64url(value: unknown): string {
	return btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function jwt(claims: Record<string, unknown>): string {
	return `${b64url({ alg: "RS256", typ: "JWT" })}.${b64url(claims)}.sig`;
}

const GUEST_JWT = jwt({ name: "guest", sub: "guest:anon", exp: 9_999_999_999 });

function ok(status = 200) {
	return { ok: status >= 200 && status < 300, status } as Response;
}

let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
let getToken: ReturnType<typeof vi.fn<SunbirdDeps["getToken"]>>;
let modules: { client: ClientModule; timers: TimersModule };

async function load() {
	vi.resetModules();
	const client = (await import(/* @vite-ignore */ CLIENT_MODULE)) as ClientModule;
	const timers = (await import(/* @vite-ignore */ TIMERS_MODULE)) as TimersModule;
	modules = { client, timers };
	return modules;
}

function make(overrides: Partial<SunbirdDeps> = {}): SunbirdTelemetry {
	let clock = 1_700_000_000_000;
	let mid = 0;
	return modules.client.createSunbirdTelemetry({
		config: CONFIG,
		getToken,
		fetch: fetchMock,
		now: () => (clock += 250),
		newMid: () => `OE_${(++mid).toString(16).padStart(32, "0")}`,
		getFingerprint: async () => FP,
		...overrides
	});
}

function call(index = 0) {
	const args = fetchMock.mock.calls[index];
	expect(args).toBeDefined();
	const [url, init = {}] = args as [string, RequestInit];
	const headers = new Headers(init.headers);
	const rawBody = String(init.body);
	return { url: String(url), init, headers, rawBody, body: JSON.parse(rawBody) as Envelope };
}

function item(index = 0): Eks {
	return call(index).body.events[1]?.edata.eks as Eks;
}

beforeEach(async () => {
	fetchMock = vi.fn<typeof fetch>().mockResolvedValue(ok());
	getToken = vi.fn<SunbirdDeps["getToken"]>().mockResolvedValue(GUEST_JWT);
	await load();
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	vi.resetModules();
});

describe("createSunbirdTelemetry transport", () => {
	it("posts the batch with bearer token and old headers", async () => {
		await make().logQuestion(Q);

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const { url, init, headers, body } = call();
		expect(url).toBe(ENDPOINT);
		expect(init.method).toBe("POST");
		expect(headers.get("authorization")).toBe(`Bearer ${GUEST_JWT}`);
		expect(headers.get("content-type")).toBe("application/json");
		expect(headers.get("datatype")).toBe("json");
		expect(init.keepalive).toBe(true);
		expect(body.id).toBe("ekstep.telemetry");
		expect(body.ver).toBe("2.2");
		expect(body.events.map((e) => e.eid)).toStrictEqual(["OE_START", "OE_ITEM_RESPONSE", "OE_END"]);
		expect(item().target?.type).toBe("Question");
		expect(item().qid).toBe("c1");
		expect(body.events.every((e) => e.sid === "sess-1")).toBe(true);
	});

	it("reads a fresh token for every send", async () => {
		getToken.mockResolvedValueOnce("t1").mockResolvedValueOnce("t2");
		const telemetry = make();

		await telemetry.logQuestion(Q);
		await telemetry.logQuestion({ ...Q, qid: "c2" });

		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(call(0).headers.get("authorization")).toBe("Bearer t1");
		expect(call(1).headers.get("authorization")).toBe("Bearer t2");
		for (const [opts] of getToken.mock.calls) {
			expect(opts?.forceRefresh ?? false).toBe(false);
		}
	});

	it("401 refreshes once and retries once", async () => {
		getToken.mockResolvedValueOnce("t1").mockResolvedValueOnce("t2");
		fetchMock.mockResolvedValueOnce(ok(401)).mockResolvedValueOnce(ok(200));

		await expect(make().logQuestion(Q)).resolves.toBeUndefined();

		expect(getToken).toHaveBeenCalledTimes(2);
		expect(getToken).toHaveBeenLastCalledWith({ forceRefresh: true });
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(call(1).headers.get("authorization")).toBe("Bearer t2");
		expect(call(1).rawBody).toBe(call(0).rawBody);
	});

	it("a second 401 means no third call and the promise resolves", async () => {
		getToken.mockResolvedValueOnce("t1").mockResolvedValueOnce("t2");
		fetchMock.mockResolvedValue(ok(401));

		await expect(make().logQuestion(Q)).resolves.toBeUndefined();

		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(getToken).toHaveBeenCalledTimes(2);
	});

	it("401 with a failed forced refresh does not retry", async () => {
		getToken.mockResolvedValueOnce("t1").mockResolvedValueOnce(null);
		fetchMock.mockResolvedValueOnce(ok(401));

		await expect(make().logQuestion(Q)).resolves.toBeUndefined();

		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("network error never rejects, no retry", async () => {
		fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

		await expect(make().logQuestion(Q)).resolves.toBeUndefined();

		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("500 never rejects, no retry", async () => {
		fetchMock.mockResolvedValue(ok(500));

		await expect(make().logQuestion(Q)).resolves.toBeUndefined();

		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("disabled config sends nothing", async () => {
		const telemetry = make({ config: { ...CONFIG, enabled: false } });

		await telemetry.logQuestion(Q);
		await telemetry.logError({ qid: "c1", sessionId: "s", errorText: "x" });

		expect(fetchMock).not.toHaveBeenCalled();
		expect(getToken).not.toHaveBeenCalled();
	});

	it("no token sends nothing", async () => {
		getToken.mockResolvedValue(null);

		await expect(make().logQuestion(Q)).resolves.toBeUndefined();

		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("a rejecting token provider never rejects and sends nothing", async () => {
		getToken.mockRejectedValue(new Error("refresh failed"));

		await expect(make().logQuestion(Q)).resolves.toBeUndefined();

		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("a failing fingerprint still sends, without fingerprint_details", async () => {
		const telemetry = make({ getFingerprint: () => Promise.reject(new Error("fp")) });

		await expect(telemetry.logQuestion(Q)).resolves.toBeUndefined();

		expect(fetchMock).toHaveBeenCalledTimes(1);
		for (const event of call().body.events) {
			expect(event.edata.eks).not.toHaveProperty("fingerprint_details");
		}
	});

	it("attaches fingerprint_details to every event when available", async () => {
		await make().logQuestion(Q);

		expect(call().body.events.map((e) => e.edata.eks.fingerprint_details)).toStrictEqual([
			FP,
			FP,
			FP
		]);
	});

	it("sends a body over 60 KB without keepalive", async () => {
		await make().logResponse({
			...Q,
			answerText: "x".repeat(70 * 1024),
			messageId: "m1"
		});

		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(call().init.keepalive ?? false).toBe(false);
	});
});

describe("createSunbirdTelemetry identity and privacy", () => {
	it("uid/did derived from token claims as old", async () => {
		await make().logQuestion(Q);

		for (const event of call().body.events) {
			expect(event.uid).toBe("guest");
			expect(event.did).toBe("guest:anon@example.com");
		}
	});

	it.each([
		["a JWT without name/sub", jwt({ exp: 9_999_999_999 })],
		["an opaque token", "t1"]
	])("falls back to default-username / default-email for %s", async (_label, token) => {
		getToken.mockResolvedValue(token);

		await make().logQuestion(Q);

		for (const event of call().body.events) {
			expect(event.uid).toBe("default-username");
			expect(event.did).toBe("default-email");
		}
	});

	it("never puts the JWT or an integrity token in the body", async () => {
		await make().logQuestion(Q);

		const { rawBody, headers } = call();
		expect(rawBody).not.toContain(GUEST_JWT);
		expect(rawBody).not.toContain(GUEST_JWT.split(".")[1]);
		expect(rawBody.toLowerCase()).not.toContain("integrity");
		expect(rawBody.toLowerCase()).not.toContain("bearer");
		expect([...headers.keys()].some((k) => k.includes("integrity"))).toBe(false);
	});

	it("does not log payloads to console", async () => {
		const spies = (["log", "info", "debug", "warn", "error"] as const).map((m) =>
			vi.spyOn(console, m).mockImplementation(() => undefined)
		);
		fetchMock.mockResolvedValueOnce(ok(401)).mockRejectedValueOnce(new Error("down"));
		const telemetry = make();

		await telemetry.logQuestion(Q);
		await telemetry.logResponse({ ...Q, answerText: "secret answer text", messageId: "m1" });

		const [log, info, debug] = spies;
		expect(log).not.toHaveBeenCalled();
		expect(info).not.toHaveBeenCalled();
		expect(debug).not.toHaveBeenCalled();
		for (const spy of spies) {
			const printed = JSON.stringify(spy.mock.calls.map((c) => c.map(String)));
			expect(printed).not.toContain("secret question");
			expect(printed).not.toContain("secret answer");
			expect(printed).not.toContain(GUEST_JWT);
		}
	});
});

describe("createSunbirdTelemetry events", () => {
	it("logResponse sends QuestionResponse with timer performance, then clears the timers", async () => {
		modules.timers.markFirstByte("c1", 100);
		modules.timers.markResponseEnd("c1", 300);
		modules.timers.markPainted("c1", 310);

		await make().logResponse({
			...Q,
			answerText: "Sow in June.",
			messageId: "m1",
			backendQid: "bq-1"
		});

		const target = item().target as {
			type: string;
			questionsDetails: Record<string, unknown>;
			performance: unknown;
		};
		expect(target.type).toBe("QuestionResponse");
		expect(target.questionsDetails).toStrictEqual({
			questionText: Q.questionText,
			answerText: "Sow in June.",
			sessionId: "sess-1",
			backendQid: "bq-1"
		});
		expect(target.performance).toStrictEqual({
			server_response_time_ms: 200,
			browser_render_time_ms: 10
		});
		expect(item().resvalues).toStrictEqual([]);
		expect(modules.timers.getPerformance("c1")).toStrictEqual({
			server_response_time_ms: null,
			browser_render_time_ms: null
		});
	});

	it("logError sends an Error item", async () => {
		await make().logError({ qid: "c1", sessionId: "sess-1", errorText: "API error: boom" });

		expect(item().target).toMatchObject({
			type: "Error",
			errorDetails: { errorText: "API error: boom", sessionId: "sess-1" }
		});
		expect(item().qid).toBe("c1");
	});

	it("feedback uses the client qid registered for the message", async () => {
		const telemetry = make();
		const feedback = {
			fallbackQid: "b1",
			sessionId: "sess-1",
			feedbackText: "Liked the response",
			feedbackType: "like" as const,
			questionText: "Q?",
			answerText: "A."
		};

		await telemetry.logResponse({ ...Q, answerText: "A.", messageId: "m1" });
		await telemetry.logFeedback({ ...feedback, messageId: "m1" });
		await telemetry.logFeedback({ ...feedback, messageId: "unknown", feedbackType: "dislike" });

		expect(fetchMock).toHaveBeenCalledTimes(3);
		expect(item(1).qid).toBe("c1");
		expect(item(1).target).toMatchObject({
			type: "Feedback",
			feedbackDetails: {
				feedbackText: "Liked the response",
				sessionId: "sess-1",
				questionText: "Q?",
				answerText: "A.",
				feedbackType: "like"
			}
		});
		expect(item(2).qid).toBe("b1");
		expect(item(2).target).toMatchObject({ feedbackDetails: { feedbackType: "dislike" } });
	});

	it("OE_END length measures the send's own clock (now() at start and end)", async () => {
		await make().logQuestion(Q);

		const end = call().body.events[2]?.edata.eks as { length: number; progress: number };
		expect(end.progress).toBe(50);
		expect(end.length).toBeGreaterThan(0);
		expect(end.length).toBeLessThan(5);
	});
});
