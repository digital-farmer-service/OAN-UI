import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { makeT } from "../ui-parity/test-i18n";

// Owner dev review §4: the old language selector had no yellow. The selected language is shown
// with the green primary token (light and dark), not the `#FEF2B2` / `#EFC300` yellow.

const SELECTED = "hi";

vi.mock("@/components/LanguageProvider", () => ({
	useLanguage: () => ({ language: SELECTED, t: makeT("hi"), setLanguage: () => {} })
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
import { LANGUAGES } from "@/components/screens-component/chat-screen/config";

const YELLOW = /EFC300|FEF2B2/i;

const SOURCES = import.meta.glob<string>("/src/**/*.{ts,tsx,css}", {
	query: "?raw",
	import: "default",
	eager: true
});

function isTestFile(path: string): boolean {
	return /\.(test|spec)\.[tj]sx?$/.test(path) || path.includes("/__tests__/");
}

function buttons(html: string): string[] {
	return [...html.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)].map((m) => m[0]);
}

function classOf(tag: string): string[] {
	return (tag.match(/^<button\b[^>]*class="([^"]*)"/)?.[1] ?? "").split(/\s+/).filter(Boolean);
}

const PRIMARY_BG = /^bg-(primary|\[var\(--primary\)\])(\/\d+)?$/;
const PRIMARY_BG_DARK = /^dark:bg-(primary|\[var\(--primary\)\])(\/\d+)?$/;

describe("no yellow anywhere in src (dev review §4)", () => {
	it("globbed the source tree", () => {
		expect(Object.keys(SOURCES).length).toBeGreaterThan(50);
	});

	it("no non-test source file contains #EFC300 or #FEF2B2", () => {
		const offending = Object.entries(SOURCES)
			.filter(([path, text]) => !isTestFile(path) && YELLOW.test(text))
			.map(([path]) => path);

		expect(offending).toEqual([]);
	});
});

describe("language selector highlights the selected language with primary (dev review §4)", () => {
	const html = renderToStaticMarkup(
		<LanguageSelectionDropdown>
			<span>trigger</span>
		</LanguageSelectionDropdown>
	);
	const selectedName = (LANGUAGES as Record<string, { nativeName: string }>)[SELECTED]
		?.nativeName as string;
	const all = buttons(html);
	const active = all.find((b) => b.includes(selectedName)) ?? "";

	it("renders one button per language including the selected one", () => {
		expect(all.length).toBe(Object.keys(LANGUAGES).length);
		expect(active).not.toBe("");
	});

	it("uses the primary token for the active background in light mode", () => {
		expect(classOf(active).some((c) => PRIMARY_BG.test(c))).toBe(true);
	});

	it("uses the primary token (or no override) for the active background in dark mode", () => {
		const classes = classOf(active);
		const darkBg = classes.filter((c) => c.startsWith("dark:bg-"));

		// Either inherits the light primary background, or overrides it with primary again.
		expect(darkBg.every((c) => PRIMARY_BG_DARK.test(c))).toBe(true);
	});

	it("puts no hard-coded hex colour on the active item", () => {
		expect(classOf(active).filter((c) => /#[0-9a-f]{3,8}\b/i.test(c))).toEqual([]);
		expect(active).not.toMatch(YELLOW);
	});

	it("does not give an inactive item the primary background", () => {
		const inactive = all.filter((b) => b !== active);

		for (const b of inactive) {
			expect(classOf(b).some((c) => PRIMARY_BG.test(c))).toBe(false);
		}
	});
});
