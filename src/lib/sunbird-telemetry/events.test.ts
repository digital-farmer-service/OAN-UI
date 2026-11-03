import { describe, expect, it, vi } from "vitest";

// Pure builders for the old Bihar Krishi Sunbird V3 wire format (doc 80 §2.2, §2.3, §6.1).
// Legacy quirks stay on the wire in v1 (gdata placeholders, progress 50, type CHOOSE, pdata v0.1).

interface SunbirdConfig {
	enabled: boolean;
	endpointUrl: string;
	pdata: { id: string; ver: string };
	channel: string;
}
type FingerprintDetails = Record<string, unknown>;
type Eid = "OE_START" | "OE_ITEM_RESPONSE" | "OE_END";
interface EventContext {
	config: SunbirdConfig;
	uid: string;
	did: string;
	sid: string;
	fingerprint: FingerprintDetails | null;
}
interface SunbirdEvent {
	eid: Eid;
	ver: string;
	mid: string;
	ets: number;
	channel: string;
	pdata: { id: string; ver: string };
	gdata: { id: string; ver: string };
	cdata: unknown[];
	uid: string;
	sid: string;
	did: string;
	edata: { eks: Record<string, unknown> };
	etags: { partner: unknown[] };
}
interface SunbirdEnvelope {
	id: string;
	ver: string;
	ets: number;
	events: SunbirdEvent[];
}
type Perf = { server_response_time_ms: number | null; browser_render_time_ms: number | null };
type Item = Record<string, unknown>;

interface EventsModule {
	buildEvent: (
		eid: Eid,
		eks: Record<string, unknown>,
		ctx: EventContext,
		ets: number,
		mid: string
	) => SunbirdEvent;
	buildBatch: (
		item: Item,
		ctx: EventContext,
		clock: { start: number; end: number },
		newMid: () => string
	) => SunbirdEnvelope;
	newMid: () => string;
	questionItem: (p: { qid: string; sessionId: string; questionText: string }) => Item;
	responseItem: (p: {
		qid: string;
		sessionId: string;
		questionText: string;
		answerText: string;
		performance: Perf;
		backendQid?: string;
	}) => Item;
	errorItem: (p: { qid: string; sessionId: string; errorText: string }) => Item;
	feedbackItem: (p: {
		qid: string;
		sessionId: string;
		feedbackText: string;
		feedbackType: "like" | "dislike";
		questionText: string;
		answerText: string;
	}) => Item;
}

const EVENTS_MODULE = "./events";

async function loadEvents(): Promise<EventsModule> {
	vi.resetModules();
	return (await import(/* @vite-ignore */ EVENTS_MODULE)) as EventsModule;
}

const CONFIG: SunbirdConfig = {
	enabled: true,
	endpointUrl: "https://api.t/observability-service/action/data/v3/telemetry",
	pdata: { id: "BiharKrishi", ver: "v0.1" },
	channel: "BiharKrishi-https://www.biharkrishi.in"
};
const FP: FingerprintDetails = {
	device_id: "dev-1",
	browser: { code: "SF", name: "Safari", version: "18.5" },
	os: { code: "IOS", name: "iOS", version: "18.5" },
	device: { code: "MB", name: "mobile", model: "iPhone" }
};
const PARENT = { id: "p1", type: "default" };

function ctx(fingerprint: FingerprintDetails | null = FP): EventContext {
	return {
		config: CONFIG,
		uid: "guest",
		did: "guest:anon@example.com",
		sid: "sess-1",
		fingerprint
	};
}

function midSequence() {
	let n = 0;
	return () => `OE_${(++n).toString(16).padStart(32, "0")}`;
}

const CLOCK = { start: 1_700_000_000_000, end: 1_700_000_001_500 };
const Q = { qid: "q-1", sessionId: "sess-1", questionText: "How to grow rice?" };

