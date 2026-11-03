import type { ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { type TestLanguage, translationValue, visibleText } from "./test-i18n";
import { setSsrStore } from "./test-ssr-store";

// P4.8.8 (doc 70 §2.2 Empty state, §3 Empty state, §4 Quick-action cards/Ticker; owner Q3):
// the empty chat shows the old welcome screen (80adef9 src/components/EmptyStateScreen.tsx:30-80):
// the welcome image plus t("helpYouToday") only. No quick-action cards, no ticker.
//
// Seams fixed here:
//   - `BiharWelcome` (no required props) exported from `src/bihar/welcome.tsx`; renders an <img>
//     whose src contains "welcome" and the t("helpYouToday") text, and no <button>
//   - `helpYouToday` top-level key in translations/en.json ("How can I help you today?") and hi.json
//   - ChatShell passes the Bihar welcome (not WelcomePanel) to MessageList when there are no
//     messages, so the store's quickActions are not rendered
//   - `env.uiTicker` is 0 (no ticker variant renders)

const ui = vi.hoisted(() => ({ lang: "en" as "en" | "hi", mobile: false }));

vi.mock("@/components/LanguageProvider", async () => {
	const { makeT } = await import("./test-i18n");
	return {
		useLanguage: () => ({ language: ui.lang, t: makeT(ui.lang), setLanguage: () => {} })
	};
});

vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => ui.mobile }));

vi.mock("@/contexts/AuthContext", () => ({
	useAuth: () => ({ user: { id: "u1", email: "", name: "Ravi" }, isLoading: false })
}));

// scroll-area imports the CSP nonce, which reads `document` at module load.
vi.mock("@/config/csp", () => ({ cspNonce: undefined }));

vi.mock("lottie-react", () => ({ default: () => <div data-mock="lottie" /> }));

vi.mock("@/lib/api-service", () => ({
	default: {
		sendUserQuery: vi.fn(),
		submitTelemetryError: vi.fn(),
		submitTelemetryFeedback: vi.fn(),
		setSessionId: vi.fn(),
		getSuggestions: vi.fn()
	}
}));

import { ChatShell } from "@/components/screens-component/chat-screen/components/chat-shell";
import { env } from "@/config/env";
import { type QuickAction, useChatStore } from "@/hooks/store/chat";

interface WelcomeModule {
	BiharWelcome: ComponentType;
}

const WELCOME_MODULE = "../../bihar/welcome";

async function renderWelcome(language: TestLanguage): Promise<string> {
	ui.lang = language;
	const { BiharWelcome } = (await import(/* @vite-ignore */ WELCOME_MODULE)) as WelcomeModule;
	return renderToStaticMarkup(<BiharWelcome />);
}

const QUICK_ACTION: QuickAction = {
	id: "qa-mandi",
	title: "Mandi prices QA-PROBE",
	description: "Today's market rates QA-PROBE",
	icon: "money",
	prompt: "mandi prices"
};

beforeEach(() => {
	ui.lang = "en";
	ui.mobile = false;
	setSsrStore(useChatStore, {
		messages: [],
		quickActions: [QUICK_ACTION],
		isAssistantTyping: false
	});
});

describe("translations for the welcome screen", () => {
	it("has helpYouToday in en and hi", () => {
		expect(translationValue("en", "helpYouToday")).toBe("How can I help you today?");
		expect(translationValue("hi", "helpYouToday")).toBe("मैं आज आपकी कैसे मदद कर सकता हूँ?");
	});
});

describe("BiharWelcome (P4.8.8)", () => {
	it.each(["en", "hi"] as const)("%s: welcome image and the helpYouToday text", async (lang) => {
		const html = await renderWelcome(lang);

		expect(html).toMatch(/<img[^>]*src="[^"]*welcome[^"]*"/i);
		expect(visibleText(html)).toContain(translationValue(lang, "helpYouToday") as string);
	});

	it("renders no buttons (no quick-action cards)", async () => {
		const html = await renderWelcome("en");

		expect(html).not.toContain("<button");
	});
});

describe("ChatShell empty state (P4.8.8)", () => {
	it("shows the Bihar welcome and hides the quick-action cards", () => {
		const html = renderToStaticMarkup(<ChatShell />);

		expect(html).toMatch(/<img[^>]*src="[^"]*welcome[^"]*"/i);
		expect(visibleText(html)).toContain("How can I help you today?");
		expect(html).not.toContain("QA-PROBE");
	});

	it("the ticker is switched off", () => {
		expect(env.uiTicker).toBe(0);
	});
});
