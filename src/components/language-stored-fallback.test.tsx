import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

// Owner decision: only `hi` and `en` are supported. A browser that stored another code in
// `app_language` (e.g. `bn` picked before the cut) must not keep that language: at startup
// LanguageProvider falls back to the default (`en`). Supported stored values are kept.
// Same harness as language-migration.test.tsx: in-memory localStorage, fresh module, SSR render
// (the lazy state initialiser runs on the server render).

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
	return /data-lang="([^"]*)"/.exec(html)?.[1];
}

afterEach(() => {
	vi.unstubAllGlobals();
	vi.resetModules();
});

describe("stored app_language is applied only when supported", () => {
	it.each(["hi", "en"])("keeps a stored supported language %s", async (code) => {
		expect(await renderStartupLanguage({ app_language: code })).toBe(code);
	});

	it("uses en when nothing is stored", async () => {
		expect(await renderStartupLanguage({})).toBe("en");
	});

	it.each(["bn", "te", "ta", "gu", "kn", "ml", "as", "mr", "mai"])(
		"falls back to en for a stored removed language %s",
		async (code) => {
			expect(await renderStartupLanguage({ app_language: code })).toBe("en");
		}
	);

	it("falls back to en for a garbage stored value", async () => {
		expect(await renderStartupLanguage({ app_language: "<script>" })).toBe("en");
	});

	it("never applies a stored removed language even when a legacy key is present", async () => {
		// Stored `bn` is unsupported; whatever the migration does with the legacy `hi`, the
		// provider must not start in `bn`.
		expect(await renderStartupLanguage({ app_language: "bn", language: "hi" })).not.toBe("bn");
	});
});
