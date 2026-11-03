import { describe, expect, it } from "vitest";

import rootConfig from "../../../config.json";
import en from "../../../translations/en.json";
import hi from "../../../translations/hi.json";
import { DEFAULT_LANGUAGE, LANGUAGES } from "@/components/screens-component/chat-screen/config";

// Owner decision: the app supports ONLY Hindi (`hi`) and English (`en`). Every other language
// (bn, te, ta, gu, kn, ml, as; mr and mai were removed earlier) is no longer offered anywhere.

const ENABLED = ["hi", "en"];
const REMOVED = ["bn", "te", "ta", "gu", "kn", "ml", "as", "mr", "mai"];

type ConfigLanguage = { code: string; name?: string; nativeName?: string };

const configLanguages = (rootConfig as { languages: ConfigLanguage[] }).languages;

describe("config.json enables only hi and en", () => {
	it("lists exactly two languages", () => {
		expect(configLanguages).toHaveLength(2);
	});

	it("lists exactly the codes hi and en", () => {
		expect(new Set(configLanguages.map((l) => l.code))).toEqual(new Set(ENABLED));
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
	it("LANGUAGES is keyed by exactly hi and en", () => {
		const keys = Object.keys(LANGUAGES);
		expect(keys).toHaveLength(2);
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

describe("translation key parity between the two enabled languages", () => {
	const hiKeys = Object.keys(hi as Record<string, unknown>);
	const enKeys = Object.keys(en as Record<string, unknown>);

	it("hi.json has every top-level key en.json has", () => {
		expect(enKeys.filter((k) => !hiKeys.includes(k))).toEqual([]);
	});

	it("en.json has every top-level key hi.json has", () => {
		expect(hiKeys.filter((k) => !enKeys.includes(k))).toEqual([]);
	});
});
