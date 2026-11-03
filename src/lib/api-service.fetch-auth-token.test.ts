import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// POST /api/token must carry the Bihar Krishi integrity token and client code alongside the
// browser metadata, with no auth headers. The integrity token defaults to the value captured
// from the URL at boot (src/lib/url-identity), which is how the existing call sites pick it up.

const { axiosPost } = vi.hoisted(() => ({ axiosPost: vi.fn() }));

vi.mock("axios", () => {
	const instance = {
		defaults: { headers: { common: {} as Record<string, string> } },
		interceptors: { response: { use: vi.fn() }, request: { use: vi.fn() } },
		get: vi.fn(),
		post: vi.fn(),
		request: vi.fn()
	};
	return { default: { create: vi.fn(() => instance), post: axiosPost } };
});

const API_URL = "https://api.example.test";
const TOKEN_URL = `${API_URL}/api/token`;
const JSON_ONLY_HEADERS = { headers: { "Content-Type": "application/json" } };

type FetchAuthToken = (
	metadata: string,
	fingerprintId?: string | null,
	integrityToken?: string,
	clientCode?: string
) => Promise<string>;

interface UrlIdentityModule {
	captureUrlIdentity: (
		loc?: { search: string; pathname: string; hash?: string },
		history?: { replaceState: (data: unknown, unused: string, url?: string | null) => void }
	) => void;
	resetUrlIdentityForTests: () => void;
}

// Path variable keeps `tsc -b` green before ./url-identity exists.
const URL_IDENTITY_MODULE = "./url-identity";

async function loadFetchAuthToken(bootIntegrityToken?: string): Promise<FetchAuthToken> {
	vi.resetModules();
	if (bootIntegrityToken !== undefined) {
		const identity = (await import(/* @vite-ignore */ URL_IDENTITY_MODULE)) as UrlIdentityModule;
		identity.resetUrlIdentityForTests();
		identity.captureUrlIdentity(
			{
				search: `?integrity_token=${encodeURIComponent(bootIntegrityToken)}`,
				pathname: "/"
			},
			{ replaceState: vi.fn() }
		);
	}
	const { default: apiService } = await import("./api-service");
	// Widened view of the public method: the 3rd/4th parameters are the behaviour under test.
	const fetchAuthToken = apiService.fetchAuthToken as unknown as FetchAuthToken;
	return fetchAuthToken.bind(apiService);
}

function lastPost() {
	expect(axiosPost).toHaveBeenCalledTimes(1);
	const [url, body, config] = axiosPost.mock.calls[0] as [string, Record<string, unknown>, unknown];
	return { url, body, config };
}

beforeEach(() => {
	axiosPost.mockReset();
	axiosPost.mockResolvedValue({ data: { token: "jwt-token" } });
	vi.stubGlobal("window", { __ENV__: { VITE_API_URL: API_URL } });
	vi.stubGlobal("localStorage", {
		getItem: vi.fn(() => null),
		setItem: vi.fn(),
		removeItem: vi.fn()
	});
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.resetModules();
});

describe("ApiService.fetchAuthToken request body", () => {
	it("sends clientCode 'bihar-krishi' and an empty integrityToken by default", async () => {
		const fetchAuthToken = await loadFetchAuthToken();

		await expect(fetchAuthToken("meta", "fp-1")).resolves.toBe("jwt-token");

		const { url, body, config } = lastPost();
		expect(url).toBe(TOKEN_URL);
		expect(body).toStrictEqual({
			metadata: "meta",
			fingerprint_id: "fp-1",
			integrityToken: "",
			clientCode: "bihar-krishi"
		});
		expect(config).toStrictEqual(JSON_ONLY_HEADERS);
	});

	it("uses explicit integrityToken and clientCode arguments", async () => {
		const fetchAuthToken = await loadFetchAuthToken();

		await fetchAuthToken("meta", "fp-1", "explicit-itok", "other-client");

		const { url, body, config } = lastPost();
		expect(url).toBe(TOKEN_URL);
		expect(body).toStrictEqual({
			metadata: "meta",
			fingerprint_id: "fp-1",
			integrityToken: "explicit-itok",
			clientCode: "other-client"
		});
		expect(config).toStrictEqual(JSON_ONLY_HEADERS);
	});

	it("falls back to the boot-captured URL integrity token when the argument is absent", async () => {
		const fetchAuthToken = await loadFetchAuthToken("boot-itok/=");

		await fetchAuthToken("meta", "fp-1");

		expect(lastPost().body).toStrictEqual({
			metadata: "meta",
			fingerprint_id: "fp-1",
			integrityToken: "boot-itok/=",
			clientCode: "bihar-krishi"
		});
	});

	it("prefers an explicit integrityToken over the boot-captured value", async () => {
		const fetchAuthToken = await loadFetchAuthToken("boot-itok");

		await fetchAuthToken("meta", "fp-1", "explicit-itok");

		expect(lastPost().body).toStrictEqual({
			metadata: "meta",
			fingerprint_id: "fp-1",
			integrityToken: "explicit-itok",
			clientCode: "bihar-krishi"
		});
	});

	it.each([null, undefined])("omits fingerprint_id when the fingerprint is %s", async (fp) => {
		const fetchAuthToken = await loadFetchAuthToken();

		await fetchAuthToken("meta", fp);

		expect(lastPost().body).toStrictEqual({
			metadata: "meta",
			integrityToken: "",
			clientCode: "bihar-krishi"
		});
	});

	it("still rejects when the response has no token", async () => {
		axiosPost.mockResolvedValue({ data: {} });
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		const fetchAuthToken = await loadFetchAuthToken();

		await expect(fetchAuthToken("meta", "fp-1")).rejects.toThrow(
			"No token received from auth endpoint"
		);
	});
});
