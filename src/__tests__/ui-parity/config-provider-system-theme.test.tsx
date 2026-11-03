import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import config from "../../../config.json";

// P4.8.3 follow-up (doc 70 §2.2 Dark mode, default `system`): ConfigProvider injects the config
// colour variables (`--background`, … with the `dark` overrides when dark). With theme `system`
// the resolved theme also changes when the OS colour scheme flips; the variables must follow
// that flip, not only a change of the stored `theme` value.
//
// SSR does not run effects, so this suite makes `useEffect`/`useLayoutEffect` run their callback
// synchronously during render (no cleanup). Contract this pins for the implementer: while the
// theme is `system`, ConfigProvider subscribes (from an effect) to the
// `(prefers-color-scheme: dark)` MediaQueryList `change` event, and the listener itself re-applies
// the colour variables for the newly resolved theme.

vi.mock("react", async (importOriginal) => {
	const actual = await importOriginal<typeof import("react")>();
	const runNow = (fn: () => unknown) => {
		fn();
	};
	const patched = { ...actual, useEffect: runNow, useLayoutEffect: runNow };
	return { ...patched, default: patched };
});

type Listener = (event: { matches: boolean }) => void;

function fakeDom() {
	const listeners = new Set<Listener>();
	const mql = {
		matches: false,
		media: "(prefers-color-scheme: dark)",
		addEventListener: (_type: string, l: Listener) => listeners.add(l),
		removeEventListener: (_type: string, l: Listener) => listeners.delete(l),
		addListener: (l: Listener) => listeners.add(l),
		removeListener: (l: Listener) => listeners.delete(l)
	};
	const props = new Map<string, string>();
	const documentElement = {
		style: { setProperty: (name: string, value: string) => props.set(name, value) },
		classList: { add: () => {}, remove: () => {}, contains: () => false }
	};
	const document = { documentElement };
	const store = new Map<string, string>();
	const localStorage = {
		getItem: (k: string) => store.get(k) ?? null,
		setItem: (k: string, v: string) => store.set(k, v),
		removeItem: (k: string) => store.delete(k)
	};
	const window = {
		document,
		localStorage,
		matchMedia: () => mql
	};
	return {
		window,
		document,
		localStorage,
		props,
		flipOs(dark: boolean) {
			mql.matches = dark;
			for (const l of [...listeners]) l({ matches: dark });
		}
	};
}

afterEach(() => {
	vi.unstubAllGlobals();
	vi.resetModules();
});

describe("ConfigProvider with theme 'system'", () => {
	it("re-applies the colour variables when the OS colour scheme flips", async () => {
		const dom = fakeDom();
		vi.stubGlobal("window", dom.window);
		vi.stubGlobal("document", dom.document);
		vi.stubGlobal("localStorage", dom.localStorage);
		vi.resetModules();

		const { useThemeStore } = await import("@/hooks/store/theme");
		const { ConfigProvider } = await import("@/hooks/ConfigProvider");
		useThemeStore.setState({ theme: "system" });

		renderToStaticMarkup(
			<ConfigProvider>
				<span />
			</ConfigProvider>
		);
		expect(dom.props.get("--background")).toBe(config.theme.colors.background);

		dom.flipOs(true);
		expect(dom.props.get("--background")).toBe(config.theme.colors.dark.background);

		dom.flipOs(false);
		expect(dom.props.get("--background")).toBe(config.theme.colors.background);
	});
});
