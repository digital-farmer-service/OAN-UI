import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import en from "../../../../translations/en.json";
import hi from "../../../../translations/hi.json";

// P4.8.6 (doc 70 §3 Like/Copy rows, §6 Q7): like is a toggle (on/off state per message) with a
// translated thank-you toast; the server submit stays one-shot. Copy writes the answer to the
// clipboard and shows a translated toast (owner chose the toast over the checkmark).
// P4.8.10 (doc 70 §3 Error states, §6 Q7): a failed message can be retried at most 2 times, then
// retry is no longer offered; Retry/Retrying labels come from i18n keys.
//
// The chat route shows toasts through the chat store's `toast` state (rendered by
// chat-screen/components/toast.tsx), not through sonner, so the toast assertions read that state.
//
// Seams this suite fixes (not in the current store, hence the local interfaces):
//   - store state `messageFeedback: Record<messageId, "like" | "dislike" | undefined>`
//   - store action `toggleLike(messageId, t?)`
//   - store action `copyMessage(messageId, t?)`
//   - exports `MAX_RETRIES` (= 2) and `canRetryMessage(message)` from `@/hooks/store/chat`

const api = vi.hoisted(() => ({
	sendUserQuery: vi.fn(),
	submitTelemetryError: vi.fn(),
	submitTelemetryFeedback: vi.fn(),
	setSessionId: vi.fn(),
	getSuggestions: vi.fn()
}));

vi.mock("@/lib/api-service", () => ({ default: api }));

type TFn = (key: string) => string;
type Message = {
	id: string;
	role: "user" | "assistant";
	type: string;
	text?: string;
	body?: string;
	isError?: boolean;
	failedUserText?: string;
	createdAt: string;
};

type ChatState = {
	sessionId: string | null;
	messages: Message[];
	isInputLocked: boolean;
	toast: { message: string; type: string } | null;
	messageFeedback?: Record<string, "like" | "dislike" | undefined>;
	fetchLocation: () => Promise<void>;
	sendText: (text: string, language: string, t?: TFn) => Promise<void>;
	retryLastMessage: (language: string, t?: TFn) => void;
	toggleLike: (messageId: string, t?: TFn) => Promise<void>;
	copyMessage: (messageId: string, t?: TFn) => Promise<void>;
};

interface ChatModuleNext {
	useChatStore: {
		getState: () => ChatState;
		setState: (partial: Partial<ChatState>) => void;
	};
	MAX_RETRIES?: number;
	canRetryMessage?: (message: Message) => boolean;
}

const t: TFn = (key) => `T:${key}`;
const NOW = "2026-11-03T00:00:00.000Z";

async function loadChat(): Promise<ChatModuleNext> {
	vi.resetModules();
	const mod = (await import("@/hooks/store/chat")) as unknown as ChatModuleNext;
	mod.useChatStore.setState({
		sessionId: "session-1",
		messages: [],
		toast: null,
		fetchLocation: vi.fn(() => Promise.resolve())
	});
	return mod;
}

function seedAnswer(mod: ChatModuleNext) {
	mod.useChatStore.setState({
		messages: [
			{ id: "u1", role: "user", type: "text", text: "question", createdAt: NOW },
			{ id: "a1", role: "assistant", type: "card", body: "the answer body", createdAt: NOW },
			{ id: "a2", role: "assistant", type: "card", body: "another answer", createdAt: NOW }
		]
	});
}

const lastError = (mod: ChatModuleNext) =>
	mod.useChatStore.getState().messages.findLast((m) => m.type === "card" && m.isError);

async function retryAndSettle(mod: ChatModuleNext, expectedCalls: number) {
	mod.useChatStore.getState().retryLastMessage("en", t);
	await vi.waitFor(() => expect(api.submitTelemetryError).toHaveBeenCalledTimes(expectedCalls));
}

beforeEach(() => {
	for (const fn of Object.values(api)) fn.mockReset();
	api.sendUserQuery.mockRejectedValue(new Error("boom"));
	api.submitTelemetryError.mockResolvedValue(undefined);
	api.submitTelemetryFeedback.mockResolvedValue(undefined);
	vi.spyOn(console, "error").mockImplementation(() => undefined);
	vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	vi.resetModules();
});

