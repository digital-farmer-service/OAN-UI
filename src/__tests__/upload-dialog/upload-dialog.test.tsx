import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { makeT, visibleText } from "../ui-parity/test-i18n";

/** Visible text with the HTML entities React emits decoded (e.g. "Analyze &amp; Submit"). */
function text(html: string): string {
	return visibleText(html)
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#x27;/g, "'")
		.replace(/&amp;/g, "&");
}

// Spec (pest/crop image upload dialog in chat-input.tsx):
//  1. The Camera (capture) button is shown iff useCanCapture() is true, independent of
//     useIsMobile() / window.innerWidth. The Gallery button is always shown.
//  2. The dialog fits any frame (desktop 400x600 iframe, phone (100vw-32px)x70vh iframe, full-screen
//     Android WebView): DialogContent has a viewport-bounded max height (a `max-h-` class using
//     svh/dvh) and is a flex column; the body (photo section + Gallery button) sits in an
//     `overflow-y-auto` wrapper; the footer (Cancel / Submit) is outside that scroll body, so it
//     stays pinned and reachable. `overflow-hidden` clipping alone is not enough.
//
// Harness: node env, no DOM. Radix Dialog renders nothing on the server (Portal) and the open
// state is internal, so the Radix primitives are stubbed to plain elements that always render
// their children. The real `@/components/ui/dialog` wrappers still run, so the asserted classes
// are the merged, rendered ones (chat-input's className merged with the shared DialogContent
// base). React escapes `>` inside attribute values, so tags can be matched with `[^>]*`.

const ui = vi.hoisted(() => ({ mobile: false, canCapture: false }));

vi.mock("@radix-ui/react-dialog", () => {
	type StubProps = { className?: string; children?: ReactNode; [key: string]: unknown };
	const keep = (props: StubProps) => {
		const out: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(props)) {
			if (key === "className" || key.startsWith("data-")) out[key] = value;
		}
		return out;
	};
	const Passthrough = ({ children }: StubProps) => <>{children}</>;
	const Div = (props: StubProps) => <div {...keep(props)}>{props.children}</div>;
	const H2 = (props: StubProps) => <h2 {...keep(props)}>{props.children}</h2>;
	const P = (props: StubProps) => <p {...keep(props)}>{props.children}</p>;
	const Btn = (props: StubProps) => <button {...keep(props)}>{props.children}</button>;
	return {
		Root: Passthrough,
		Portal: Passthrough,
		Trigger: Btn,
		Close: Btn,
		Overlay: Div,
		Content: Div,
		Title: H2,
		Description: P
	};
});

vi.mock("@/components/LanguageProvider", () => ({
	useLanguage: () => ({ language: "en", t: makeT("en"), setLanguage: () => {} })
}));

vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => ui.mobile }));
vi.mock("@/hooks/use-can-capture", () => ({ useCanCapture: () => ui.canCapture }));

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

import { ChatInput } from "@/components/screens-component/chat-screen/components/chat-input";

const en = makeT("en");
const CAPTURE = en("imageUpload.captureImage") as string; // "Capture Image"
const GALLERY = en("imageUpload.selectFromGallery") as string; // "Select from Gallery"
const CANCEL = en("pestApi.cancel") as string;
const SUBMIT = en("pestApi.submit") as string;

function renderInput(): string {
	return renderToStaticMarkup(
		<ChatInput value="" onValueChange={() => {}} onSend={() => {}} />
	);
}

const VOID_TAGS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);

/** [start, end) of the element whose opening tag starts at `start`. */
function elementRange(html: string, start: number): [number, number] {
	const tag = /<(\/?)([a-zA-Z][\w-]*)[^>]*?(\/?)>/g;
	tag.lastIndex = start;
	let depth = 0;
	for (let m = tag.exec(html); m; m = tag.exec(html)) {
		const [, closing, name = "", selfClosing] = m;
		if (closing) {
			depth -= 1;
			if (depth === 0) return [start, tag.lastIndex];
		} else if (selfClosing || VOID_TAGS.has(name.toLowerCase())) {
			if (depth === 0) return [start, tag.lastIndex];
		} else {
			depth += 1;
		}
	}
	throw new Error(`unbalanced markup from index ${start}`);
}

type El = { start: number; end: number; classes: string[]; html: string };

function elementsWhere(html: string, openTag: RegExp): El[] {
	const found: El[] = [];
	const re = new RegExp(openTag.source, "g");
	for (let m = re.exec(html); m; m = re.exec(html)) {
		const [start, end] = elementRange(html, m.index);
		const cls = /\sclass="([^"]*)"/.exec(m[0])?.[1] ?? "";
		found.push({ start, end, classes: cls.split(/\s+/).filter(Boolean), html: html.slice(start, end) });
	}
	return found;
}

