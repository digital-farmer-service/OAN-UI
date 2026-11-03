import type { ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import chatLayoutSource from "../../layouts/chat-layout/index.tsx?raw";
import { type TestLanguage, translationValue } from "./test-i18n";

// P4.8.7 (doc 70 §2.2 Disclaimer / footer, §3.1 "Doc 50 #12"): port the old footer
// (80adef9 src/components/ChatInterface.tsx:1267-1285): Info icon + t("disclaimerText"), then
// t("poweredBy") + the Bharat Vistaar logo, with "Powered by" text BEFORE the logo for English and
// the logo BEFORE the text for every other language; stacked on mobile.
//
// Seams fixed here:
//   - `BiharFooter` (no required props) exported from `src/bihar/footer.tsx`; it reads
//     `useLanguage()` for `language`/`t` and may read `useIsMobile()`
//   - the logo is an <img> whose alt is "Bharat Vistaar Logo" (as in the old footer)
//   - `poweredBy` top-level key in translations/en.json ("Powered by") and hi.json
//   - `ChatInputProps.footerNote` accepts a ReactNode and is rendered below the input box
//   - chat-layout passes `footerNote={<BiharFooter />}`

const ui = vi.hoisted(() => ({ lang: "en" as "en" | "hi", mobile: false }));

vi.mock("@/components/LanguageProvider", async () => {
	const { makeT } = await import("./test-i18n");
	return {
		useLanguage: () => ({ language: ui.lang, t: makeT(ui.lang), setLanguage: () => {} })
	};
});

vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => ui.mobile }));

vi.mock("@/contexts/AuthContext", () => ({
	useAuth: () => ({ user: { id: "u1", email: "" }, isLoading: false })
}));

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

import {
	ChatInput,
	type ChatInputProps
} from "@/components/screens-component/chat-screen/components/chat-input";

interface FooterModule {
	BiharFooter: ComponentType;
}

const FOOTER_MODULE = "../../bihar/footer";

async function renderFooter(language: TestLanguage): Promise<string> {
	ui.lang = language;
	const { BiharFooter } = (await import(/* @vite-ignore */ FOOTER_MODULE)) as FooterModule;
	return renderToStaticMarkup(<BiharFooter />);
}

const LOGO_IMG = /<img[^>]*alt="Bharat Vistaar Logo"[^>]*>/;

function indexOfOrFail(html: string, needle: string | RegExp): number {
	const idx = typeof needle === "string" ? html.indexOf(needle) : html.search(needle);
	expect(idx, `expected to find ${String(needle)}`).toBeGreaterThanOrEqual(0);
	return idx;
}

beforeEach(() => {
	ui.lang = "en";
	ui.mobile = false;
});

describe("translations for the footer", () => {
	it("has a top-level poweredBy key in en and hi", () => {
		expect(translationValue("en", "poweredBy")).toBe("Powered by");
		expect(translationValue("hi", "poweredBy")).toEqual(expect.stringContaining("द्वारा संचालित"));
	});
});

describe("BiharFooter (P4.8.7)", () => {
	it("en: Info icon, disclaimer, then 'Powered by' text before the logo", async () => {
		const html = await renderFooter("en");

		const info = indexOfOrFail(html, /<svg[^>]*lucide-info/);
		const disclaimer = indexOfOrFail(html, translationValue("en", "disclaimerText") as string);
		const powered = indexOfOrFail(html, "Powered by");
		const logo = indexOfOrFail(html, LOGO_IMG);

		expect(info).toBeLessThan(disclaimer);
		expect(disclaimer).toBeLessThan(powered);
		expect(powered).toBeLessThan(logo);
	});

	it("hi: the logo comes before the 'Powered by' text", async () => {
		const html = await renderFooter("hi");

		const disclaimer = indexOfOrFail(html, translationValue("hi", "disclaimerText") as string);
		const logo = indexOfOrFail(html, LOGO_IMG);
		const powered = indexOfOrFail(html, "द्वारा संचालित");

		expect(disclaimer).toBeLessThan(logo);
		expect(logo).toBeLessThan(powered);
	});

	it("the logo has a non-empty src", async () => {
		const html = await renderFooter("en");

		expect(html.match(LOGO_IMG)?.[0]).toMatch(/src="[^"]+"/);
	});
});

describe("ChatInput footer slot (P4.8.7)", () => {
	it("renders a ReactNode footer below the input box", () => {
		const probe = <span data-testid="footer-probe">probe</span>;
		const props: ChatInputProps = {
			value: "",
			onValueChange: () => {},
			onSend: () => {},
			footerNote: probe as unknown as ChatInputProps["footerNote"]
		};

		const html = renderToStaticMarkup(<ChatInput {...props} />);

		const textarea = indexOfOrFail(html, "<textarea");
		const footer = indexOfOrFail(html, 'data-testid="footer-probe"');
		expect(textarea).toBeLessThan(footer);
	});

	it("chat-layout passes <BiharFooter /> as the footer", () => {
		expect(chatLayoutSource).toMatch(
			/import\s*\{[^}]*\bBiharFooter\b[^}]*\}\s*from\s*["']@\/bihar\/footer["']/
		);
		expect(chatLayoutSource).toMatch(/footerNote=\{\s*<BiharFooter\b/);
	});
});
