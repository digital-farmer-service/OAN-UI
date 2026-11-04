import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Owner decision: the app must never request browser geolocation on its own. There is no UI that
// lets the user choose to share location, so sending a question (text, suggestion, or an image /
// pest upload, which goes through sendImage) must not call navigator.geolocation.getCurrentPosition.
// The question itself must still be sent.
// Harness: node env; window/navigator/localStorage are stubbed, apiService is a fake, and the store
// module is re-imported per test so its module-level location flags start clean.

const api = vi.hoisted(() => ({
	sendUserQuery: vi.fn(async (_query: string) => ({ qid: "q-1" })),
	sendImageQuery: vi.fn(async () => ({ qid: "q-img-1" })),
	getSuggestions: vi.fn(async () => []),
	getLocationData: vi.fn(() => null),
	setLocationData: vi.fn(),
	setSessionId: vi.fn(),
	getSessionId: vi.fn(() => null),
	trackUiTelemetryEvent: vi.fn(),
	submitTelemetryError: vi.fn(async () => undefined)
}));

vi.mock("@/lib/api-service", () => ({ default: api }));

vi.mock("@/lib/sunbird-telemetry/chat-hooks", () => ({
	sunbirdQuestion: () => "sb-q",
	sunbirdChunk: () => undefined,
	sunbirdAnswer: () => undefined,
	sunbirdError: () => undefined,
	sunbirdFeedback: () => undefined
}));

function memoryStorage(initial: Record<string, string> = {}) {
	const map = new Map(Object.entries(initial));
	return {
		getItem: (key: string) => map.get(key) ?? null,
		setItem: (key: string, value: string) => void map.set(key, String(value)),
		removeItem: (key: string) => void map.delete(key),
		clear: () => map.clear(),
		key: (index: number) => [...map.keys()][index] ?? null,
		get length() {
			return map.size;
		}
	};
}

let getCurrentPosition: ReturnType<typeof vi.fn>;
let permissionsQuery: ReturnType<typeof vi.fn>;

function stubBrowser(): void {
	// The browser answers immediately (denied), so the current code cannot hang on the prompt.
	getCurrentPosition = vi.fn((_ok: unknown, fail: (e: unknown) => void) =>
		fail({ code: 1, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 })
	);
	permissionsQuery = vi.fn(async () => ({ state: "prompt" }));
	vi.stubGlobal("window", globalThis);
	vi.stubGlobal("navigator", {
		userAgent: "vitest",
		language: "en",
		geolocation: { getCurrentPosition, watchPosition: vi.fn(), clearWatch: vi.fn() },
		permissions: { query: permissionsQuery }
	});
	vi.stubGlobal("localStorage", memoryStorage());
}

/** Minimal Image + canvas so sendImage's JPEG normalisation succeeds outside a browser. */
function stubImagePipeline(): void {
	class FakeImage {
		naturalWidth = 10;
		naturalHeight = 10;
		width = 10;
		height = 10;
		onload: (() => void) | null = null;
		onerror: (() => void) | null = null;
		set src(_value: string) {
			queueMicrotask(() => this.onload?.());
		}
	}
	vi.stubGlobal("Image", FakeImage);
	vi.stubGlobal("document", {
		createElement: () => ({
			width: 0,
			height: 0,
			getContext: () => ({ drawImage: () => undefined }),
			toBlob: (cb: (b: Blob) => void, type: string) => cb(new Blob(["x"], { type }))
		})
	});
}

async function loadStore() {
	vi.resetModules();
	const { useChatStore } = await import("@/hooks/store/chat");
	return useChatStore;
}

const t = (key: string) => key;

beforeEach(() => {
	vi.clearAllMocks();
	stubBrowser();
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.resetModules();
});

describe("sending a question never requests browser geolocation", () => {
	it("sendText does not call navigator.geolocation.getCurrentPosition", async () => {
		const useChatStore = await loadStore();

		await useChatStore.getState().sendText("When should I sow wheat?", "en", t);

		expect(getCurrentPosition).not.toHaveBeenCalled();
	});

	it("sendText still sends the question to the API", async () => {
		const useChatStore = await loadStore();

		await useChatStore.getState().sendText("When should I sow wheat?", "en", t);

		expect(api.sendUserQuery).toHaveBeenCalledTimes(1);
		expect(api.sendUserQuery.mock.calls[0]?.[0]).toBe("When should I sow wheat?");
	});

	it("a second sendText in the same session does not call getCurrentPosition either", async () => {
		const useChatStore = await loadStore();

		await useChatStore.getState().sendText("first", "en", t);
		await useChatStore.getState().sendText("second", "en", t);

		expect(getCurrentPosition).not.toHaveBeenCalled();
		expect(api.sendUserQuery).toHaveBeenCalledTimes(2);
	});

	it("sendImage (image / pest upload) does not call navigator.geolocation.getCurrentPosition", async () => {
		stubImagePipeline();
		const useChatStore = await loadStore();
		const file = new File([new Uint8Array([1, 2, 3])], "leaf.jpg", { type: "image/jpeg" });

		await useChatStore.getState().sendImage(file, "en", t);

		expect(getCurrentPosition).not.toHaveBeenCalled();
	});

	it("sendImage (image / pest upload) still sends the image to the API", async () => {
		stubImagePipeline();
		const useChatStore = await loadStore();
		const file = new File([new Uint8Array([1, 2, 3])], "leaf.jpg", { type: "image/jpeg" });

		await useChatStore.getState().sendImage(file, "en", t);

		expect(api.sendImageQuery).toHaveBeenCalledTimes(1);
	});
});
