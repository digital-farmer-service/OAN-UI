import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { makeT, visibleText } from "./test-i18n";

// P4.8.2 (doc 70 §2.2 Header, §3 Theme toggle location, §4 bell/gear; owner Q4/Q5): the chat
// header shows the logo AND the title text, carries the theme toggle itself, and renders neither
// the notifications bell nor the settings gear.
//
// Seams fixed here:
//   - the header renders the `title` prop as visible text (not only as the logo's alt)
//   - the theme toggle is a control with `data-testid="theme-toggle"` inside <header>
//   - no `NotificationsPopover`, no settings button (no `settings.svg`, no "Settings" label)

vi.mock("@/components/LanguageProvider", () => ({
	useLanguage: () => ({ language: "en", t: makeT("en"), setLanguage: () => {} })
}));

vi.mock("@/components/screens-component/chat-screen/components/language-selection-dialog", () => ({
	LanguageSelectionDropdown: ({ children }: { children: React.ReactNode }) => <>{children}</>
}));

vi.mock("@/components/screens-component/chat-screen/components/notifications-popover", () => ({
	NotificationsPopover: () => <div data-mock="notifications-bell" />
}));

import { ChatHeader } from "@/components/screens-component/layouts/chat-header";

const TITLE = "Bihar Krishi - AI";

function renderHeader(): string {
	return renderToStaticMarkup(<ChatHeader title={TITLE} onOpenSettings={() => {}} />);
}

describe("chat header (P4.8.2)", () => {
	it("shows the logo image and the title as visible text", () => {
		const html = renderHeader();

		expect(html).toMatch(/<img[^>]*src="[^"]+"/);
		expect(visibleText(html)).toContain(TITLE);
	});

	it("renders a theme toggle control in the header", () => {
		const html = renderHeader();

		expect(html).toMatch(/<header[\s\S]*data-testid="theme-toggle"[\s\S]*<\/header>/);
	});

	it("does not render the notifications bell", () => {
		const html = renderHeader();

		expect(html).not.toContain('data-mock="notifications-bell"');
	});

	it("does not render the settings gear", () => {
		const html = renderHeader();

		expect(html).not.toContain("settings.svg");
		expect(html).not.toMatch(/(alt|aria-label|title)="Settings"/i);
	});
});
