import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { neutralizeHtmlMarkup } from "@/lib/security/html";

// Store hook points for the Sunbird re-port (doc 80 §3, P5.5). The store calls the singleton
// from "@/lib/sunbird-telemetry" fire-and-forget: a client qid per sendText, Question before the
// request, Response (or Error) after, Feedback on thumbs. Telemetry never blocks the UI.

const { tel, api } = vi.hoisted(() => ({
	tel: {
		logQuestion: vi.fn(),
		logResponse: vi.fn(),
		logError: vi.fn(),
		logFeedback: vi.fn()
	},
	api: {
		sendUserQuery: vi.fn(),
		setSessionId: vi.fn(),
		getLocationData: vi.fn(() => null),
		getSuggestions: vi.fn(async () => []),
		submitTelemetryError: vi.fn(async () => undefined),
		submitTelemetryFeedback: vi.fn(async () => undefined),
		trackUiTelemetryEvent: vi.fn()
	}
}));

vi.mock("@/lib/sunbird-telemetry", () => ({
	sunbirdTelemetry: tel,
	markRequestStart: vi.fn(),
	markFirstByte: vi.fn(),
	markResponseEnd: vi.fn(),
	markPainted: vi.fn(),
	clearTimers: vi.fn(),
	getPerformance: vi.fn(() => ({ server_response_time_ms: null, browser_render_time_ms: null }))
}));
vi.mock("@/lib/api-service", () => ({ default: api }));
vi.mock("@/lib/audio-utils", () => ({
	playTTS: vi.fn(),
	pauseAudio: vi.fn(),
	resumeAudio: vi.fn(),
	stopAudio: vi.fn()
}));

type Store = typeof import("./index").useChatStore;
type StreamCb = (chunk: string) => void;

const SID = "sess-1";
const RAW = "Is <b>urea</b> ok?";
const SAFE = neutralizeHtmlMarkup(RAW);

let useChatStore: Store;
let order: string[];

async function loadStore(): Promise<Store> {
	vi.resetModules();
	return (await import("./index")).useChatStore;
}

function questionQid(): string {
	expect(tel.logQuestion).toHaveBeenCalledTimes(1);
	const [arg] = tel.logQuestion.mock.calls[0] as [{ qid: string }];
	expect(typeof arg.qid).toBe("string");
	expect(arg.qid.length).toBeGreaterThan(0);
	return arg.qid;
}

beforeEach(async () => {
	order = [];
	for (const fn of Object.values(tel)) fn.mockReset().mockResolvedValue(undefined);
	tel.logQuestion.mockImplementation(async () => void order.push("logQuestion"));
	api.sendUserQuery.mockReset();
	api.submitTelemetryError.mockClear();
	api.submitTelemetryFeedback.mockClear();
	vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
		cb(0);
		return 1;
	});
	vi.spyOn(console, "error").mockImplementation(() => undefined);
	vi.spyOn(console, "warn").mockImplementation(() => undefined);
	useChatStore = await loadStore();
	useChatStore.setState({ sessionId: SID, messages: [], toast: null });
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	vi.resetModules();
});