describe("like toggle", () => {
	it("toggles the like state on and off per message, submitting to the server once", async () => {
		const mod = await loadChat();
		seedAnswer(mod);
		const { useChatStore } = mod;

		await useChatStore.getState().toggleLike("a1", t);
		expect(useChatStore.getState().messageFeedback?.a1).toBe("like");
		expect(useChatStore.getState().messageFeedback?.a2).toBeUndefined();
		expect(api.submitTelemetryFeedback).toHaveBeenCalledTimes(1);
		expect(api.submitTelemetryFeedback).toHaveBeenCalledWith(
			expect.objectContaining({ message_id: "a1", feedback_type: "like" })
		);

		await useChatStore.getState().toggleLike("a1", t);
		expect(useChatStore.getState().messageFeedback?.a1).toBeUndefined();

		await useChatStore.getState().toggleLike("a1", t);
		expect(useChatStore.getState().messageFeedback?.a1).toBe("like");
		expect(api.submitTelemetryFeedback).toHaveBeenCalledTimes(1);
	});

	it("shows a translated thank-you toast when a message is liked", async () => {
		const mod = await loadChat();
		seedAnswer(mod);

		await mod.useChatStore.getState().toggleLike("a1", t);

		expect(mod.useChatStore.getState().toast).toEqual({
			message: "T:toast.feedbackThankYou.title",
			type: "success"
		});
	});
});

describe("copy action", () => {
	it("copies the answer body and shows a translated toast", async () => {
		const writeText = vi.fn(() => Promise.resolve());
		vi.stubGlobal("navigator", { clipboard: { writeText } });
		const mod = await loadChat();
		seedAnswer(mod);

		await mod.useChatStore.getState().copyMessage("a1", t);

		expect(writeText).toHaveBeenCalledWith("the answer body");
		expect(mod.useChatStore.getState().toast).toEqual({
			message: "T:toast.messageCopied.title",
			type: "success"
		});
	});

	it("shows an error toast when the clipboard write fails", async () => {
		const writeText = vi.fn(() => Promise.reject(new Error("denied")));
		vi.stubGlobal("navigator", { clipboard: { writeText } });
		const mod = await loadChat();
		seedAnswer(mod);

		await mod.useChatStore.getState().copyMessage("a1", t);

		expect(mod.useChatStore.getState().toast?.type).toBe("error");
	});

	it("has the messageCopied and feedbackThankYou toast texts in en and hi", () => {
		for (const lang of [en, hi]) {
			expect(lang.toast.messageCopied.title.trim()).not.toBe("");
			expect(lang.toast.feedbackThankYou.title.trim()).not.toBe("");
		}
	});
});

describe("retry limit", () => {
	it("exposes a retry limit of 2", async () => {
		const mod = await loadChat();

		expect(mod.MAX_RETRIES).toBe(2);
		expect(typeof mod.canRetryMessage).toBe("function");
	});

	it("offers retry on a failed message at most 2 times, then stops retrying", async () => {
		const mod = await loadChat();
		const canRetry = (m: Message | undefined) => !!m && !!mod.canRetryMessage?.(m);

		await mod.useChatStore.getState().sendText("why are my leaves yellow", "en", t);
		expect(api.sendUserQuery).toHaveBeenCalledTimes(1);
		expect(canRetry(lastError(mod))).toBe(true);

		await retryAndSettle(mod, 2);
		expect(api.sendUserQuery).toHaveBeenCalledTimes(2);
		expect(canRetry(lastError(mod))).toBe(true);

		await retryAndSettle(mod, 3);
		expect(api.sendUserQuery).toHaveBeenCalledTimes(3);
		expect(canRetry(lastError(mod))).toBe(false);

		mod.useChatStore.getState().retryLastMessage("en", t);
		await Promise.resolve();
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(api.sendUserQuery).toHaveBeenCalledTimes(3);
		expect(mod.useChatStore.getState().messages.filter((m) => m.isError)).toHaveLength(1);
	});

	it("gives a new question a fresh retry budget", async () => {
		const mod = await loadChat();
		await mod.useChatStore.getState().sendText("first question", "en", t);
		await retryAndSettle(mod, 2);
		await retryAndSettle(mod, 3);

		await mod.useChatStore.getState().sendText("second question", "en", t);

		const error = lastError(mod);
		expect(error?.failedUserText).toBe("second question");
		expect(!!error && !!mod.canRetryMessage?.(error)).toBe(true);
	});

	it("has non-empty, translated retry/retrying labels in en and hi", () => {
		const labels = (lang: Record<string, unknown>) => ({
			retry: lang.retry,
			retrying: lang.retrying
		});
		const enLabels = labels(en);
		const hiLabels = labels(hi);

		for (const value of [...Object.values(enLabels), ...Object.values(hiLabels)]) {
			expect(typeof value).toBe("string");
			expect(String(value).trim()).not.toBe("");
		}
		expect(hiLabels.retry).not.toBe(enLabels.retry);
		expect(hiLabels.retrying).not.toBe(enLabels.retrying);
	});
});
