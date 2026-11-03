import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { makeT, visibleText } from "../ui-parity/test-i18n";

// Owner decision: the language picker offers ONLY English and Hindi.

vi.mock("@/components/LanguageProvider", () => ({
	useLanguage: () => ({ language: "en", t: makeT("en"), setLanguage: () => {} })
}));

vi.mock("@/hooks/store/chat", () => {
	const state = { fetchNotifications: async () => {} };
	const useChatStore = (selector?: (s: typeof state) => unknown) =>
		selector ? selector(state) : state;
	return { useChatStore };
});

// Radix renders popover content in a portal only while open; render everything inline so the
// language list is in the SSR markup.
vi.mock("@/components/ui/popover", () => {
	const Pass = ({ children }: { children?: React.ReactNode }) => <>{children}</>;
	return { Popover: Pass, PopoverTrigger: Pass, PopoverContent: Pass, PopoverAnchor: Pass };
});

import { LanguageSelectionDropdown } from "@/components/screens-component/chat-screen/components/language-selection-dialog";

const REMOVED_NATIVE_NAMES = ["বাংলা", "తెలుగు", "தமிழ்", "ગુજરાતી", "ಕನ್ನಡ", "മലയാളം", "অসমীয়া", "मराठी", "मैथिली"];

function renderPicker(): string {
	return renderToStaticMarkup(
		<LanguageSelectionDropdown>
			<span>trigger</span>
		</LanguageSelectionDropdown>
	);
}

function buttonLabels(html: string): string[] {
	return [...html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)].map((m) => visibleText(m[1] ?? ""));
}

describe("language picker offers only English and Hindi", () => {
	const html = renderPicker();
	const labels = buttonLabels(html);

	it("renders exactly two language buttons", () => {
		expect(labels).toHaveLength(2);
	});

	it("labels them English and हिंदी", () => {
		expect(new Set(labels)).toEqual(new Set(["English", "हिंदी"]));
	});

	it("shows none of the removed languages", () => {
		const text = visibleText(html);
		expect(REMOVED_NATIVE_NAMES.filter((name) => text.includes(name))).toEqual([]);
	});
});
