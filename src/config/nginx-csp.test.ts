import { describe, expect, it } from "vitest";

// Vite raw import: node:fs is polyfilled to a stub by vite-plugin-node-polyfills in this config.
import nginxConf from "../../nginx.conf?raw";

// Doc 80 §8.2: Google Analytics loads gtag.js from https://www.googletagmanager.com, so the
// container policy gains exactly that one host in `script-src`. Nothing inline (no
// 'unsafe-inline', no script nonce): the gtag bootstrap is bundled code covered by 'self'.
// Every other directive stays byte-identical, so the change is one token.

const GTM_HOST = "https://www.googletagmanager.com";

function cspHeaders(conf: string): string[] {
	return [...conf.matchAll(/add_header\s+Content-Security-Policy\s+"([^"]*)"/g)].map(
		(m) => m[1] ?? ""
	);
}

function parsePolicy(policy: string): Map<string, string[]> {
	const directives = new Map<string, string[]>();
	for (const raw of policy.split(";")) {
		const tokens = raw.trim().split(/\s+/).filter(Boolean);
		const [name, ...values] = tokens;
		if (name) directives.set(name.toLowerCase(), values);
	}
	return directives;
}

function policy(): Map<string, string[]> {
	const [header] = cspHeaders(nginxConf);
	return parsePolicy(header ?? "");
}

describe("nginx.conf Content-Security-Policy", () => {
	it("sends exactly one CSP header", () => {
		expect(cspHeaders(nginxConf)).toHaveLength(1);
	});

	it("script-src is exactly 'self' plus the Google Tag Manager host", () => {
		expect(policy().get("script-src")).toEqual(["'self'", GTM_HOST]);
	});

	it("script-src has no unsafe, wildcard, data: or bare-scheme sources", () => {
		const scriptSrc = policy().get("script-src") ?? [];

		for (const forbidden of [
			"'unsafe-inline'",
			"'unsafe-eval'",
			"'strict-dynamic'",
			"*",
			"data:",
			"https:",
			"http:",
			"blob:"
		]) {
			expect(scriptSrc).not.toContain(forbidden);
		}
		expect(scriptSrc.some((s) => s.startsWith("'nonce-") || s.startsWith("'sha"))).toBe(false);
	});

	it("no directive allows 'unsafe-inline' or 'unsafe-eval'", () => {
		for (const [name, values] of policy()) {
			expect(values, name).not.toContain("'unsafe-inline'");
			expect(values, name).not.toContain("'unsafe-eval'");
		}
	});

	it("GA beacons and pixels are already covered: connect-src and img-src allow https:", () => {
		expect(policy().get("connect-src")).toContain("https:");
		expect(policy().get("img-src")).toContain("https:");
	});

	it("keeps every other directive unchanged (style nonce + Sonner hash, frame-ancestors 'self')", () => {
		const others = Object.fromEntries([...policy()].filter(([name]) => name !== "script-src"));

		expect(others).toEqual({
			"default-src": ["'self'"],
			"style-src": [
				"'self'",
				"'nonce-$request_id'",
				"'sha256-CIxDM5jnsGiKqXs2v7NKCY5MzdR9gu6TtiMJrDw29AY='"
			],
			"font-src": ["'self'", "data:"],
			"img-src": ["'self'", "data:", "blob:", "https:"],
			"connect-src": ["'self'", "https:", "wss:"],
			"media-src": ["'self'", "data:", "blob:", "https:"],
			"object-src": ["'none'"],
			"base-uri": ["'self'"],
			"frame-ancestors": ["'self'"]
		});
	});
});
