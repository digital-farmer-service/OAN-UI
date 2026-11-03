import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { makeT } from "../ui-parity/test-i18n";

// Vite raw imports: node:fs is polyfilled to a stub in this config.
import chatHeaderSource from "@/components/screens-component/layouts/chat-header.tsx?raw";
import messageListSource from "@/components/screens-component/chat-screen/components/message-list.tsx?raw";
import chatInputSource from "@/components/screens-component/chat-screen/components/chat-input.tsx?raw";

// Owner dev review §2/§3, compared with the old UI (80adef9): the header bar is full width (old
// Layout.tsx), the message list spans the viewport with `px-2`/`px-4` padding (old ScrollArea,
// bot messages `w-full max-w-full`), and the chat input is centred at `max-w-2xl` (old input
// wrapper `max-w-2xl mx-auto`). No `max-w-3xl` column anywhere in these three files.

vi.mock("@/components/LanguageProvider", () => ({
	useLanguage: () => ({ language: "en", t: makeT("en"), setLanguage: () => {} })
}));

vi.mock("@/components/screens-component/chat-screen/components/language-selection-dialog", () => ({
	LanguageSelectionDropdown: ({ children }: { children: React.ReactNode }) => <>{children}</>
}));

import { ChatHeader } from "@/components/screens-component/layouts/chat-header";

function classAttributes(html: string): string[] {
	return [...html.matchAll(/class="([^"]*)"/g)].map((m) => m[1] ?? "");
}

/** String literals passed as `className="..."` in a source file. */
function classNameLiterals(source: string): string[] {
	return [...source.matchAll(/className="([^"]*)"/g)].map((m) => m[1] ?? "");
}

const MAX_W = /(^|\s)(sm:|md:|lg:|xl:)?max-w-/;

describe("chat header is full width (dev review §2)", () => {
	const html = renderToStaticMarkup(<ChatHeader title="Bihar Krishi - AI" />);
	const headerHtml = html.match(/<header[\s\S]*<\/header>/)?.[0] ?? "";

	it("renders a <header> that is w-full", () => {
		expect(headerHtml).not.toBe("");
		expect(headerHtml).toMatch(/^<header[^>]*class="[^"]*\bw-full\b/);
	});

	it("puts no max-w constraint on the header or its inner container", () => {
		const offending = classAttributes(headerHtml).filter((c) => MAX_W.test(c));

		expect(offending).toEqual([]);
	});

	it("has no max-w-3xl left in chat-header.tsx", () => {
		expect(chatHeaderSource).not.toContain("max-w-3xl");
	});
});

describe("message list spans the full width (dev review §3)", () => {
	it("has no max-w constraint on any container", () => {
		const offending = classNameLiterals(messageListSource).filter((c) => MAX_W.test(c));

		expect(offending).toEqual([]);
		expect(messageListSource).not.toContain("max-w-3xl");
	});

	it("keeps the px-2 / sm:px-4 side padding on the list container", () => {
		const padded = classNameLiterals(messageListSource).filter(
			(c) => /(^|\s)px-2(\s|$)/.test(c) && /(^|\s)sm:px-4(\s|$)/.test(c)
		);

		expect(padded.length).toBeGreaterThan(0);
	});
});

describe("chat input is centred at max-w-2xl like the old input (dev review §3)", () => {
	it("has no max-w-3xl left in chat-input.tsx", () => {
		expect(chatInputSource).not.toContain("max-w-3xl");
	});

	it("both centred input wrappers use max-w-2xl", () => {
		const centred = classNameLiterals(chatInputSource).filter((c) => /(^|\s)mx-auto(\s|$)/.test(c));

		expect(centred.length).toBeGreaterThanOrEqual(2);
		for (const c of centred) {
			expect(c).toMatch(/(^|\s)max-w-2xl(\s|$)/);
		}
	});
});