describe("buildBatch envelope", () => {
	it("batch envelope is ekstep.telemetry 2.2 with START, ITEM, END", async () => {
		const { buildBatch, questionItem } = await loadEvents();

		const envelope = buildBatch(questionItem(Q), ctx(), CLOCK, midSequence());

		expect(envelope.id).toBe("ekstep.telemetry");
		expect(envelope.ver).toBe("2.2");
		expect(typeof envelope.ets).toBe("number");
		expect(envelope.events.map((e) => e.eid)).toStrictEqual([
			"OE_START",
			"OE_ITEM_RESPONSE",
			"OE_END"
		]);
		expect(Object.keys(envelope).sort()).toStrictEqual(["ets", "events", "id", "ver"]);
	});

	it("every event carries the V3 common fields and nothing else", async () => {
		const { buildBatch, questionItem } = await loadEvents();
		const newMid = midSequence();

		const { events } = buildBatch(questionItem(Q), ctx(), CLOCK, newMid);

		const mids = events.map((e) => e.mid);
		expect(new Set(mids).size).toBe(3);
		for (const event of events) {
			expect(Object.keys(event).sort()).toStrictEqual(
				[
					"cdata",
					"channel",
					"did",
					"edata",
					"eid",
					"etags",
					"ets",
					"gdata",
					"mid",
					"pdata",
					"sid",
					"uid",
					"ver"
				].sort()
			);
			expect(event.ver).toBe("2.2");
			expect(event.mid).toMatch(/^OE_[0-9a-f]{32}$/);
			expect(event.channel).toBe("BiharKrishi-https://www.biharkrishi.in");
			expect(event.pdata).toStrictEqual({ id: "BiharKrishi", ver: "v0.1" });
			expect(event.gdata).toStrictEqual({ id: "content_id", ver: "contetn_ver" });
			expect(event.cdata).toStrictEqual([]);
			expect(event.uid).toBe("guest");
			expect(event.sid).toBe("sess-1");
			expect(event.did).toBe("guest:anon@example.com");
			expect(event.etags).toStrictEqual({ partner: [] });
		}
	});

	it("START is stamped with clock.start and END with clock.end; ITEM in between", async () => {
		const { buildBatch, questionItem } = await loadEvents();

		const [start, item, end] = buildBatch(questionItem(Q), ctx(), CLOCK, midSequence()).events;

		expect(start?.ets).toBe(CLOCK.start);
		expect(end?.ets).toBe(CLOCK.end);
		expect(item?.ets).toBeGreaterThanOrEqual(CLOCK.start);
		expect(item?.ets).toBeLessThanOrEqual(CLOCK.end);
	});

	it("OE_START eks is empty apart from fingerprint_details", async () => {
		const { buildBatch, questionItem } = await loadEvents();

		const [start] = buildBatch(questionItem(Q), ctx(), CLOCK, midSequence()).events;

		expect(start?.edata).toStrictEqual({ eks: { fingerprint_details: FP } });
	});

	it("OE_END eks is progress 50, stageid '', length in seconds", async () => {
		const { buildBatch, questionItem } = await loadEvents();

		const end = buildBatch(questionItem(Q), ctx(null), CLOCK, midSequence()).events[2];

		expect(end?.edata.eks).toStrictEqual({
			progress: 50,
			stageid: "",
			length: (CLOCK.end - CLOCK.start) / 1000
		});
	});

	it("fingerprint_details on every event; omitted when unavailable", async () => {
		const { buildBatch, questionItem } = await loadEvents();

		const withFp = buildBatch(questionItem(Q), ctx(FP), CLOCK, midSequence()).events;
		expect(withFp.map((e) => e.edata.eks.fingerprint_details)).toStrictEqual([FP, FP, FP]);

		const withoutFp = buildBatch(questionItem(Q), ctx(null), CLOCK, midSequence()).events;
		for (const event of withoutFp) {
			expect(event.edata.eks).not.toHaveProperty("fingerprint_details");
		}
	});
});

describe("buildEvent", () => {
	it("wraps eks in edata and uses the given eid, ets and mid", async () => {
		const { buildEvent } = await loadEvents();
		const mid = `OE_${"a".repeat(32)}`;

		const event = buildEvent("OE_ITEM_RESPONSE", { qid: "q-1" }, ctx(null), 42, mid);

		expect(event).toStrictEqual({
			eid: "OE_ITEM_RESPONSE",
			ver: "2.2",
			mid,
			ets: 42,
			channel: CONFIG.channel,
			pdata: { id: "BiharKrishi", ver: "v0.1" },
			gdata: { id: "content_id", ver: "contetn_ver" },
			cdata: [],
			uid: "guest",
			sid: "sess-1",
			did: "guest:anon@example.com",
			edata: { eks: { qid: "q-1" } },
			etags: { partner: [] }
		});
	});
});

