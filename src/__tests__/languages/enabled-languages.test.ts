import { describe, expect, it } from "vitest";

import rootConfig from "../../../config.json";
import en from "../../../translations/en.json";
import hi from "../../../translations/hi.json";
import mai from "../../../translations/mai.json";
import { DEFAULT_LANGUAGE, LANGUAGES } from "@/components/screens-component/chat-screen/config";

// Owner decision: the app supports Hindi (`hi`), English (`en`) and Maithili (`mai`). Every other
// language (bn, te, ta, gu, kn, ml, as, mr) is no longer offered anywhere.

const ENABLED = ["hi", "en", "mai"];
const REMOVED = ["bn", "te", "ta", "gu", "kn", "ml", "as", "mr"];

type ConfigLanguage = { code: string; name?: string; nativeName?: string };

const configLanguages = (rootConfig as { languages: ConfigLanguage[] }).languages;

describe("config.json enables only hi, en and mai", () => {
	it("lists exactly three languages", () => {
		expect(configLanguages).toHaveLength(3);
	});

	it("lists exactly the codes hi, en and mai, in that order", () => {
		expect(configLanguages.map((l) => l.code)).toEqual(ENABLED);
	});

	it("names Maithili मैथिली (name and nativeName)", () => {
		const maiEntry = configLanguages.find((l) => l.code === "mai");
		expect(maiEntry?.name).toBe("मैथिली");
		expect(maiEntry?.nativeName).toBe("मैथिली");
	});

	it("lists none of the removed languages", () => {
		const codes = configLanguages.map((l) => l.code);
		expect(codes.filter((c) => REMOVED.includes(c))).toEqual([]);
	});

	it("gives every listed language a non-empty name and nativeName", () => {
		for (const lang of configLanguages) {
			expect(typeof lang.name === "string" && lang.name.trim().length > 0, `${lang.code}.name`).toBe(true);
			expect(
				typeof lang.nativeName === "string" && lang.nativeName.trim().length > 0,
				`${lang.code}.nativeName`
			).toBe(true);
		}
	});

	it("keeps defaultLanguage as en", () => {
		expect((rootConfig as { defaultLanguage: string }).defaultLanguage).toBe("en");
	});
});

describe("runtime LANGUAGES / DEFAULT_LANGUAGE (chat-screen/config.ts)", () => {
	it("LANGUAGES is keyed by exactly hi, en and mai", () => {
		const keys = Object.keys(LANGUAGES);
		expect(keys).toHaveLength(3);
		expect(new Set(keys)).toEqual(new Set(ENABLED));
	});

	it("each LANGUAGES entry carries its own code", () => {
		for (const [key, lang] of Object.entries(LANGUAGES)) {
			expect(lang.code).toBe(key);
		}
	});

	it("DEFAULT_LANGUAGE is en", () => {
		expect(DEFAULT_LANGUAGE).toBe("en");
	});
});

describe("translation key parity between hi and en", () => {
	const hiKeys = Object.keys(hi as Record<string, unknown>);
	const enKeys = Object.keys(en as Record<string, unknown>);

	it("hi.json has every top-level key en.json has", () => {
		expect(enKeys.filter((k) => !hiKeys.includes(k))).toEqual([]);
	});

	it("en.json has every top-level key hi.json has", () => {
		expect(hiKeys.filter((k) => !enKeys.includes(k))).toEqual([]);
	});
});

// Nested dot-paths, e.g. "toast.copyFailed". mai may carry extra keys; only en ⊆ mai is required.
function keyPaths(obj: Record<string, unknown>, prefix = ""): string[] {
	return Object.entries(obj).flatMap(([key, value]) => {
		const path = prefix + key;
		return value !== null && typeof value === "object" && !Array.isArray(value)
			? [path, ...keyPaths(value as Record<string, unknown>, `${path}.`)]
			: [path];
	});
}

describe("translation key parity: mai covers en", () => {
	it("mai.json has every top-level and nested key en.json has", () => {
		const maiPaths = new Set(keyPaths(mai as Record<string, unknown>));
		expect(keyPaths(en as Record<string, unknown>).filter((k) => !maiPaths.has(k))).toEqual([]);
	});
});
