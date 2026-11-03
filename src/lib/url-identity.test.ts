import { afterEach, describe, expect, it, vi } from "vitest";

// Vite raw import: node:fs is polyfilled to a stub by vite-plugin-node-polyfills in this config.
import mainSource from "../main.tsx?raw";

// Boot-time capture of the identity params the Bihar Krishi host app appends to the URL
// (`integrity_token`, `username`). The module is loaded through a path variable so the suite
// compiles before `./url-identity` exists; the contract below is the public seam.

type LocationLike = { search: string; pathname: string; hash?: string };
type HistoryLike = { replaceState: (data: unknown, unused: string, url?: string | null) => void };

interface UrlIdentityModule {
	captureUrlIdentity: (loc?: LocationLike, history?: HistoryLike) => void;
	getIntegrityToken: () => string;
	getUsername: () => string | undefined;
	resetUrlIdentityForTests: () => void;
}

const URL_IDENTITY_MODULE = "./url-identity";

async function loadUrlIdentity(): Promise<UrlIdentityModule> {
	vi.resetModules();
	const mod = (await import(/* @vite-ignore */ URL_IDENTITY_MODULE)) as UrlIdentityModule;
	mod.resetUrlIdentityForTests();
	return mod;
}

function fakeHistory() {
	return { replaceState: vi.fn<HistoryLike["replaceState"]>() };
}

afterEach(() => {
	vi.unstubAllGlobals();
	vi.resetModules();
});

describe("url-identity import safety and defaults", () => {
	it("imports without a window and returns empty defaults", async () => {
		const { getIntegrityToken, getUsername } = await loadUrlIdentity();

		expect(getIntegrityToken()).toBe("");
		expect(getUsername()).toBeUndefined();
	});
});

describe("captureUrlIdentity", () => {
	it("captures integrity_token and username from the search string", async () => {
		const { captureUrlIdentity, getIntegrityToken, getUsername } = await loadUrlIdentity();

		captureUrlIdentity(
			{ search: "?integrity_token=itok-123&username=ravi", pathname: "/" },
			fakeHistory()
		);

		expect(getIntegrityToken()).toBe("itok-123");
		expect(getUsername()).toBe("ravi");
	});

	it("URL-decodes the values exactly once", async () => {
		const { captureUrlIdentity, getIntegrityToken, getUsername } = await loadUrlIdentity();

		captureUrlIdentity(
			{
				search: "?integrity_token=abc%2Fdef%3D%3D%2525&username=%E0%A4%B0%E0%A4%B5%E0%A4%BF",
				pathname: "/"
			},
			fakeHistory()
		);

		expect(getIntegrityToken()).toBe("abc/def==%25");
		expect(getUsername()).toBe("रवि");
	});

	it.each(["abc%ZZdef", "abc%E0%A4%A", "abc%"])(
		"keeps the raw value for malformed percent-encoding without throwing: %s",
		async (raw) => {
			const { captureUrlIdentity, getIntegrityToken, getUsername } = await loadUrlIdentity();

			expect(() =>
				captureUrlIdentity(
					{ search: `?integrity_token=${raw}&username=${raw}`, pathname: "/" },
					fakeHistory()
				)
			).not.toThrow();

			expect(getIntegrityToken()).toBe(raw);
			expect(getUsername()).toBe(raw);
		}
	);

	it("returns defaults when neither param is present", async () => {
		const { captureUrlIdentity, getIntegrityToken, getUsername } = await loadUrlIdentity();

		captureUrlIdentity({ search: "?lang=hi", pathname: "/" }, fakeHistory());

		expect(getIntegrityToken()).toBe("");
		expect(getUsername()).toBeUndefined();
	});

	it("is idempotent: a later call does not overwrite the captured values", async () => {
		const { captureUrlIdentity, getIntegrityToken, getUsername } = await loadUrlIdentity();

		captureUrlIdentity(
			{ search: "?integrity_token=first&username=alpha", pathname: "/" },
			fakeHistory()
		);
		captureUrlIdentity(
			{ search: "?integrity_token=second&username=beta", pathname: "/" },
			fakeHistory()
		);

		expect(getIntegrityToken()).toBe("first");
		expect(getUsername()).toBe("alpha");
	});

	it("is idempotent even when the first call found nothing", async () => {
		const { captureUrlIdentity, getIntegrityToken, getUsername } = await loadUrlIdentity();

		captureUrlIdentity({ search: "", pathname: "/" }, fakeHistory());
		captureUrlIdentity(
			{ search: "?integrity_token=late&username=late", pathname: "/" },
			fakeHistory()
		);

		expect(getIntegrityToken()).toBe("");
		expect(getUsername()).toBeUndefined();
	});

	it("resetUrlIdentityForTests clears state so a new capture is taken", async () => {
		const mod = await loadUrlIdentity();

		mod.captureUrlIdentity(
			{ search: "?integrity_token=one&username=u1", pathname: "/" },
			fakeHistory()
		);
		mod.resetUrlIdentityForTests();

		expect(mod.getIntegrityToken()).toBe("");
		expect(mod.getUsername()).toBeUndefined();

		mod.captureUrlIdentity(
			{ search: "?integrity_token=two&username=u2", pathname: "/" },
			fakeHistory()
		);

		expect(mod.getIntegrityToken()).toBe("two");
		expect(mod.getUsername()).toBe("u2");
	});
});

