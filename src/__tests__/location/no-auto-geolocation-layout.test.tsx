import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Owner decision: the app must never request browser geolocation on its own (there is no UI to
// opt in). On mount ChatLayout must not query the geolocation permission, call fetchLocation, or
// call navigator.geolocation.getCurrentPosition, whatever the permission state and whether or not a
// location is cached. It still restores a cached, non-expired `user_location` into apiService and
// triggers fetchNotifications, as today.
//
// Harness: node env has no DOM, so effects never run under SSR. `useEffect` is swapped for a
// synchronous call inside modules transformed by Vite (ChatLayout), and every child component is
// replaced by a stub so only ChatLayout's own mount effect runs.

vi.mock("react", async (importOriginal) => {
	const actual = await importOriginal<typeof import("react")>();
	const runNow = (effect: () => unknown) => {
		effect();
	};
	return { ...actual, default: { ...actual, useEffect: runNow }, useEffect: runNow };
});

const api = vi.hoisted(() => ({
	setLocationData: vi.fn(),
	getLocationData: vi.fn(() => null),
	setSessionId: vi.fn(),
	getSessionId: vi.fn(() => null),
	trackUiTelemetryEvent: vi.fn()
}));

vi.mock("@/lib/api-service", () => ({ default: api }));

vi.mock("@tanstack/react-router", () => ({ Outlet: () => null }));
vi.mock("@/components/LanguageProvider", () => ({
	useLanguage: () => ({ language: "en", t: (key: string) => key })
}));
vi.mock("@/components/screens-component/layouts/chat-header", () => ({ ChatHeader: () => null }));
vi.mock("@/components/screens-component/chat-screen/components/ticker-designs", () => ({
	TickerVariant1: () => null,
	TickerVariant5: () => null
}));
vi.mock("@/components/screens-component/chat-screen/components/chat-input", () => ({
	ChatInput: () => null
}));
vi.mock("@/components/screens-component/chat-screen/components/toast", () => ({ Toast: () => null }));
vi.mock("@/components/screens-component/chat-screen/components/settings-drawer", () => ({
	SettingsDrawer: () => null
}));
vi.mock("@/bihar/footer", () => ({ BiharFooter: () => null }));

type PermissionState = "granted" | "prompt" | "denied" | "throws";

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

function stubBrowser(permission: PermissionState, storage: Record<string, string>): void {
	getCurrentPosition = vi.fn((_ok: unknown, fail: (e: unknown) => void) =>
		fail({ code: 1, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 })
	);
	permissionsQuery = vi.fn(async () => {
		if (permission === "throws") throw new Error("permissions API unavailable");
		return { state: permission };
	});
	vi.stubGlobal("window", globalThis);
	vi.stubGlobal("navigator", {
		userAgent: "vitest",
		language: "en",
		geolocation: { getCurrentPosition, watchPosition: vi.fn(), clearWatch: vi.fn() },
		permissions: { query: permissionsQuery }
	});
	vi.stubGlobal("localStorage", memoryStorage(storage));
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const freshLocation = () =>
	JSON.stringify({ latitude: 25.6, longitude: 85.1, timestamp: Date.now() - 60_000 });
const expiredLocation = () =>
	JSON.stringify({ latitude: 25.6, longitude: 85.1, timestamp: Date.now() - 25 * 60 * 60 * 1000 });

/** Mounts ChatLayout with spies for fetchLocation / fetchNotifications in the chat store. */
async function mountLayout(permission: PermissionState, storage: Record<string, string>) {
	stubBrowser(permission, storage);
	vi.resetModules();
	const { useChatStore } = await import("@/hooks/store/chat");
	const { setSsrStore } = await import("../ui-parity/test-ssr-store");
	const fetchLocation = vi.fn(async () => undefined);
	const fetchNotifications = vi.fn(async () => undefined);
	setSsrStore(useChatStore, { fetchLocation, fetchNotifications });
	const { default: ChatLayout } = await import("@/layouts/chat-layout");

	renderToStaticMarkup(<ChatLayout />);
	await flush();
	await flush();

	return { fetchLocation, fetchNotifications };
}

beforeEach(() => {
	vi.clearAllMocks();
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.resetModules();
});

const PERMISSION_STATES: PermissionState[] = ["granted", "prompt", "denied", "throws"];

describe("ChatLayout mount never requests browser geolocation", () => {
	describe.each(PERMISSION_STATES)("permission %s", (permission) => {
		it.each([
			["no cached location", {} as Record<string, string>],
			["an expired cached location", { user_location: expiredLocation() }],
			["a fresh cached location", { user_location: freshLocation() }]
		])("with %s: no permission query, no fetchLocation, no getCurrentPosition", async (_label, storage) => {
			const { fetchLocation } = await mountLayout(permission, storage);

			expect(permissionsQuery).not.toHaveBeenCalled();
			expect(fetchLocation).not.toHaveBeenCalled();
			expect(getCurrentPosition).not.toHaveBeenCalled();
		});
	});
});

describe("ChatLayout mount still restores a cached location", () => {
	it("pushes a fresh cached user_location into apiService and fetches notifications", async () => {
		const { fetchNotifications } = await mountLayout("prompt", { user_location: freshLocation() });

		expect(api.setLocationData).toHaveBeenCalledWith({ latitude: 25.6, longitude: 85.1 });
		expect(fetchNotifications).toHaveBeenCalledTimes(1);
	});

	it("ignores an expired cached user_location", async () => {
		const { fetchNotifications } = await mountLayout("denied", {
			user_location: expiredLocation()
		});

		expect(api.setLocationData).not.toHaveBeenCalled();
		expect(fetchNotifications).not.toHaveBeenCalled();
	});

	it("does nothing with location when none is cached", async () => {
		const { fetchNotifications } = await mountLayout("denied", {});

		expect(api.setLocationData).not.toHaveBeenCalled();
		expect(fetchNotifications).not.toHaveBeenCalled();
	});
});
