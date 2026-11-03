import { describe, expect, it } from "vitest";

// Vite raw imports: node:fs is polyfilled to a stub in this config.
import routesSource from "../../routes.ts?raw";
import routeTreeSource from "../../routeTree.gen.ts?raw";

// Owner dev review §1: the app exposes ONE surface, `/chat`. `/` only redirects to `/chat`, and
// the error surfaces stay. Login, forgot-password, privacy-policy, settings and profile, plus the
// middlewares/layouts that only existed for them, are not routed at all.

const ALLOWED_PATHS = ["/", "/403", "/404", "/500", "/chat", "/error"];

const FORBIDDEN_IN_ROUTES = [
	"/login",
	"/forgot-password",
	"/privacy-policy",
	"/settings",
	"/profile",
	"restrict-login-signup",
	"authenticate",
	"require-admin"
];

/** Source without line and block comments, so commented-out routes do not count. */
function stripComments(source: string): string {
	return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** Quoted members of a `name:\n | 'a'\n | 'b'` union inside the generated route tree. */
function unionMembers(source: string, name: string): string[] {
	const match = source.match(new RegExp(`\\b${name}:\\s*((?:\\|?\\s*'[^']*'\\s*)+)`));
	if (!match?.[1]) return [];
	return [...match[1].matchAll(/'([^']*)'/g)].map((m) => m[1] ?? "");
}

/** Non-empty `path: '...'` values declared in the `FileRoutesByPath` module augmentation. */
function fileRoutesByPathPaths(source: string): string[] {
	const start = source.indexOf("interface FileRoutesByPath");
	expect(start, "routeTree.gen.ts declares FileRoutesByPath").toBeGreaterThan(-1);
	const block = source.slice(start);
	return [...block.matchAll(/\bpath:\s*'([^']*)'/g)].map((m) => m[1] ?? "").filter(Boolean);
}

const sorted = (values: string[]) => [...new Set(values)].sort();

describe("routes.ts exposes only /chat (dev review §1)", () => {
	const code = stripComments(routesSource);

	it("keeps the index route and the /chat route", () => {
		expect(code).toMatch(/\bindex\(\s*"index\.tsx"\s*\)/);
		expect(code).toContain('route("/chat"');
	});

	it.each(["/403", "/404", "/500", "/error"])("keeps the %s error surface", (path) => {
		expect(code).toContain(`route("${path}"`);
	});

	it.each(FORBIDDEN_IN_ROUTES)("does not route or wrap anything with %s", (token) => {
		expect(code).not.toContain(token);
	});
});

describe("generated route tree lists only the allowed paths (dev review §1)", () => {
	it("fullPaths union is exactly /, /chat and the error surfaces", () => {
		expect(sorted(unionMembers(routeTreeSource, "fullPaths"))).toEqual(sorted(ALLOWED_PATHS));
	});

	it("to union is exactly /, /chat and the error surfaces", () => {
		expect(sorted(unionMembers(routeTreeSource, "to"))).toEqual(sorted(ALLOWED_PATHS));
	});

	it("FileRoutesByPath declares no other non-layout path", () => {
		expect(sorted(fileRoutesByPathPaths(routeTreeSource))).toEqual(sorted(ALLOWED_PATHS));
	});

	it.each(["login", "forgot-password", "privacy-policy", "settings", "profile"])(
		"has no %s route file wired in",
		(name) => {
			expect(routeTreeSource).not.toMatch(new RegExp(`['"/]${name}['"/]`));
		}
	);
});
