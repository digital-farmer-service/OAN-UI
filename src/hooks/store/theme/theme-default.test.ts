import { afterEach, describe, expect, it, vi } from "vitest";

// P4.8.3 (doc 70 §3 "Dark mode default", §6 Q6): the old app followed the OS colour scheme
// (`system`) until the user picked a theme. A stored explicit choice in `theme-storage` wins, and
// the toggle flips the theme the user currently sees and persists that explicit choice.

const DARK_QUERY = "(prefers-color-scheme: dark)";

type BrowserOptions = { prefersDark: boolean; storedTheme?: string };

function memoryStorage(initial: Record<string, string>) {
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

function fakeClassList() {
	const classes = new Set<string>();
	return {
		add: (...names: string[]) => names.forEach((name) => classes.add(name)),
		remove: (...names: string[]) => names.forEach((name) => classes.delete(name)),
		contains: (name: string) => classes.has(name),
		toggle: (name: string, force?: boolean) => {
			const on = force ?? !classes.has(name);
			if (on) classes.add(name);
			else classes.delete(name);
			return on;
		}
	};
}

function stubBrowser({ prefersDark, storedTheme }: BrowserOptions) {
	const storage = memoryStorage(
		storedTheme
			? { "theme-storage": JSON.stringify({ state: { theme: storedTheme }, version: 0 }) }
			: {}
	);
	const root = { classList: fakeClassList() };
	const document = { documentElement: root };
	const matchMedia = vi.fn((query: string) => ({
		matches: query === DARK_QUERY ? prefersDark : false,
		media: query,
		onchange: null,
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
		addListener: vi.fn(),
		removeListener: vi.fn(),
		dispatchEvent: vi.fn()
	}));

	vi.stubGlobal("localStorage", storage);
	vi.stubGlobal("document", document);
	vi.stubGlobal("matchMedia", matchMedia);
	vi.stubGlobal("window", { document, localStorage: storage, matchMedia });

	return { storage, root, matchMedia };
}

async function loadThemeStore() {
	vi.resetModules();
	return (await import("@/hooks/store/theme")).useThemeStore;
}

function persistedTheme(storage: ReturnType<typeof memoryStorage>): unknown {
	const raw = storage.getItem("theme-storage");
	return raw ? (JSON.parse(raw) as { state?: { theme?: unknown } }).state?.theme : undefined;
}

afterEach(() => {
	vi.unstubAllGlobals();
	vi.resetModules();
});

describe("theme default follows the OS (system)", () => {
	it("defaults to `system` and applies `dark` when the OS prefers dark and nothing is stored", async () => {
		const { root, matchMedia } = stubBrowser({ prefersDark: true });

		const useThemeStore = await loadThemeStore();

		expect(useThemeStore.getState().theme).toBe("system");
		expect(matchMedia).toHaveBeenCalledWith(DARK_QUERY);
		expect(root.classList.contains("dark")).toBe(true);
	});

	it("does not apply `dark` when the OS prefers light and nothing is stored", async () => {
		const { root } = stubBrowser({ prefersDark: false });

		const useThemeStore = await loadThemeStore();

		expect(useThemeStore.getState().theme).toBe("system");
		expect(root.classList.contains("dark")).toBe(false);
	});
});

describe("a stored explicit choice wins over the OS", () => {
	it("keeps a stored `light` choice on a dark OS", async () => {
		const { root } = stubBrowser({ prefersDark: true, storedTheme: "light" });

		const useThemeStore = await loadThemeStore();

		expect(useThemeStore.getState().theme).toBe("light");
		expect(root.classList.contains("dark")).toBe(false);
	});

	it("keeps a stored `dark` choice on a light OS", async () => {
		const { root } = stubBrowser({ prefersDark: false, storedTheme: "dark" });

		const useThemeStore = await loadThemeStore();

		expect(useThemeStore.getState().theme).toBe("dark");
		expect(root.classList.contains("dark")).toBe(true);
	});
});

describe("toggleTheme flips what the user sees and persists it", () => {
	it("from system on a dark OS: goes light, then dark, persisting each explicit choice", async () => {
		const { root, storage } = stubBrowser({ prefersDark: true });
		const useThemeStore = await loadThemeStore();

		useThemeStore.getState().toggleTheme();

		expect(root.classList.contains("dark")).toBe(false);
		expect(useThemeStore.getState().theme).toBe("light");
		expect(persistedTheme(storage)).toBe("light");

		useThemeStore.getState().toggleTheme();

		expect(root.classList.contains("dark")).toBe(true);
		expect(useThemeStore.getState().theme).toBe("dark");
		expect(persistedTheme(storage)).toBe("dark");
	});

	it("from system on a light OS: goes dark and persists it", async () => {
		const { root, storage } = stubBrowser({ prefersDark: false });
		const useThemeStore = await loadThemeStore();

		useThemeStore.getState().toggleTheme();

		expect(root.classList.contains("dark")).toBe(true);
		expect(persistedTheme(storage)).toBe("dark");
	});
});