describe("newMid", () => {
	it("returns 'OE_' + 32 lowercase hex, unique per call", async () => {
		const { newMid } = await loadEvents();

		const mids = Array.from({ length: 50 }, () => newMid());

		for (const mid of mids) expect(mid).toMatch(/^OE_[0-9a-f]{32}$/);
		expect(new Set(mids).size).toBe(50);
	});
});

describe("item builders (OE_ITEM_RESPONSE eks)", () => {
	async function itemEks(item: Item) {
		const { buildBatch } = await loadEvents();
		return buildBatch(item, ctx(FP), CLOCK, midSequence()).events[1]?.edata.eks;
	}

	it("question item matches old logQuestionEvent", async () => {
		const { questionItem } = await loadEvents();

		const eks = await itemEks(questionItem(Q));

		expect(eks).toStrictEqual({
			target: {
				id: "default",
				ver: "v0.1",
				type: "Question",
				parent: PARENT,
				questionsDetails: { questionText: Q.questionText, sessionId: Q.sessionId }
			},
			qid: "q-1",
			type: "CHOOSE",
			state: "",
			fingerprint_details: FP
		});
		expect(eks).not.toHaveProperty("resvalues");
	});

	it("response item has answerText, performance and resvalues []", async () => {
		const { responseItem } = await loadEvents();
		const performance = { server_response_time_ms: 200, browser_render_time_ms: null };

		const eks = await itemEks(responseItem({ ...Q, answerText: "Sow in June.", performance }));

		expect(eks).toStrictEqual({
			target: {
				id: "default",
				ver: "v0.1",
				type: "QuestionResponse",
				parent: PARENT,
				questionsDetails: {
					questionText: Q.questionText,
					answerText: "Sow in June.",
					sessionId: Q.sessionId
				},
				performance
			},
			qid: "q-1",
			type: "CHOOSE",
			state: "",
			resvalues: [],
			fingerprint_details: FP
		});
	});

	it("response item adds questionsDetails.backendQid only when given", async () => {
		const { responseItem } = await loadEvents();
		const performance = { server_response_time_ms: null, browser_render_time_ms: null };

		const withBackend = responseItem({ ...Q, answerText: "a", performance, backendQid: "bq-9" });
		const without = responseItem({ ...Q, answerText: "a", performance });

		const details = (i: Item) =>
			(i.target as { questionsDetails: Record<string, unknown> }).questionsDetails;
		expect(details(withBackend)).toStrictEqual({
			questionText: Q.questionText,
			answerText: "a",
			sessionId: Q.sessionId,
			backendQid: "bq-9"
		});
		expect(details(without)).not.toHaveProperty("backendQid");
	});

	it("error item", async () => {
		const { errorItem } = await loadEvents();

		const eks = await itemEks(
			errorItem({ qid: "q-1", sessionId: "sess-1", errorText: "API error: boom" })
		);

		expect(eks).toStrictEqual({
			target: {
				id: "default",
				ver: "v0.1",
				type: "Error",
				parent: PARENT,
				errorDetails: { errorText: "API error: boom", sessionId: "sess-1" }
			},
			qid: "q-1",
			type: "CHOOSE",
			state: "",
			fingerprint_details: FP
		});
	});

	it("feedback item", async () => {
		const { feedbackItem } = await loadEvents();

		const eks = await itemEks(
			feedbackItem({
				qid: "q-1",
				sessionId: "sess-1",
				feedbackText: "Liked the response",
				feedbackType: "like",
				questionText: "Q?",
				answerText: "A."
			})
		);

		expect(eks).toStrictEqual({
			target: {
				id: "default",
				ver: "v0.1",
				type: "Feedback",
				parent: PARENT,
				feedbackDetails: {
					feedbackText: "Liked the response",
					sessionId: "sess-1",
					questionText: "Q?",
					answerText: "A.",
					feedbackType: "like"
				}
			},
			qid: "q-1",
			type: "CHOOSE",
			state: "",
			fingerprint_details: FP
		});
	});
});
