import { afterEach, describe, expect, it, vi } from "vitest";

// Doc 80 §8.3/§8.4: Google Analytics (GA4, gtag.js) kept as in the old app, but bootstrapped by
// bundled code (the CSP forbids the old inline snippet) and sending pathnames only.
// The module is loaded through a path variable so the suite compiles before `./ga` exists;
// the contract below is the public seam.

interface GaModule {
	initAnalytics: () => void;
	trackPageView: (pathname: string, title?: string) => void;
	trackEvent: (name: string, params?: Record<string, unknown>) => void;
	trackLanguageChange: (language: string) => void;
}

const GA_MODULE = "./ga";
const DEFAULT_ID = "G-SV0TLS2S41";
const GTAG_URL = "https://www.googletagmanager.com/gtag/js?id=";
const ORIGIN = "https://www.biharkrishi.in";

type FakeElement = Record<string, unknown> & {
	tagName: string;
	attributes: Record<string, string>;
	setAttribute: (name: string, value: string) => void;
};

type FakeWindow = {
	__ENV__?: Record<string, string>;
	location: { origin: string; pathname: string; search: string; hash: string; href: string };
	dataLayer?: unknown[];
	gtag?: unknown;
};

function fakeDom(runtimeEnv: Record<string, string> | undefined, href = `${ORIGIN}/chat`) {
	const url = new URL(href);
	const win: FakeWindow = {
		...(runtimeEnv === undefined ? {} : { __ENV__: runtimeEnv }),
		location: {
			origin: url.origin,
			pathname: url.pathname,
			search: url.search,
			hash: url.hash,
			href: url.href
		}
	};
	const appended: FakeElement[] = [];
	const append = vi.fn((el: FakeElement) => {
		appended.push(el);
		return el;
	});
	const createElement = vi.fn((tag: string): FakeElement => {
		const el: FakeElement = {
			tagName: tag.toUpperCase(),
			attributes: {},
			setAttribute(name: string, value: string) {
				el.attributes[name] = value;
				el[name] = value;
			}
		};
		return el;
	});
	const findGtm = () => appended.find((el) => scriptSrc(el).includes("googletagmanager")) ?? null;
	const doc = {
		title: "Bihar Krishi",
		createElement,
		head: { appendChild: append, append, insertBefore: append },
		body: { appendChild: append, append, insertBefore: append },
		querySelector: vi.fn((selector: string) =>
			selector.includes("googletagmanager") ? findGtm() : null
		),
		getElementById: vi.fn(() => null),
		getElementsByTagName: vi.fn(() => [])
	};
	vi.stubGlobal("window", win);
	vi.stubGlobal("document", doc);
	return { win, doc, appended };
}

function scriptSrc(el: FakeElement): string {
	return String(el.src ?? el.attributes.src ?? "");
}

function isAsync(el: FakeElement): boolean {
	return el.async === true || "async" in el.attributes;
}

async function loadGa(): Promise<GaModule> {
	vi.resetModules();
	return (await import(/* @vite-ignore */ GA_MODULE)) as GaModule;
}

/** gtag() pushes its `arguments` object; normalise every entry to a plain array. */
function commands(win: FakeWindow): unknown[][] {
	return (win.dataLayer ?? []).map((entry) => Array.from(entry as ArrayLike<unknown>));
}

function events(win: FakeWindow, name: string): unknown[][] {
	return commands(win).filter((c) => c[0] === "event" && c[1] === name);
}

afterEach(() => {
	vi.unstubAllGlobals();
	vi.resetModules();
});

describe("ga import safety", () => {
	it("imports and runs every function without window or document, without throwing", async () => {
		const ga = await loadGa();

		expect(() => {
			ga.initAnalytics();
			ga.trackPageView("/chat");
			ga.trackEvent("x", { a: 1 });
			ga.trackLanguageChange("hi");
		}).not.toThrow();
	});

	it("does not throw when window exists but document does not", async () => {
		vi.stubGlobal("window", {
			__ENV__: {},
			location: { origin: ORIGIN, pathname: "/", search: "", hash: "", href: `${ORIGIN}/` }
		});
		const ga = await loadGa();

		expect(() => {
			ga.initAnalytics();
			ga.trackPageView("/");
		}).not.toThrow();
	});
});

