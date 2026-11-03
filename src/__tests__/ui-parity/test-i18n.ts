import en from "../../../translations/en.json";
import hi from "../../../translations/hi.json";

// Minimal stand-in for `useLanguage().t` in render tests: resolves direct keys first, then
// dotted paths, against the real translation files. Unknown keys come back unchanged (as the
// real provider does), so a missing key is visible in the rendered markup.

export type TestLanguage = "en" | "hi";

const DICTS: Record<TestLanguage, Record<string, unknown>> = { en, hi };

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

export function makeT(language: TestLanguage) {
	return (key: string): string | string[] => {
		const value = lookup(DICTS[language], key);
		return typeof value === "string" || Array.isArray(value) ? (value as string | string[]) : key;
	};
}

export function translationValue(language: TestLanguage, key: string): unknown {
	return lookup(DICTS[language], key);
}

/** Visible text of SSR markup: tags (and their attributes) replaced by spaces. */
export function visibleText(html: string): string {
	return html
		.replace(/<[^>]*>/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}
