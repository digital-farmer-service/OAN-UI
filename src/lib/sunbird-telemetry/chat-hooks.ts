import {
	markFirstByte,
	markPainted,
	markRequestStart,
	markResponseEnd,
	sunbirdTelemetry
} from "@/lib/sunbird-telemetry";

import type { FeedbackParams } from "./types";

// One-line, fire-and-forget hooks for the chat store (doc 80 §3). Keeping the logic here keeps
// the upstream store diff to a handful of calls. Nothing here is awaited, throws or rejects.

const EMPTY_RESPONSE = "Empty response from API";
const RATE_LIMIT_ERROR = "API error: Rate limit error (429)";

function fireAndForget(run: () => unknown): void {
	try {
		void Promise.resolve(run()).catch(() => undefined);
	} catch {
		// Telemetry never breaks the chat flow.
	}
}

function afterPaint(callback: () => void): void {
	const safe = () => fireAndForget(callback);
	if (typeof requestAnimationFrame === "function") {
		try {
			requestAnimationFrame(safe);
			return;
		} catch {
			// fall through to setTimeout
		}
	}
	setTimeout(safe, 0);
}

function newClientQid(): string {
	const c = globalThis.crypto;
	if (typeof c?.randomUUID === "function") return c.randomUUID();
	return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}

/** Before sendUserQuery: creates the client qid (old uuidv4) and logs the Question. */
export function sunbirdQuestion(sessionId: string, questionText: string): string {
	const qid = newClientQid();
	fireAndForget(() => markRequestStart(qid));
	fireAndForget(() => sunbirdTelemetry.logQuestion({ qid, sessionId, questionText }));
	return qid;
}

/** Each stream chunk; only the first one sets the first-byte mark. */
export function sunbirdChunk(qid: string): void {
	fireAndForget(() => markFirstByte(qid));
}

/** After a successful sendUserQuery: Response after the next paint, or Error for an empty stream. */
export function sunbirdAnswer(p: {
	qid: string;
	sessionId: string;
	questionText: string;
	answerText: string;
	messageId?: string;
	backendQid?: string;
}): void {
	if (!p.answerText.trim()) {
		fireAndForget(() =>
			sunbirdTelemetry.logError({ qid: p.qid, sessionId: p.sessionId, errorText: EMPTY_RESPONSE })
		);
		return;
	}
	fireAndForget(() => markResponseEnd(p.qid));
	afterPaint(() => {
		markPainted(p.qid);
		return sunbirdTelemetry.logResponse(p);
	});
}

/** sendText catch block: "API error: <message>" (old format). */
export function sunbirdError(qid: string, sessionId: string, error: unknown, rateLimited: boolean): void {
	const message = error instanceof Error ? error.message : String(error);
	const errorText = rateLimited ? RATE_LIMIT_ERROR : `API error: ${message}`;
	fireAndForget(() => sunbirdTelemetry.logError({ qid, sessionId, errorText }));
}

/** Thumbs up/down. */
export function sunbirdFeedback(p: FeedbackParams): void {
	fireAndForget(() => sunbirdTelemetry.logFeedback(p));
}
