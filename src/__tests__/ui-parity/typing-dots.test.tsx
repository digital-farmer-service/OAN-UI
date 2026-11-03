import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// P4.8.9 (doc 70 §2.2 Loading indicator, §3 Loading / typing): the message list shows the old
// three bouncing dots (80adef9 src/components/ChatMessage.tsx:324-341, `bg-current`, so they
// follow the theme) instead of the Lottie AILoader whose colour is baked in as #4343FF.
//
// Seams fixed here:
//   - the typing indicator renders exactly three elements with `data-typing-dot`
//   - no Lottie animation is rendered while the assistant is typing

vi.mock("@/components/LanguageProvider", async () => {
	const { makeT } = await import("./test-i18n");
	return { useLanguage: () => ({ language: "en", t: makeT("en"), setLanguage: () => {} }) };
});

vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));

vi.mock("@/hooks/store/auth", () => ({
	useAuthStore: (selector?: (s: { user: null }) => unknown) =>
		selector ? selector({ user: null }) : { user: null }
}));

vi.mock("@/lib/api-service", () => ({
	default: {
		sendUserQuery: vi.fn(),
		submitTelemetryError: vi.fn(),
		submitTelemetryFeedback: vi.fn(),
		setSessionId: vi.fn(),
		getSuggestions: vi.fn()
	}
}));

// scroll-area imports the CSP nonce, which reads `document` at module load.
vi.mock("@/config/csp", () => ({ cspNonce: undefined }));

vi.mock("lottie-react", () => ({ default: () => <div data-mock="lottie" /> }));

import type { ChatMessage } from "@/components/screens-component/chat-screen/components/bubbles/chat-types";
import { MessageList } from "@/components/screens-component/chat-screen/components/message-list";

const QUESTION: ChatMessage = {
	id: "q1",
	role: "user",
	type: "text",
	createdAt: "2026-11-03T00:00:00.000Z",
	text: "When to sow wheat?"
};

function countDots(html: string): number {
	return html.match(/data-typing-dot/g)?.length ?? 0;
}

describe("typing indicator (P4.8.9)", () => {
	it("renders three dots and no Lottie while the assistant is typing", () => {
		const html = renderToStaticMarkup(
			<MessageList messages={[QUESTION]} isAssistantTyping={true} />
		);

		expect(countDots(html)).toBe(3);
		expect(html).not.toContain('data-mock="lottie"');
	});

	it("renders no dots when the assistant is not typing", () => {
		const html = renderToStaticMarkup(
			<MessageList messages={[QUESTION]} isAssistantTyping={false} />
		);

		expect(countDots(html)).toBe(0);
	});
});
