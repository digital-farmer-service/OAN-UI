import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import cardBubbleSource from "../../components/screens-component/chat-screen/components/bubbles/card-bubble.tsx?raw";
import { type TestLanguage, translationValue, visibleText } from "./test-i18n";
import { setSsrStore } from "./test-ssr-store";

// P4.8.5/P4.8.6 wiring (doc 70 §3 TTS/Like/Copy rows) and P4.8.10 (doc 70 §3 Error states):
// the card bubble's action row and error card render from the chat store state that commit
// a745ace added (ttsStatus "loading", messageFeedback, canRetryMessage/MAX_RETRIES, getTtsLabelKey).
//
// Seams fixed here (all inside the CardBubble markup):
//   - action buttons carry `data-action="listen" | "copy" | "like" | "retry"`
//   - Listen label = t(getTtsLabelKey(status)), i.e. the constant "Listen" key, also while playing
//   - while this message's TTS is loading: the Listen button has `aria-busy="true"` and is
//     disabled (`aria-disabled="true"` or `disabled`), and contains `data-testid="tts-spinner"`
//   - Like button: `aria-pressed` = "true" iff `messageFeedback[id] === "like"`
//   - Retry button only when `canRetryMessage(message)`; labels t("retry") / t("retrying")

const lang = vi.hoisted(() => ({ current: "en" as "en" | "hi" }));

vi.mock("@/lib/api-service", () => ({
	default: {
		sendUserQuery: vi.fn(),
		submitTelemetryError: vi.fn(),
		submitTelemetryFeedback: vi.fn(),
		setSessionId: vi.fn(),
		getSuggestions: vi.fn()
	}
}));

vi.mock("@/components/LanguageProvider", async () => {
	const { makeT: mk } = await import("./test-i18n");
	return {
		useLanguage: () => ({ language: lang.current, t: mk(lang.current), setLanguage: () => {} })
	};
});

import { CardBubble } from "@/components/screens-component/chat-screen/components/bubbles/card-bubble";
import type { CardMessage } from "@/components/screens-component/chat-screen/components/bubbles/chat-types";
import { useChatStore } from "@/hooks/store/chat";

const ID = "answer-1";

function answer(overrides: Partial<CardMessage> = {}): CardMessage {
	return {
		id: ID,
		role: "assistant",
		type: "card",
		createdAt: "2026-11-03T00:00:00.000Z",
		body: "Sow wheat after the first irrigation.",
		showListenRow: true,
		...overrides
	};
}

function render(message: CardMessage, language: TestLanguage = "en"): string {
	lang.current = language;
	return renderToStaticMarkup(<CardBubble message={message} />);
}

function button(html: string, action: string): string | undefined {
	const re = new RegExp(`<button(?=[^>]*data-action="${action}")[^>]*>[\\s\\S]*?</button>`);
	return html.match(re)?.[0];
}

function openTag(buttonHtml: string): string {
	return buttonHtml.slice(0, buttonHtml.indexOf(">") + 1);
}

type StoreSlice = {
	currentlyPlayingId: string | null;
	ttsStatus: "loading" | "playing" | "paused" | "stopped";
	messageFeedback: Record<string, "like" | "dislike" | undefined>;
};

function setStore(slice: Partial<StoreSlice>) {
	setSsrStore(useChatStore as unknown as Parameters<typeof setSsrStore<StoreSlice>>[0], slice);
}

beforeEach(() => {
	setStore({ currentlyPlayingId: null, ttsStatus: "stopped", messageFeedback: {} });
});

describe("action row: Listen (P4.8.5 wiring)", () => {
	it("renders a Listen button labelled from i18n (en)", () => {
		const listen = button(render(answer()), "listen");

		expect(listen).toBeDefined();
		expect(visibleText(listen!)).toContain("Listen");
	});

	it("renders the translated Listen label (hi)", () => {
		const listen = button(render(answer(), "hi"), "listen");

		expect(listen).toBeDefined();
		expect(visibleText(listen!)).toContain(translationValue("hi", "Listen") as string);
	});

	it("keeps the constant Listen label while this message is playing", () => {
		setStore({ currentlyPlayingId: ID, ttsStatus: "playing" });

		const listen = button(render(answer()), "listen");

		expect(listen).toBeDefined();
		const text = visibleText(listen!);
		expect(text).toContain("Listen");
		expect(text).not.toMatch(/Pause|Resume/);
	});

	it("while loading shows a spinner and marks the button busy and disabled", () => {
		setStore({ currentlyPlayingId: ID, ttsStatus: "loading" });

		const listen = button(render(answer()), "listen");

		expect(listen).toBeDefined();
		expect(listen).toContain('data-testid="tts-spinner"');
		const tag = openTag(listen!);
		expect(tag).toContain('aria-busy="true"');
		expect(tag).toMatch(/aria-disabled="true"|\sdisabled=""/);
	});

	it("does not show the spinner when another message is loading", () => {
		setStore({ currentlyPlayingId: "other", ttsStatus: "loading" });

		const listen = button(render(answer()), "listen");

		expect(listen).toBeDefined();
		expect(listen).not.toContain('data-testid="tts-spinner"');
		expect(openTag(listen!)).not.toContain('aria-busy="true"');
	});
});

describe("action row: Like and Copy (P4.8.6 wiring)", () => {
	it("like button is not pressed when there is no feedback", () => {
		const like = button(render(answer()), "like");

		expect(like).toBeDefined();
		expect(openTag(like!)).toContain('aria-pressed="false"');
	});

	it("like button is pressed when messageFeedback says like", () => {
		setStore({ messageFeedback: { [ID]: "like" } });

		const like = button(render(answer()), "like");

		expect(like).toBeDefined();
		expect(openTag(like!)).toContain('aria-pressed="true"');
	});

	it("renders a copy button", () => {
		expect(button(render(answer()), "copy")).toBeDefined();
	});
});

describe("error card (P4.8.10)", () => {
	const failed = (retryCount: number) =>
		answer({
			body: "Sorry, something went wrong.",
			isError: true,
			failedUserText: "When to sow wheat?",
			showListenRow: false,
			retryCount
		});

	it("labels the retry button from t('retry') (en)", () => {
		const retry = button(render(failed(0)), "retry");

		expect(retry).toBeDefined();
		expect(visibleText(retry!)).toBe(translationValue("en", "retry"));
	});

	it("labels the retry button from t('retry') (hi)", () => {
		const retry = button(render(failed(1), "hi"), "retry");

		expect(retry).toBeDefined();
		expect(visibleText(retry!)).toBe(translationValue("hi", "retry"));
	});

	it("does not render the retry button once the retry limit is reached", () => {
		const html = render(failed(2));

		expect(button(html, "retry")).toBeUndefined();
		expect(visibleText(html)).not.toContain(translationValue("en", "retry") as string);
		expect(html).toContain("Sorry, something went wrong.");
	});

	it("uses t('retrying') for the retrying state, with no hard-coded English labels", () => {
		// The retrying state is local click state, so SSR cannot reach it; this pins the source.
		expect(cardBubbleSource).toMatch(/["']retrying["']/);
		expect(cardBubbleSource).not.toMatch(/["']Retrying\.\.\.["']/);
		expect(cardBubbleSource).not.toMatch(/["']Retry["']/);
	});
});
