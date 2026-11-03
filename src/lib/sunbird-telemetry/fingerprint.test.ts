import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// fingerprint_details for Sunbird events (doc 80 §2.2, P5.4). The context is cached in
// localStorage["fingerprint_context"] as { ready, data } so the existing getFingerprintId()
// (src/lib/utils/fingerprint.ts) keeps reading the same device_id: device ids stay continuous.

const { fpLoad, fpGet } = vi.hoisted(() => ({ fpLoad: vi.fn(), fpGet: vi.fn() }));

vi.mock("@fingerprintjs/fingerprintjs", () => ({ default: { load: fpLoad } }));

type Coded = { code: string; name?: string; version?: string; model?: string };
interface FingerprintDetails {
	device_id: string;
	browser: Coded;
	os: Coded;
	device: Coded;
	session: Record<string, unknown>;
	device_lifecycle: Record<string, unknown>;
}

interface FingerprintModule {
	getFingerprintDetails: (userAgent?: string) => Promise<FingerprintDetails | null>;
}

const FINGERPRINT_MODULE = "./fingerprint";
const STORAGE_KEY = "fingerprint_context";

const UA = {
	chromeWindows:
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
	safariIphone:
		"Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
	chromeAndroid:
		"Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
	firefoxLinux: "Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0",
	edgeMac:
		"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
	ipad: "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
};

let store: Map<string, string>;

function stubStorage() {
	store = new Map();
	vi.stubGlobal("localStorage", {
		getItem: vi.fn((k: string) => store.get(k) ?? null),
		setItem: vi.fn((k: string, v: string) => void store.set(k, String(v))),
		removeItem: vi.fn((k: string) => void store.delete(k))
	});
}

async function loadFingerprint(): Promise<FingerprintModule> {
	vi.resetModules();
	return (await import(/* @vite-ignore */ FINGERPRINT_MODULE)) as FingerprintModule;
}

beforeEach(() => {
	stubStorage();
	fpGet.mockReset().mockResolvedValue({ visitorId: "vis-1" });
	fpLoad.mockReset().mockResolvedValue({ get: fpGet });
	vi.stubGlobal("navigator", { userAgent: UA.chromeWindows });
	vi.stubGlobal("window", { navigator: { userAgent: UA.chromeWindows } });
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.resetModules();
});

describe("getFingerprintDetails", () => {
	it("computes device_id from FingerprintJS and the old field groups", async () => {
		const { getFingerprintDetails } = await loadFingerprint();

		const details = await getFingerprintDetails(UA.chromeWindows);

		expect(details).not.toBeNull();
		expect(details?.device_id).toBe("vis-1");
		expect(details?.browser).toMatchObject({ code: "CH" });
		expect(details?.os).toMatchObject({ code: "WIN" });
		expect(details?.device).toMatchObject({ code: "DT" });
		expect(details?.session).toEqual(expect.any(Object));
		expect(details?.device_lifecycle).toEqual(expect.any(Object));
	});

	it.each([
		["iPhone Safari", UA.safariIphone, "SF", "IOS", "MB"],
		["Android Chrome", UA.chromeAndroid, "CH", "AND", "MB"],
		["Linux Firefox", UA.firefoxLinux, "FF", "LNX", "DT"],
		["macOS Edge", UA.edgeMac, "ED", "MAC", "DT"],
		["iPad", UA.ipad, "SF", "IOS", "TB"]
	])("maps %s to browser/os/device codes", async (_label, ua, browser, os, device) => {
		const { getFingerprintDetails } = await loadFingerprint();

		const details = await getFingerprintDetails(ua);

		expect(details?.browser.code).toBe(browser);
		expect(details?.os.code).toBe(os);
		expect(details?.device.code).toBe(device);
	});

	it("caches { ready, data } so the existing getFingerprintId() returns the same device id", async () => {
		const { getFingerprintDetails } = await loadFingerprint();
		const { getFingerprintId } = await import("@/lib/utils/fingerprint");

		await getFingerprintDetails(UA.chromeWindows);

		const cached = JSON.parse(store.get(STORAGE_KEY) ?? "null") as {
			ready: boolean;
			data: { device_id: string };
		};
		expect(cached.ready).toBe(true);
		expect(cached.data.device_id).toBe("vis-1");
		fpLoad.mockClear();
		await expect(getFingerprintId()).resolves.toBe("vis-1");
		expect(fpLoad).not.toHaveBeenCalled();
	});

	it("reuses a cached device_id without loading FingerprintJS (continuity for existing users)", async () => {
		store.set(
			STORAGE_KEY,
			JSON.stringify({
				ready: true,
				data: {
					device_id: "legacy-device",
					browser: { code: "CH", name: "Chrome", version: "119" },
					os: { code: "WIN", name: "Windows", version: "10" },
					device: { code: "DT", name: "desktop", model: "" },
					session: { session_start_at: 1 },
					device_lifecycle: { first_seen_at: 1 }
				}
			})
		);
		const { getFingerprintDetails } = await loadFingerprint();

		const details = await getFingerprintDetails(UA.chromeWindows);

		expect(details?.device_id).toBe("legacy-device");
		expect(fpLoad).not.toHaveBeenCalled();
	});

	it("ignores a corrupt cache and recomputes", async () => {
		store.set(STORAGE_KEY, "{not json");
		const { getFingerprintDetails } = await loadFingerprint();

		await expect(getFingerprintDetails(UA.chromeWindows)).resolves.toMatchObject({
			device_id: "vis-1"
		});
	});

	it("resolves null (never throws) when FingerprintJS fails", async () => {
		fpLoad.mockRejectedValue(new Error("blocked"));
		vi.spyOn(console, "warn").mockImplementation(() => undefined);
		const { getFingerprintDetails } = await loadFingerprint();

		await expect(getFingerprintDetails(UA.chromeWindows)).resolves.toBeNull();
		expect(store.has(STORAGE_KEY)).toBe(false);
	});
});
