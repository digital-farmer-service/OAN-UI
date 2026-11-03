import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { makeT } from "../ui-parity/test-i18n";

// Vite raw imports: node:fs is polyfilled to a stub in this config.
import chatHeaderSource from "@/components/screens-component/layouts/chat-header.tsx?raw";
import messageListSource from "@/components/screens-component/chat-screen/components/message-list.tsx?raw";
import chatInputSource from "@/components/screens-component/chat-screen/components/chat-input.tsx?raw";

// Owner dev review §2/§3 (width decision, replaces the earlier max-w-2xl input): the header bar is
// full width; at `lg` (>=1024px) the chat body (message list container) is 75% wide and centred
// (`w-full lg:w-3/4 mx-auto`, keeping `px-2`/`sm:px-4`) and both centred input wrappers (the
// second one also holds the disclaimer) are 50% wide and centred (`mx-auto w-full lg:w-1/2`).
// Below `lg` both stay `w-full`. No `max-w-*` class on any of these containers.

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

/** True when the space-separated class list contains `cls` as a whole token. */
function hasClass(classes: string, cls: string): boolean {
	return classes.split(/\s+/).includes(cls);
}

describe("message list is 75% wide and centred at lg (dev review §3)", () => {
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

	it("the padded list container is w-full, lg:w-3/4 and mx-auto", () => {
		const padded = classNameLiterals(messageListSource).filter(
			(c) => hasClass(c, "px-2") && hasClass(c, "sm:px-4")
		);

		expect(padded.length).toBeGreaterThan(0);
		for (const c of padded) {
			expect(hasClass(c, "w-full"), c).toBe(true);
			expect(hasClass(c, "lg:w-3/4"), c).toBe(true);
			expect(hasClass(c, "mx-auto"), c).toBe(true);
		}
	});
});

describe("chat input is 50% wide and centred at lg (dev review §3)", () => {
	it("has no max-w-3xl left in chat-input.tsx", () => {
		expect(chatInputSource).not.toContain("max-w-3xl");
	});

	it("both centred input wrappers are w-full and lg:w-1/2, with no max-w", () => {
		const centred = classNameLiterals(chatInputSource).filter((c) => hasClass(c, "mx-auto"));

		expect(centred.length).toBeGreaterThanOrEqual(2);
		for (const c of centred) {
			expect(hasClass(c, "w-full"), c).toBe(true);
			expect(hasClass(c, "lg:w-1/2"), c).toBe(true);
			expect(MAX_W.test(c), c).toBe(false);
		}
	});
});
