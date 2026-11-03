import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import en from "../../../../translations/en.json";
import hi from "../../../../translations/hi.json";

// P4.8.5 (doc 70 §3 TTS rows, §3.1): keep the upstream fetch/buffer pipeline but port the old
// interaction: a `loading` status while /api/tts is in flight, taps on that message ignored while
// loading, a tap while playing STOPS (no pause/resume), a per-message Blob-URL cache so a replay
// does not call /api/tts again (revoked on clearChat), and a constant "Listen" label.
//
// Seams this suite fixes (not in the current store, hence the local interfaces):
//   - store action `toggleTTS(text, language, messageId)`: the tap handler of the Listen button
//   - `ttsStatus` gains "loading"
//   - `getTtsLabelKey(status)` exported from `@/lib/audio-utils`

const api = vi.hoisted(() => ({
	getTranscript: vi.fn(),
	setSessionId: vi.fn()
}));

vi.mock("@/lib/api-service", () => ({ default: api }));

type TtsState = {
	sessionId: string | null;
	currentlyPlayingId: string | null;
	ttsStatus: string;
	playTTS: (text: string, language: string, messageId: string) => Promise<void>;
	toggleTTS: (text: string, language: string, messageId: string) => Promise<void>;
	stopTTS: () => void;
	clearChat: () => void;
};

interface TtsStore {
	getState: () => TtsState;
	setState: (partial: Partial<TtsState>) => void;
}

interface AudioUtilsNext {
	getTtsLabelKey?: (status: string) => string;
}

class FakeAudio {
	static instances: FakeAudio[] = [];
	src: string;
	currentTime = 0;
	onended: (() => void) | null = null;
	play = vi.fn(() => Promise.resolve());
	pause = vi.fn();
	constructor(src?: string) {
		this.src = src ?? "";
		FakeAudio.instances.push(this);
	}
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((res) => {
		resolve = res;
	});
	return { promise, resolve };
}

const ttsResponse = () => ({ data: { status: "success", audio_data: btoa("RIFF-fake-wav") } });

let urlCounter = 0;
let createObjectURL: ReturnType<typeof vi.spyOn>;
let revokeObjectURL: ReturnType<typeof vi.spyOn>;

async function loadStore(): Promise<TtsStore> {
	vi.resetModules();
	const mod = await import("@/hooks/store/chat");
	const store = mod.useChatStore as unknown as TtsStore;
	store.setState({ sessionId: "session-1", currentlyPlayingId: null, ttsStatus: "stopped" });
	return store;
}

const lastAudio = () => FakeAudio.instances.at(-1);

beforeEach(() => {
	FakeAudio.instances = [];
	urlCounter = 0;
	api.getTranscript.mockReset();
	api.getTranscript.mockImplementation(() => Promise.resolve(ttsResponse()));
	vi.stubGlobal("Audio", FakeAudio);
	createObjectURL = vi
		.spyOn(URL, "createObjectURL")
		.mockImplementation(() => `blob:tts-${++urlCounter}`);
	revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
	vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	vi.resetModules();
});

describe("TTS loading status", () => {
	it("is `loading` while /api/tts is in flight and `playing` once audio starts", async () => {
		const store = await loadStore();
		const pending = deferred<ReturnType<typeof ttsResponse>>();
		api.getTranscript.mockReturnValueOnce(pending.promise);

		const play = store.getState().playTTS("answer one", "en", "m1");

		expect(store.getState().currentlyPlayingId).toBe("m1");
		expect(store.getState().ttsStatus).toBe("loading");
		expect(FakeAudio.instances).toHaveLength(0);

		pending.resolve(ttsResponse());
		await play;

		expect(store.getState().ttsStatus).toBe("playing");
		expect(lastAudio()?.play).toHaveBeenCalledTimes(1);
	});
});

