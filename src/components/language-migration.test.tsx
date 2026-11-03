import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_LANGUAGE } from "@/components/screens-component/chat-screen/config";

// P4.8.11 (doc 70 §3 "Language switch"): the old app stored the language under
// `localStorage.language`; the new one reads `app_language`. At LanguageProvider startup a legacy
// value is migrated once into `app_language` (only when `app_language` is unset and the code is an
// enabled language), and the legacy key is then dropped so it is never re-applied.
// Rendered with renderToStaticMarkup (no DOM): the lazy state initialiser runs on the server render.

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

async function renderStartupLanguage(initial: Record<string, string>) {
	const storage = memoryStorage(initial);
	vi.stubGlobal("localStorage", storage);
	vi.resetModules();
	const { LanguageProvider, useLanguage } = await import("@/components/LanguageProvider");

	function Probe() {
		const { language } = useLanguage();
		return <span data-lang={language} />;
	}

	const html = renderToStaticMarkup(
		<LanguageProvider>
			<Probe />
		</LanguageProvider>
	);
	const language = /data-lang="([^"]*)"/.exec(html)?.[1];
	return { language, storage };
}

afterEach(() => {
	vi.unstubAllGlobals();
	vi.resetModules();
});

describe("legacy `language` key migration", () => {
	it("migrates a legacy `hi` into app_language when app_language is unset", async () => {
		const { language, storage } = await renderStartupLanguage({ language: "hi" });

		expect(language).toBe("hi");
		expect(storage.getItem("app_language")).toBe("hi");
	});

	it("drops the legacy key after migrating so it is not re-applied", async () => {
		const first = await renderStartupLanguage({ language: "hi" });
		expect(first.storage.getItem("language")).toBeNull();

		// The user later switches to English; the next startup must not bring Hindi back.
		const second = await renderStartupLanguage({ app_language: "en", language: "hi" });
		expect(second.language).toBe("en");
		expect(second.storage.getItem("app_language")).toBe("en");
	});

	it("keeps an existing app_language over a legacy value", async () => {
		const { language, storage } = await renderStartupLanguage({
			app_language: "en",
			language: "hi"
		});

		expect(language).toBe("en");
		expect(storage.getItem("app_language")).toBe("en");
	});

	it("ignores an unsupported legacy code", async () => {
		const { language, storage } = await renderStartupLanguage({ language: "mr" });

		expect(language).toBe(DEFAULT_LANGUAGE);
		expect(storage.getItem("app_language")).not.toBe("mr");
	});

	it("ignores a garbage legacy value", async () => {
		const { language, storage } = await renderStartupLanguage({ language: "<script>" });

		expect(language).toBe(DEFAULT_LANGUAGE);
		expect(storage.getItem("app_language")).not.toBe("<script>");
	});
});
