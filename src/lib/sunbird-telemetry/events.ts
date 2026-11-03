import type {
	Eid,
	ErrorParams,
	EventContext,
	FeedbackType,
	Item,
	Performance,
	QuestionParams,
	SunbirdEnvelope,
	SunbirdEvent
} from "./types";

// Pure builders for the old Bihar Krishi Sunbird V3 wire format (doc 80 §2.2, §2.3).
// Legacy quirks are kept on the wire in v1 (gdata placeholders incl. the "contetn_ver" typo,
// OE_END progress 50, item type CHOOSE, pdata v0.1) so existing dashboards keep working.

const EVENT_VER = "2.2";
const GDATA = { id: "content_id", ver: "contetn_ver" } as const;
const PARENT = { id: "p1", type: "default" } as const;

function randomHex32(): string {
	const c = globalThis.crypto;
	if (typeof c?.randomUUID === "function") return c.randomUUID().replace(/-/g, "");
	// randomUUID needs a secure context; getRandomValues does not.
	const bytes = new Uint8Array(16);
	c.getRandomValues(bytes);
	return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** "OE_" + 32 lowercase hex (same shape as the old MD5-based mid). */
export function newMid(): string {
	return `OE_${randomHex32()}`;
}

export function buildEvent(
	eid: Eid,
	eks: Record<string, unknown>,
	ctx: EventContext,
	ets: number,
	mid: string
): SunbirdEvent {
	return {
		eid,
		ver: EVENT_VER,
		mid,
		ets,
		channel: ctx.config.channel,
		pdata: { ...ctx.config.pdata },
		gdata: { ...GDATA },
		cdata: [],
		uid: ctx.uid,
		sid: ctx.sid,
		did: ctx.did,
		edata: { eks: ctx.fingerprint ? { ...eks, fingerprint_details: ctx.fingerprint } : { ...eks } },
		etags: { partner: [] }
	};
}

/** One send = [OE_START, OE_ITEM_RESPONSE, OE_END] in an ekstep.telemetry 2.2 envelope. */
export function buildBatch(
	item: Item,
	ctx: EventContext,
	clock: { start: number; end: number },
	nextMid: () => string
): SunbirdEnvelope {
	const events = [
		buildEvent("OE_START", {}, ctx, clock.start, nextMid()),
		buildEvent("OE_ITEM_RESPONSE", item, ctx, clock.start, nextMid()),
		buildEvent(
			"OE_END",
			{ progress: 50, stageid: "", length: (clock.end - clock.start) / 1000 },
			ctx,
			clock.end,
			nextMid()
		)
	];
	return { id: "ekstep.telemetry", ver: EVENT_VER, ets: clock.end, events };
}

function item(target: Record<string, unknown>, qid: string, extra: Item = {}): Item {
	return {
		target: { id: "default", ver: "v0.1", ...target, parent: { ...PARENT } },
		qid,
		type: "CHOOSE",
		state: "",
		...extra
	};
}

export function questionItem(p: QuestionParams): Item {
	return item(
		{
			type: "Question",
			questionsDetails: { questionText: p.questionText, sessionId: p.sessionId }
		},
		p.qid
	);
}

export function responseItem(p: {
	qid: string;
	sessionId: string;
	questionText: string;
	answerText: string;
	performance: Performance;
	backendQid?: string;
}): Item {
	return item(
		{
			type: "QuestionResponse",
			questionsDetails: {
				questionText: p.questionText,
				answerText: p.answerText,
				sessionId: p.sessionId,
				...(p.backendQid ? { backendQid: p.backendQid } : {})
			},
			performance: { ...p.performance }
		},
		p.qid,
		{ resvalues: [] }
	);
}

export function errorItem(p: ErrorParams): Item {
	return item(
		{ type: "Error", errorDetails: { errorText: p.errorText, sessionId: p.sessionId } },
		p.qid
	);
}

export function feedbackItem(p: {
	qid: string;
	sessionId: string;
	feedbackText: string;
	feedbackType: FeedbackType;
	questionText: string;
	answerText: string;
}): Item {
	return item(
		{
			type: "Feedback",
			feedbackDetails: {
				feedbackText: p.feedbackText,
				sessionId: p.sessionId,
				questionText: p.questionText,
				answerText: p.answerText,
				feedbackType: p.feedbackType
			}
		},
		p.qid
	);
}