describe("initAnalytics when enabled (default)", () => {
	it.each([
		["window.__ENV__ undefined", undefined],
		["keys missing", {}],
		["keys empty", { GA_ENABLED: "", GA_MEASUREMENT_ID: "" }],
		["GA_ENABLED 'true'", { GA_ENABLED: " TRUE " }],
		["GA_ENABLED unrecognised", { GA_ENABLED: "yes" }]
	])("appends one async gtag.js script for %s", async (_label, runtimeEnv) => {
		const { win, doc, appended } = fakeDom(runtimeEnv);
		const ga = await loadGa();

		ga.initAnalytics();

		expect(doc.createElement).toHaveBeenCalledWith("script");
		expect(appended).toHaveLength(1);
		const [script] = appended;
		expect(script?.tagName).toBe("SCRIPT");
		expect(scriptSrc(script!)).toBe(`${GTAG_URL}${DEFAULT_ID}`);
		expect(isAsync(script!)).toBe(true);
		expect(typeof win.gtag).toBe("function");
	});

	it("queues ['js', Date] and ['config', id, {send_page_view:false}] on window.dataLayer", async () => {
		const { win } = fakeDom({});
		const ga = await loadGa();

		ga.initAnalytics();

		const cmds = commands(win);
		const js = cmds.filter((c) => c[0] === "js");
		const config = cmds.filter((c) => c[0] === "config");
		expect(js).toHaveLength(1);
		expect(js[0]?.[1]).toBeInstanceOf(Date);
		expect(config).toHaveLength(1);
		expect(config[0]?.[1]).toBe(DEFAULT_ID);
		expect(config[0]?.[2]).toMatchObject({ send_page_view: false });
		expect(cmds.indexOf(js[0]!)).toBeLessThan(cmds.indexOf(config[0]!));
	});

	it("window.gtag pushes onto window.dataLayer (the gtag.js queue contract)", async () => {
		const { win } = fakeDom({});
		const ga = await loadGa();
		ga.initAnalytics();
		const before = win.dataLayer?.length ?? 0;

		(win.gtag as (...args: unknown[]) => void)("event", "probe", { p: 1 });

		expect(win.dataLayer).toHaveLength(before + 1);
		expect(events(win, "probe")).toEqual([["event", "probe", { p: 1 }]]);
	});

	it("is idempotent: a second init appends no second script and no second js/config", async () => {
		const { win, appended } = fakeDom({});
		const ga = await loadGa();

		ga.initAnalytics();
		ga.initAnalytics();

		expect(appended).toHaveLength(1);
		expect(commands(win).filter((c) => c[0] === "js")).toHaveLength(1);
		expect(commands(win).filter((c) => c[0] === "config")).toHaveLength(1);
	});

	it("uses a valid GA_MEASUREMENT_ID override (trimmed) in the script URL and config", async () => {
		const { win, appended } = fakeDom({ GA_MEASUREMENT_ID: " G-ABC1234XYZ " });
		const ga = await loadGa();

		ga.initAnalytics();

		expect(scriptSrc(appended[0]!)).toBe(`${GTAG_URL}G-ABC1234XYZ`);
		expect(commands(win).find((c) => c[0] === "config")?.[1]).toBe("G-ABC1234XYZ");
	});
});