describe("chat store sendText -> Sunbird", () => {
	it("sendText logs question before the request", async () => {
		api.sendUserQuery.mockImplementation(
			async (_m: string, _s: string, _a: string, _b: string, cb: StreamCb) => {
				order.push("sendUserQuery");
				cb("ok");
				return { response: "ok", status: "success" };
			}
		);

		await useChatStore.getState().sendText(RAW, "en");

		const qid = questionQid();
		expect(tel.logQuestion).toHaveBeenCalledWith({ qid, sessionId: SID, questionText: SAFE });
		expect(order).toStrictEqual(["logQuestion", "sendUserQuery"]);
	});

	it("sendText success logs response with same qid and full text", async () => {
		api.sendUserQuery.mockImplementation(
			async (_m: string, _s: string, _a: string, _b: string, cb: StreamCb) => {
				cb("Sow ");
				cb("in June.");
				return { response: "Sow in June.", status: "success", qid: "bq-1" };
			}
		);

		await useChatStore.getState().sendText(RAW, "en");

		const qid = questionQid();
		const assistant = useChatStore.getState().messages.at(-1);
		expect(assistant?.role).toBe("assistant");
		await vi.waitFor(() => expect(tel.logResponse).toHaveBeenCalledTimes(1));
		expect(tel.logResponse).toHaveBeenCalledWith(
			expect.objectContaining({
				qid,
				sessionId: SID,
				questionText: SAFE,
				answerText: "Sow in June.",
				messageId: assistant?.id,
				backendQid: "bq-1"
			})
		);
		expect(tel.logError).not.toHaveBeenCalled();
	});

	it("each sendText uses a new client qid", async () => {
		api.sendUserQuery.mockImplementation(
			async (_m: string, _s: string, _a: string, _b: string, cb: StreamCb) => {
				cb("a");
				return { response: "a", status: "success" };
			}
		);

		await useChatStore.getState().sendText("one", "en");
		await useChatStore.getState().sendText("two", "en");

		const qids = tel.logQuestion.mock.calls.map(([p]) => (p as { qid: string }).qid);
		expect(qids).toHaveLength(2);
		expect(qids[0]).not.toBe(qids[1]);
	});

	it('empty stream logs "Empty response from API"', async () => {
		api.sendUserQuery.mockResolvedValue({ response: "", status: "success" });

		await useChatStore.getState().sendText(RAW, "en");

		const qid = questionQid();
		await vi.waitFor(() => expect(tel.logError).toHaveBeenCalledTimes(1));
		expect(tel.logError).toHaveBeenCalledWith(
			expect.objectContaining({ qid, sessionId: SID, errorText: "Empty response from API" })
		);
		expect(tel.logResponse).not.toHaveBeenCalled();
	});

	it('failure logs "API error: <msg>" with the same qid', async () => {
		api.sendUserQuery.mockRejectedValue(new Error("Network down"));

		await useChatStore.getState().sendText(RAW, "en");

		const qid = questionQid();
		await vi.waitFor(() => expect(tel.logError).toHaveBeenCalledTimes(1));
		expect(tel.logError).toHaveBeenCalledWith(
			expect.objectContaining({ qid, sessionId: SID, errorText: "API error: Network down" })
		);
	});

	it("429 logs rate-limit text with the same qid", async () => {
		api.sendUserQuery.mockRejectedValue(Object.assign(new Error("Too many"), { status: 429 }));

		await useChatStore.getState().sendText(RAW, "en");

		const qid = questionQid();
		await vi.waitFor(() => expect(tel.logError).toHaveBeenCalledTimes(1));
		expect(tel.logError).toHaveBeenCalledWith(
			expect.objectContaining({
				qid,
				sessionId: SID,
				errorText: "API error: Rate limit error (429)"
			})
		);
	});

	it("telemetry never blocks: input unlocks without awaiting telemetry", async () => {
		const never = () => new Promise<void>(() => undefined);
		tel.logQuestion.mockImplementation(never);
		tel.logResponse.mockImplementation(never);
		tel.logError.mockImplementation(never);
		api.sendUserQuery.mockImplementation(
			async (_m: string, _s: string, _a: string, _b: string, cb: StreamCb) => {
				cb("answer");
				return { response: "answer", status: "success" };
			}
		);

		await useChatStore.getState().sendText(RAW, "en");

		expect(useChatStore.getState().isInputLocked).toBe(false);
		expect(api.sendUserQuery).toHaveBeenCalledTimes(1);
		expect(tel.logQuestion).toHaveBeenCalledTimes(1);
		await vi.waitFor(() => expect(tel.logResponse).toHaveBeenCalledTimes(1));
	});

	it("a rejecting telemetry call does not surface as a chat error", async () => {
		tel.logQuestion.mockRejectedValue(new Error("telemetry down"));
		tel.logResponse.mockRejectedValue(new Error("telemetry down"));
		api.sendUserQuery.mockImplementation(
			async (_m: string, _s: string, _a: string, _b: string, cb: StreamCb) => {
				cb("answer");
				return { response: "answer", status: "success" };
			}
		);

		await useChatStore.getState().sendText(RAW, "en");
		await new Promise((r) => setTimeout(r, 0));

		const last = useChatStore.getState().messages.at(-1) as { isError?: boolean } | undefined;
		expect(tel.logQuestion).toHaveBeenCalledTimes(1);
		expect(last?.isError).toBeFalsy();
		expect(useChatStore.getState().isInputLocked).toBe(false);
	});
});

describe("chat store submitMessageFeedback -> Sunbird", () => {
	beforeEach(() => {
		useChatStore.setState({
			sessionId: SID,
			messages: [
				{ id: "u1", role: "user", type: "text", text: "Q?", status: "sent", createdAt: "" },
				{ id: "a1", role: "assistant", type: "card", qid: "bq-1", body: "A.", createdAt: "" }
			] as never
		});
	});

	it("like logs Sunbird feedback", async () => {
		await useChatStore.getState().submitMessageFeedback("a1", true);

		expect(tel.logFeedback).toHaveBeenCalledWith(
			expect.objectContaining({
				messageId: "a1",
				fallbackQid: "bq-1",
				sessionId: SID,
				feedbackText: "Liked the response",
				feedbackType: "like",
				questionText: "Q?",
				answerText: "A."
			})
		);
	});

	it("dislike logs Sunbird feedback with the dislike text", async () => {
		await useChatStore.getState().submitMessageFeedback("a1", false, "wrong", "bad advice");

		expect(tel.logFeedback).toHaveBeenCalledWith(
			expect.objectContaining({
				messageId: "a1",
				fallbackQid: "bq-1",
				sessionId: SID,
				feedbackText: "bad advice",
				feedbackType: "dislike",
				questionText: "Q?",
				answerText: "A."
			})
		);
	});

	it("feedback telemetry is not awaited", async () => {
		tel.logFeedback.mockImplementation(() => new Promise<void>(() => undefined));

		await useChatStore.getState().submitMessageFeedback("a1", true);

		expect(tel.logFeedback).toHaveBeenCalledTimes(1);
	});
});
