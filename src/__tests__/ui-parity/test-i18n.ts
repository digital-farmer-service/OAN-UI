import en from "../../../translations/en.json";
import hi from "../../../translations/hi.json";
import mai from "../../../translations/mai.json";

// Minimal stand-in for `useLanguage().t` in render tests: resolves direct keys first, then
// dotted paths, against the real translation files. Unknown keys come back unchanged (as the
// real provider does), so a missing key is visible in the rendered markup.

export type TestLanguage = "en" | "hi";
/** Languages the lookup helpers can read (adds Maithili for tests that need it). */
export type I18nLanguage = TestLanguage | "mai";

const DICTS: Record<I18nLanguage, Record<string, unknown>> = { en, hi, mai };

function lookup(dict: Record<string, unknown>, key: string): unknown {
	if (key in dict) return dict[key];
	let current: unknown = dict;
	for (const part of key.split(".")) {
		if (current && typeof current === "object" && part in (current as object)) {
			current = (current as Record<string, unknown>)[part];
		} else {
			return undefined;
		}
	}
	return current;
}

export function makeT(language: I18nLanguage) {
	return (key: string): string | string[] => {
		const value = lookup(DICTS[language], key);
		return typeof value === "string" || Array.isArray(value) ? (value as string | string[]) : key;
	};
}

export function translationValue(language: I18nLanguage, key: string): unknown {
	return lookup(DICTS[language], key);
}

/** Visible text of SSR markup: tags (and their attributes) replaced by spaces. */
export function visibleText(html: string): string {
	return html
		.replace(/<[^>]*>/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}
