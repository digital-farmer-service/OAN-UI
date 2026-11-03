import { buildBatch, errorItem, feedbackItem, questionItem, responseItem } from "./events";
import { clearTimers, getPerformance } from "./timers";
import type {
	ErrorParams,
	FeedbackParams,
	Item,
	QuestionParams,
	ResponseParams,
	SunbirdDeps,
	SunbirdTelemetry
} from "./types";

// Sunbird V3 sender (doc 80 §2.1, §4.4). One POST per log call carrying [START, ITEM, END].
// Fresh token per send, one forced refresh + retry on 401, never rejects, never logs.

const KEEPALIVE_MAX_BYTES = 60 * 1024;
const MAX_MESSAGE_QIDS = 500;
const DEFAULT_UID = "default-username";
const DEFAULT_DID = "default-email";

function decodeJwtClaims(token: string): Record<string, unknown> | null {
	const parts = token.split(".");
	if (parts.length !== 3 || !parts[1]) return null;
	try {
		const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
		const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
		const bytes = Uint8Array.from(atob(padded), (ch) => ch.charCodeAt(0));
		const claims: unknown = JSON.parse(new TextDecoder().decode(bytes));
		return claims && typeof claims === "object" ? (claims as Record<string, unknown>) : null;
	} catch {
		return null;
	}
}

/** uid = JWT `name`, did = `${sub}@example.com` (old AuthContext), with the old fallbacks. */
function identityFromToken(token: string): { uid: string; did: string } {
	const claims = decodeJwtClaims(token);
	const name = claims?.name;
	const sub = claims?.sub;
	return {
		uid: typeof name === "string" && name ? name : DEFAULT_UID,
		did: typeof sub === "string" && sub ? `${sub}@example.com` : DEFAULT_DID
	};
}

function byteLength(body: string): number {
	return new TextEncoder().encode(body).length;
}

export function createSunbirdTelemetry(deps: SunbirdDeps): SunbirdTelemetry {
	const { config } = deps;
	const qidByMessage = new Map<string, string>();

	function rememberMessageQid(messageId: string, qid: string): void {
		qidByMessage.delete(messageId);
		qidByMessage.set(messageId, qid);
		if (qidByMessage.size > MAX_MESSAGE_QIDS) {
			const oldest = qidByMessage.keys().next().value;
			if (oldest !== undefined) qidByMessage.delete(oldest);
		}
	}

	async function post(token: string, body: string): Promise<Response> {
		const doFetch = deps.fetch;
		return doFetch(config.endpointUrl, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${token}`,
				"Content-Type": "application/json",
				dataType: "json"
			},
			body,
			keepalive: byteLength(body) <= KEEPALIVE_MAX_BYTES
		});
	}

	async function send(item: Item, sessionId: string): Promise<void> {
		if (!config.enabled) return;
		try {
			const start = deps.now();
			const token = await deps.getToken();
			if (!token) return;
			const fingerprint = await Promise.resolve()
				.then(() => deps.getFingerprint())
				.catch(() => null);
			const { uid, did } = identityFromToken(token);
			const end = deps.now();
			const body = JSON.stringify(
				buildBatch(item, { config, uid, did, sid: sessionId, fingerprint }, { start, end }, deps.newMid)
			);

			const response = await post(token, body);
			if (response.status !== 401) return;

			const refreshed = await deps.getToken({ forceRefresh: true });
			if (refreshed) await post(refreshed, body);
		} catch {
			// Telemetry must never surface errors to the chat UI.
		}
	}

	return {
		logQuestion(p: QuestionParams) {
			return send(questionItem(p), p.sessionId);
		},
		logResponse(p: ResponseParams) {
			const performance = getPerformance(p.qid);
			clearTimers(p.qid);
			if (p.messageId) rememberMessageQid(p.messageId, p.qid);
			return send(
				responseItem({
					qid: p.qid,
					sessionId: p.sessionId,
					questionText: p.questionText,
					answerText: p.answerText,
					performance,
					backendQid: p.backendQid
				}),
				p.sessionId
			);
		},
		logError(p: ErrorParams) {
			clearTimers(p.qid);
			return send(errorItem(p), p.sessionId);
		},
		logFeedback(p: FeedbackParams) {
			const qid = qidByMessage.get(p.messageId) ?? p.fallbackQid;
			return send(
				feedbackItem({
					qid,
					sessionId: p.sessionId,
					feedbackText: p.feedbackText,
					feedbackType: p.feedbackType,
					questionText: p.questionText,
					answerText: p.answerText
				}),
				p.sessionId
			);
		}
	};
}