describe("toggleTTS tap semantics", () => {
	it("ignores taps on the same message while it is loading (no pause, no second request)", async () => {
		const store = await loadStore();
		const pending = deferred<ReturnType<typeof ttsResponse>>();
		api.getTranscript.mockReturnValueOnce(pending.promise);

		const first = store.getState().toggleTTS("answer one", "en", "m1");
		await store.getState().toggleTTS("answer one", "en", "m1");
		await store.getState().toggleTTS("answer one", "en", "m1");

		expect(api.getTranscript).toHaveBeenCalledTimes(1);
		expect(store.getState().ttsStatus).toBe("loading");
		expect(store.getState().currentlyPlayingId).toBe("m1");

		pending.resolve(ttsResponse());
		await first;

		expect(store.getState().ttsStatus).toBe("playing");
		expect(FakeAudio.instances).toHaveLength(1);
		expect(lastAudio()?.play).toHaveBeenCalledTimes(1);
	});

	it("a tap while playing stops playback (not pause) and resets the status", async () => {
		const store = await loadStore();
		await store.getState().toggleTTS("answer one", "en", "m1");
		const audio = lastAudio();
		expect(store.getState().ttsStatus).toBe("playing");

		await store.getState().toggleTTS("answer one", "en", "m1");

		expect(audio?.pause).toHaveBeenCalled();
		expect(store.getState().ttsStatus).toBe("stopped");
		expect(store.getState().currentlyPlayingId).toBeNull();
		expect(api.getTranscript).toHaveBeenCalledTimes(1);
	});

	it("a tap after a stop replays from the start without calling /api/tts again", async () => {
		const store = await loadStore();
		await store.getState().toggleTTS("answer one", "en", "m1");
		await store.getState().toggleTTS("answer one", "en", "m1");

		await store.getState().toggleTTS("answer one", "en", "m1");

		expect(api.getTranscript).toHaveBeenCalledTimes(1);
		expect(store.getState().ttsStatus).toBe("playing");
		expect(lastAudio()?.currentTime).toBe(0);
		expect(lastAudio()?.play).toHaveBeenCalled();
	});
});

describe("per-message TTS audio cache", () => {
	it("replays a finished message from the cache (no second /api/tts request)", async () => {
		const store = await loadStore();
		await store.getState().playTTS("answer one", "en", "m1");
		const firstSrc = lastAudio()?.src;
		lastAudio()?.onended?.();
		expect(store.getState().ttsStatus).toBe("stopped");

		await store.getState().playTTS("answer one", "en", "m1");

		expect(api.getTranscript).toHaveBeenCalledTimes(1);
		expect(createObjectURL).toHaveBeenCalledTimes(1);
		expect(lastAudio()?.src).toBe(firstSrc);
		expect(store.getState().ttsStatus).toBe("playing");
	});

	it("caches per message: a different message still fetches its own audio", async () => {
		const store = await loadStore();
		await store.getState().playTTS("answer one", "en", "m1");
		await store.getState().playTTS("answer two", "en", "m2");

		expect(api.getTranscript).toHaveBeenCalledTimes(2);
		expect(store.getState().currentlyPlayingId).toBe("m2");
	});

	it("clearChat revokes every cached URL and empties the cache", async () => {
		const store = await loadStore();
		await store.getState().playTTS("answer one", "en", "m1");
		await store.getState().playTTS("answer two", "en", "m2");

		store.getState().clearChat();

		expect(revokeObjectURL).toHaveBeenCalledWith("blob:tts-1");
		expect(revokeObjectURL).toHaveBeenCalledWith("blob:tts-2");
		expect(store.getState().ttsStatus).toBe("stopped");
		expect(store.getState().currentlyPlayingId).toBeNull();

		store.setState({ sessionId: "session-1" });
		await store.getState().playTTS("answer one", "en", "m1");
		expect(api.getTranscript).toHaveBeenCalledTimes(3);
	});
});

describe("Listen label is constant", () => {
	it("uses the `Listen` i18n key for every status", async () => {
		const audioUtils = (await import("@/lib/audio-utils")) as unknown as AudioUtilsNext;

		expect(typeof audioUtils.getTtsLabelKey).toBe("function");
		for (const status of ["stopped", "loading", "playing"]) {
			expect(audioUtils.getTtsLabelKey?.(status)).toBe("Listen");
		}
	});

	it("has a non-empty `Listen` translation in en and hi", () => {
		expect(en.Listen).toBe("Listen");
		expect(typeof hi.Listen).toBe("string");
		expect(hi.Listen.trim()).not.toBe("");
	});
});
