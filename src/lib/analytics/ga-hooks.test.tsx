import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

// Vite raw imports: node:fs is polyfilled to a stub by vite-plugin-node-polyfills in this config.
import mainSource from "../../main.tsx?raw";
import languageProviderSource from "../../components/LanguageProvider.tsx?raw";

// Doc 80 §8.3 hook points: main.tsx bootstraps GA once (after the URL identity capture strips
// the launch params) and sends a pathname-only page view on every resolved navigation;
// LanguageProvider.setLanguage (the single language choke point) reports language_change.

interface GaModule {
	initAnalytics: () => void;
}

const GA_MODULE = "./ga";
const ORIGIN = "https://www.biharkrishi.in";

/** Source without comments, so commented-out calls do not count. */
function code(source: string): string {
	return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'])\/\/.*$/gm, "$1");
}

describe("main.tsx GA bootstrap", () => {
	const main = code(mainSource);

	it("imports initAnalytics and trackPageView from ./lib/analytics/ga", () => {
		const gaImport = /import\s*\{([^}]*)\}\s*from\s*["'](?:\.\/|@\/)lib\/analytics\/ga["']/.exec(
			main
		);

		expect(gaImport, "named import from ./lib/analytics/ga").not.toBeNull();
		expect(gaImport?.[1]).toMatch(/\binitAnalytics\b/);
		expect(gaImport?.[1]).toMatch(/\btrackPageView\b/);
	});

	it("calls initAnalytics() exactly once, after captureUrlIdentity() and before createRoot", () => {
		const calls = [...main.matchAll(/\binitAnalytics\(\s*\)/g)];
		expect(calls).toHaveLength(1);

		const initIndex = calls[0]?.index ?? -1;
		const captureIndex = main.search(/\bcaptureUrlIdentity\(\s*\)/);
		expect(captureIndex).toBeGreaterThan(-1);
		expect(initIndex).toBeGreaterThan(captureIndex);
		expect(initIndex).toBeLessThan(main.indexOf("createRoot("));
	});

	it("sends trackPageView from an onResolved router subscription, with a pathname only", () => {
		const onResolved = main.search(/router\.subscribe\(\s*["']onResolved["']/);
		const call = /\btrackPageView\(([^)]*)\)/.exec(main);

		expect(onResolved).toBeGreaterThan(-1);
		expect(call, "trackPageView(...) call").not.toBeNull();
		expect(call!.index).toBeGreaterThan(onResolved);
		const args = call![1] ?? "";
		expect(args).toMatch(/\bpathname\b/);
		expect(args).not.toMatch(/\b(search|searchStr|href|hash|url)\b/);
	});
});

describe("LanguageProvider GA hook (source)", () => {
	it("imports trackLanguageChange from the GA module", () => {
		expect(code(languageProviderSource)).toMatch(
			/import\s*\{[^}]*\btrackLanguageChange\b[^}]*\}\s*from\s*["'](?:\.\.\/lib|@\/lib)\/analytics\/ga["']/
		);
	});
});

// Behaviour: rendered with renderToStaticMarkup (no DOM); the probe captures setLanguage, which is
// then called outside render (the state update is a server no-op, the side effects still run).

function memoryStorage(initial: Record<string, string>) {
	const map = new Map(Object.entries(initial));
	return {
		getItem: vi.fn((key: string) => map.get(key) ?? null),
		setItem: vi.fn((key: string, value: string) => void map.set(key, String(value))),
		removeItem: vi.fn((key: string) => void map.delete(key)),
		clear: () => map.clear(),
		key: (index: number) => [...map.keys()][index] ?? null,
		get length() {
			return map.size;
		}
	};
}

function stubBrowser(runtimeEnv: Record<string, string>) {
	const win: { __ENV__: Record<string, string>; location: unknown; dataLayer?: unknown[] } = {
		__ENV__: runtimeEnv,
		location: { origin: ORIGIN, pathname: "/", search: "", hash: "", href: `${ORIGIN}/` }
	};
	const append = vi.fn((el: unknown) => el);
	vi.stubGlobal("window", win);
	vi.stubGlobal("document", {
		title: "Bihar Krishi",
		createElement: vi.fn(() => ({ setAttribute: vi.fn() })),
		head: { appendChild: append, append, insertBefore: append },
		body: { appendChild: append, append, insertBefore: append },
		querySelector: vi.fn(() => null),
		getElementById: vi.fn(() => null),
		getElementsByTagName: vi.fn(() => [])
	});
	const storage = memoryStorage({ app_language: "hi" });
	vi.stubGlobal("localStorage", storage);
	return { win, storage };
}

function languageEvents(win: { dataLayer?: unknown[] }): unknown[][] {
	return (win.dataLayer ?? [])
		.map((entry) => Array.from(entry as ArrayLike<unknown>))
		.filter((c) => c[0] === "event" && c[1] === "language_change");
}

async function renderWithGa(runtimeEnv: Record<string, string>) {
	const { win, storage } = stubBrowser(runtimeEnv);
	vi.resetModules();
	const ga = (await import(/* @vite-ignore */ GA_MODULE)) as GaModule;
	ga.initAnalytics();
	const { LanguageProvider, useLanguage } = await import("@/components/LanguageProvider");

	type SetLanguage = (lang: "en" | "hi") => void;
	const captured: SetLanguage[] = [];
	function Probe({ onRender }: { onRender: (setLanguage: SetLanguage) => void }) {
		onRender(useLanguage().setLanguage);
		return null;
	}
	renderToStaticMarkup(
		<LanguageProvider>
			<Probe onRender={(fn) => captured.push(fn)} />
		</LanguageProvider>
	);
	expect(captured).toHaveLength(1);
	return { win, storage, setLanguage: captured[0]! };
}

afterEach(() => {
	vi.unstubAllGlobals();
	vi.resetModules();
});

describe("LanguageProvider.setLanguage reports language_change", () => {
	it("the initial language from storage sends no language_change", async () => {
		const { win } = await renderWithGa({});

		expect(languageEvents(win)).toEqual([]);
	});

	it("a user choice sends exactly one ['event', 'language_change', {language}]", async () => {
		const { win, storage, setLanguage } = await renderWithGa({});

		setLanguage("en");

		expect(languageEvents(win)).toEqual([["event", "language_change", { language: "en" }]]);
		expect(storage.setItem).toHaveBeenCalledWith("app_language", "en");
	});

	it("with GA disabled, setLanguage still persists and sends nothing", async () => {
		const { win, storage, setLanguage } = await renderWithGa({ GA_ENABLED: "false" });

		expect(() => setLanguage("en")).not.toThrow();

		expect(win.dataLayer).toBeUndefined();
		expect(storage.setItem).toHaveBeenCalledWith("app_language", "en");
	});
});