describe("captureUrlIdentity address-bar cleanup", () => {
	it("removes only integrity_token, keeping pathname, other params and hash", async () => {
		const { captureUrlIdentity } = await loadUrlIdentity();
		const history = fakeHistory();

		captureUrlIdentity(
			{
				search: "?username=ravi&integrity_token=itok-123&token=abc",
				pathname: "/chat",
				hash: "#top"
			},
			history
		);

		expect(history.replaceState).toHaveBeenCalledTimes(1);
		expect(history.replaceState.mock.calls[0]?.[2]).toBe("/chat?username=ravi&token=abc#top");
	});

	it("drops the '?' when integrity_token was the only param", async () => {
		const { captureUrlIdentity } = await loadUrlIdentity();
		const history = fakeHistory();

		captureUrlIdentity({ search: "?integrity_token=itok-123", pathname: "/chat" }, history);

		expect(history.replaceState).toHaveBeenCalledTimes(1);
		expect(history.replaceState.mock.calls[0]?.[2]).toBe("/chat");
	});

	it("does not touch history when there is no integrity_token", async () => {
		const { captureUrlIdentity } = await loadUrlIdentity();
		const history = fakeHistory();

		captureUrlIdentity({ search: "?username=ravi&token=abc", pathname: "/chat" }, history);

		expect(history.replaceState).not.toHaveBeenCalled();
	});

	it("does not call replaceState again on a later call", async () => {
		const { captureUrlIdentity } = await loadUrlIdentity();
		const history = fakeHistory();

		captureUrlIdentity({ search: "?integrity_token=first", pathname: "/" }, history);
		captureUrlIdentity({ search: "?integrity_token=second", pathname: "/" }, history);

		expect(history.replaceState).toHaveBeenCalledTimes(1);
	});
});

describe("captureUrlIdentity defaults to window.location / window.history", () => {
	it("reads window.location and cleans up through window.history", async () => {
		const replaceState = vi.fn<HistoryLike["replaceState"]>();
		vi.stubGlobal("window", {
			location: {
				search: "?integrity_token=win-tok&username=win-user&lang=hi",
				pathname: "/home",
				hash: ""
			},
			history: { replaceState }
		});
		const { captureUrlIdentity, getIntegrityToken, getUsername } = await loadUrlIdentity();

		captureUrlIdentity();

		expect(getIntegrityToken()).toBe("win-tok");
		expect(getUsername()).toBe("win-user");
		expect(replaceState).toHaveBeenCalledTimes(1);
		expect(replaceState.mock.calls[0]?.[2]).toBe("/home?username=win-user&lang=hi");
	});
});

describe("main.tsx boot order", () => {
	it("imports url-identity before any other module", () => {
		const firstImport = mainSource.match(/^\s*import\s[^;]*?["']([^"']+)["']/m);

		expect(firstImport?.[1]).toMatch(/(^\.\/lib\/|^@\/lib\/)url-identity$/);
	});

	it("calls captureUrlIdentity() before the router and the React root are created", () => {
		const callIndex = mainSource.search(/\bcaptureUrlIdentity\(\s*\)/);

		expect(callIndex).toBeGreaterThan(-1);
		expect(callIndex).toBeLessThan(mainSource.indexOf("createRouter("));
		expect(callIndex).toBeLessThan(mainSource.indexOf("createRoot("));
	});
});
