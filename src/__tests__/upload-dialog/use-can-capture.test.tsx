import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Spec: the Camera (capture) button in the pest/crop upload dialog is driven by device capability,
// not viewport width. On desktop the chat page runs in a fixed 400x600 iframe, so
// `window.innerWidth < 768` is true there and the old width check showed a Camera button that opens
// a plain file picker. New hook `useCanCapture()` in src/hooks/use-can-capture.ts:
//   true  only when matchMedia("(pointer: coarse)").matches AND navigator.maxTouchPoints > 0
//   false when there is no window / no matchMedia (SSR, old WebViews), on desktop (fine pointer,
//         0 touch points), whatever window.innerWidth is.
//
// Harness: node env, no DOM. The hook is read through a probe component rendered with
// renderToStaticMarkup, so the value must already be right on the first render (no
// false-then-true flip that would make the Camera button pop in). window / navigator / matchMedia
// are stubbed per case. The module is imported through a variable path so tsc passes before the
// file exists (same pattern as ui-parity/footer.test.tsx).

interface CanCaptureModule {
	useCanCapture: () => boolean;
}

const HOOK_MODULE = "../../hooks/use-can-capture";

type Device = {
	innerWidth: number;
	coarse: boolean;
	maxTouchPoints?: number;
	hasMatchMedia?: boolean;
};

let matchMedia: ReturnType<typeof vi.fn>;

function stubDevice({ innerWidth, coarse, maxTouchPoints, hasMatchMedia = true }: Device): void {
	matchMedia = vi.fn((query: string) => ({
		matches: query.replace(/\s+/g, "") === "(pointer:coarse)" && coarse,
		media: query,
		onchange: null,
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
		addListener: vi.fn(),
		removeListener: vi.fn(),
		dispatchEvent: vi.fn(() => false)
	}));
	const nav: Record<string, unknown> = { userAgent: "vitest" };
	if (maxTouchPoints !== undefined) nav.maxTouchPoints = maxTouchPoints;
	const win: Record<string, unknown> = { innerWidth, navigator: nav };
	if (hasMatchMedia) win.matchMedia = matchMedia;
	vi.stubGlobal("window", win);
	vi.stubGlobal("navigator", nav);
	vi.stubGlobal("matchMedia", hasMatchMedia ? matchMedia : undefined);
}

async function readCanCapture(): Promise<string> {
	vi.resetModules();
	const { useCanCapture } = (await import(/* @vite-ignore */ HOOK_MODULE)) as CanCaptureModule;
	function Probe() {
		return <span>{String(useCanCapture())}</span>;
	}
	return renderToStaticMarkup(<Probe />);
}

beforeEach(() => {
	vi.clearAllMocks();
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.resetModules();
});

describe("useCanCapture: true only on a touch device with a coarse pointer", () => {
	it("phone (coarse pointer, 5 touch points, 400px wide) -> true", async () => {
		stubDevice({ innerWidth: 400, coarse: true, maxTouchPoints: 5 });
		expect(await readCanCapture()).toBe("<span>true</span>");
	});

	it("tablet / Android WebView wider than 768px (coarse pointer, touch) -> true", async () => {
		stubDevice({ innerWidth: 1024, coarse: true, maxTouchPoints: 10 });
		expect(await readCanCapture()).toBe("<span>true</span>");
	});

	it("queries the (pointer: coarse) media feature", async () => {
		stubDevice({ innerWidth: 400, coarse: true, maxTouchPoints: 5 });
		await readCanCapture();
		const queries = matchMedia.mock.calls.map((c) => String(c[0]).replace(/\s+/g, ""));
		expect(queries).toContain("(pointer:coarse)");
	});
});

describe("useCanCapture: false on desktop, whatever the viewport width", () => {
	it("desktop inside the 400x600 iframe (fine pointer, 0 touch points, innerWidth 400) -> false", async () => {
		stubDevice({ innerWidth: 400, coarse: false, maxTouchPoints: 0 });
		expect(await readCanCapture()).toBe("<span>false</span>");
	});

	it("full-width desktop (fine pointer, 0 touch points, innerWidth 1440) -> false", async () => {
		stubDevice({ innerWidth: 1440, coarse: false, maxTouchPoints: 0 });
		expect(await readCanCapture()).toBe("<span>false</span>");
	});

	it("coarse pointer but no touch points -> false", async () => {
		stubDevice({ innerWidth: 400, coarse: true, maxTouchPoints: 0 });
		expect(await readCanCapture()).toBe("<span>false</span>");
	});

	it("touch points but a fine primary pointer (touchscreen laptop) -> false", async () => {
		stubDevice({ innerWidth: 400, coarse: false, maxTouchPoints: 10 });
		expect(await readCanCapture()).toBe("<span>false</span>");
	});

	it("navigator without maxTouchPoints -> false", async () => {
		stubDevice({ innerWidth: 400, coarse: true });
		expect(await readCanCapture()).toBe("<span>false</span>");
	});
});

describe("useCanCapture: false without the browser APIs", () => {
	it("no matchMedia -> false (and does not throw)", async () => {
		stubDevice({ innerWidth: 400, coarse: true, maxTouchPoints: 5, hasMatchMedia: false });
		expect(await readCanCapture()).toBe("<span>false</span>");
	});

	it("no window (SSR) -> false (and does not throw)", async () => {
		stubDevice({ innerWidth: 400, coarse: true, maxTouchPoints: 5 });
		vi.stubGlobal("window", undefined);
		vi.stubGlobal("matchMedia", undefined);
		expect(await readCanCapture()).toBe("<span>false</span>");
	});
});