function dialogContent(html: string): El {
	const [content, ...rest] = elementsWhere(html, /<[a-z]+[^>]*data-slot="dialog-content"[^>]*>/);
	expect(content, "upload dialog DialogContent is rendered").toBeDefined();
	expect(rest).toHaveLength(0);
	return content!;
}

beforeEach(() => {
	ui.mobile = false;
	ui.canCapture = false;
	vi.stubGlobal("window", globalThis);
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("upload dialog: Camera button follows device capability, not viewport width", () => {
	it("desktop in the 400px iframe (innerWidth 400, useIsMobile true, canCapture false): no Camera, Gallery present", () => {
		vi.stubGlobal("innerWidth", 400);
		ui.mobile = true;
		ui.canCapture = false;

		const shown = text(dialogContent(renderInput()).html);

		expect(shown).not.toContain(CAPTURE);
		expect(shown).toContain(GALLERY);
	});

	it("touch device wider than 768px (innerWidth 1024, useIsMobile false, canCapture true): Camera and Gallery present", () => {
		vi.stubGlobal("innerWidth", 1024);
		ui.mobile = false;
		ui.canCapture = true;

		const shown = text(dialogContent(renderInput()).html);

		expect(shown).toContain(CAPTURE);
		expect(shown).toContain(GALLERY);
	});

	it("phone (innerWidth 400, useIsMobile true, canCapture true): Camera and Gallery present", () => {
		vi.stubGlobal("innerWidth", 400);
		ui.mobile = true;
		ui.canCapture = true;

		const shown = text(dialogContent(renderInput()).html);

		expect(shown).toContain(CAPTURE);
		expect(shown).toContain(GALLERY);
	});

	it("wide desktop (innerWidth 1440, useIsMobile false, canCapture false): no Camera, Gallery present", () => {
		vi.stubGlobal("innerWidth", 1440);
		ui.mobile = false;
		ui.canCapture = false;

		const shown = text(dialogContent(renderInput()).html);

		expect(shown).not.toContain(CAPTURE);
		expect(shown).toContain(GALLERY);
	});
});

describe("upload dialog fits any frame: bounded height, scrollable body, pinned footer", () => {
	it.each([
		["canCapture false", false],
		["canCapture true", true]
	])("%s: DialogContent has a viewport-bounded max height (max-h-* with svh/dvh)", (_label, canCapture) => {
		ui.canCapture = canCapture;
		const { classes } = dialogContent(renderInput());

		const maxH = classes.filter((c) => /^(?:[\w-]+:)*max-h-\S*(?:svh|dvh)/.test(c));
		expect(maxH, `DialogContent classes: ${classes.join(" ")}`).not.toHaveLength(0);
	});

	it("DialogContent is a flex column", () => {
		const { classes } = dialogContent(renderInput());

		expect(classes, `DialogContent classes: ${classes.join(" ")}`).toContain("flex");
		expect(classes).toContain("flex-col");
		expect(classes).not.toContain("grid");
	});

	it("the dialog body (photo section with the Gallery button) is inside an overflow-y-auto wrapper", () => {
		const content = dialogContent(renderInput());
		const scrollers = elementsWhere(content.html, /<[a-z]+[^>]*class="[^"]*\boverflow-y-auto\b[^"]*"[^>]*>/);

		const body = scrollers.find((el) => text(el.html).includes(GALLERY));
		expect(body, "an overflow-y-auto element wraps the photo section").toBeDefined();
	});

	it("the footer (Cancel / Submit) is inside DialogContent but outside every scroll container", () => {
		const content = dialogContent(renderInput());
		const [footer, ...extra] = elementsWhere(content.html, /<[a-z]+[^>]*data-slot="dialog-footer"[^>]*>/);
		expect(footer, "DialogFooter rendered inside DialogContent").toBeDefined();
		expect(extra).toHaveLength(0);
		expect(text(footer!.html)).toContain(CANCEL);
		expect(text(footer!.html)).toContain(SUBMIT);

		const scrollers = elementsWhere(content.html, /<[a-z]+[^>]*class="[^"]*\boverflow-y-auto\b[^"]*"[^>]*>/);
		expect(scrollers, "the dialog has a scroll body").not.toHaveLength(0);
		for (const scroller of scrollers) {
			const inside = footer!.start >= scroller.start && footer!.end <= scroller.end;
			expect(inside, "footer must not scroll away with the body").toBe(false);
		}
	});
});