describe("initAnalytics when disabled", () => {
	it.each([
		["GA_ENABLED 'false'", { GA_ENABLED: "false" }],
		["GA_ENABLED ' FALSE '", { GA_ENABLED: " FALSE " }],
		["GA_MEASUREMENT_ID injection", { GA_MEASUREMENT_ID: 'x"><script>alert(1)</script>' }],
		["GA_MEASUREMENT_ID with extra query", { GA_MEASUREMENT_ID: "G-SV0TLS2S41&l=evil" }],
		["GA_MEASUREMENT_ID Universal Analytics", { GA_MEASUREMENT_ID: "UA-12345-1" }],
		["GA_MEASUREMENT_ID lowercase", { GA_MEASUREMENT_ID: "g-sv0tls2s41" }],
		["GA_MEASUREMENT_ID too short", { GA_MEASUREMENT_ID: "G-AB12" }]
	])(
		"%s: no script, no dataLayer, no gtag, track* are silent no-ops",
		async (_label, runtimeEnv) => {
			const { win, doc, appended } = fakeDom(runtimeEnv);
			const ga = await loadGa();

			expect(() => {
				ga.initAnalytics();
				ga.trackPageView("/chat");
				ga.trackEvent("feature_used", { a: 1 });
				ga.trackLanguageChange("hi");
			}).not.toThrow();

			expect(doc.createElement).not.toHaveBeenCalled();
			expect(appended).toHaveLength(0);
			expect(win.dataLayer).toBeUndefined();
			expect(win.gtag).toBeUndefined();
		}
	);
});

describe("trackPageView sends the pathname only", () => {
	it.each([
		["/chat", "/chat"],
		["/chat?token=abc&integrity_token=x", "/chat"],
		["/chat#frag", "/chat"],
		["/?username=ravi#x", "/"],
		["/settings?integrity_token=itok&username=ravi&token=t#h", "/settings"]
	])("%s -> page_path %s", async (input, pathname) => {
		const { win } = fakeDom({});
		const ga = await loadGa();
		ga.initAnalytics();

		ga.trackPageView(input);

		const views = events(win, "page_view");
		expect(views).toHaveLength(1);
		expect(views[0]?.[2]).toMatchObject({
			page_path: pathname,
			page_location: `${ORIGIN}${pathname}`
		});
	});

	it("uses the given title, else document.title", async () => {
		const { win } = fakeDom({});
		const ga = await loadGa();
		ga.initAnalytics();

		ga.trackPageView("/chat", "Chat");
		ga.trackPageView("/profile");

		const views = events(win, "page_view");
		expect(views[0]?.[2]).toMatchObject({ page_title: "Chat" });
		expect(views[1]?.[2]).toMatchObject({ page_title: "Bihar Krishi" });
	});

	it("never leaks query, hash, token or username into dataLayer or the script URL", async () => {
		const { win, appended } = fakeDom(
			{},
			`${ORIGIN}/chat?token=tok-SECRET&integrity_token=itok-SECRET&username=ravi-SECRET#hash-SECRET`
		);
		const ga = await loadGa();

		ga.initAnalytics();
		ga.trackPageView(
			"/chat?token=tok-SECRET&integrity_token=itok-SECRET&username=ravi-SECRET#hash-SECRET"
		);
		ga.trackLanguageChange("hi");

		const sent = JSON.stringify(commands(win), (_k, v: unknown) =>
			v instanceof Date ? "DATE" : v
		);
		for (const leak of ["SECRET", "token", "username", "?", "#"]) {
			expect(sent).not.toContain(leak);
		}
		expect(appended.map(scriptSrc)).toEqual([`${GTAG_URL}${DEFAULT_ID}`]);
	});
});

describe("trackEvent / trackLanguageChange", () => {
	it("trackEvent pushes ['event', name, params]", async () => {
		const { win } = fakeDom({});
		const ga = await loadGa();
		ga.initAnalytics();

		ga.trackEvent("feature_used", { feature: "voice" });

		expect(events(win, "feature_used")).toEqual([["event", "feature_used", { feature: "voice" }]]);
	});

	it("trackLanguageChange pushes ['event', 'language_change', {language}]", async () => {
		const { win } = fakeDom({});
		const ga = await loadGa();
		ga.initAnalytics();

		ga.trackLanguageChange("hi");

		expect(events(win, "language_change")).toEqual([
			["event", "language_change", { language: "hi" }]
		]);
	});
});
