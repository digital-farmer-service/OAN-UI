export interface SunbirdConfig {
	enabled: boolean;
	endpointUrl: string;
	pdata: { id: string; ver: string };
	channel: string;
}

type Coded = { code: string; name?: string; version?: string; model?: string };

export interface FingerprintDetails {
	device_id: string;
	browser: Coded;
	os: Coded;
	device: Coded;
	session: Record<string, unknown>;
	device_lifecycle: Record<string, unknown>;
	[key: string]: unknown;
}

export type Eid = "OE_START" | "OE_ITEM_RESPONSE" | "OE_END";

export interface EventContext {
	config: SunbirdConfig;
	uid: string;
	did: string;
	sid: string;
	fingerprint: Record<string, unknown> | null;
}

export interface SunbirdEvent {
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

export interface SunbirdEnvelope {
	id: string;
	ver: string;
	ets: number;
	events: SunbirdEvent[];
}

export interface Performance {
	server_response_time_ms: number | null;
	browser_render_time_ms: number | null;
}

export type Item = Record<string, unknown>;

export interface QuestionParams {
	qid: string;
	sessionId: string;
	questionText: string;
}

export interface ResponseParams extends QuestionParams {
	answerText: string;
	messageId?: string;
	backendQid?: string;
}

export interface ErrorParams {
	qid: string;
	sessionId: string;
	errorText: string;
}

export type FeedbackType = "like" | "dislike";

export interface FeedbackParams {
	messageId: string;
	fallbackQid: string;
	sessionId: string;
	feedbackText: string;
	feedbackType: FeedbackType;
	questionText: string;
	answerText: string;
}

export interface SunbirdTelemetry {
	logQuestion(p: QuestionParams): Promise<void>;
	logResponse(p: ResponseParams): Promise<void>;
	logError(p: ErrorParams): Promise<void>;
	logFeedback(p: FeedbackParams): Promise<void>;
}

export interface SunbirdDeps {
	config: SunbirdConfig;
	getToken: (opts?: { forceRefresh?: boolean }) => Promise<string | null>;
	fetch: typeof fetch;
	now: () => number;
	newMid: () => string;
	getFingerprint: () => Promise<Record<string, unknown> | null>;
}
