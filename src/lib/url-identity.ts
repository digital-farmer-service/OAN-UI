// Boot-time capture of the identity params the Bihar Krishi host app appends to the URL.
// `integrity_token` is read once and stripped from the address bar; `username` is read and kept.

type LocationLike = { search: string; pathname: string; hash?: string };
type HistoryLike = { replaceState: (data: unknown, unused: string, url?: string | null) => void };

const INTEGRITY_TOKEN_PARAM = "integrity_token";
const USERNAME_PARAM = "username";

let captured = false;
let integrityToken = "";
let username: string | undefined;

function decodeOnce(raw: string): string {
	try {
		return decodeURIComponent(raw);
	} catch {
		return raw;
	}
}

function splitParams(search: string): string[] {
	const query = search.startsWith("?") ? search.slice(1) : search;
	return query.split("&").filter((part) => part !== "");
}

function paramKey(part: string): string {
	const eq = part.indexOf("=");
	return eq === -1 ? part : part.slice(0, eq);
}

function paramValue(part: string): string {
	const eq = part.indexOf("=");
	return eq === -1 ? "" : part.slice(eq + 1);
}

export function captureUrlIdentity(loc?: LocationLike, history?: HistoryLike): void {
	if (captured) return;
	captured = true;

	const hasWindow = typeof window !== "undefined";
	const location = loc ?? (hasWindow ? window.location : undefined);
	const hist = history ?? (hasWindow ? window.history : undefined);
	if (!location) return;

	const parts = splitParams(location.search ?? "");
	const tokenPart = parts.find((part) => paramKey(part) === INTEGRITY_TOKEN_PARAM);
	const usernamePart = parts.find((part) => paramKey(part) === USERNAME_PARAM);

	if (tokenPart !== undefined) integrityToken = decodeOnce(paramValue(tokenPart));
	if (usernamePart !== undefined) username = decodeOnce(paramValue(usernamePart));

	if (tokenPart !== undefined && hist) {
		const remaining = parts.filter((part) => paramKey(part) !== INTEGRITY_TOKEN_PARAM);
		const search = remaining.length > 0 ? `?${remaining.join("&")}` : "";
		hist.replaceState(null, "", `${location.pathname}${search}${location.hash ?? ""}`);
	}
}

export function getIntegrityToken(): string {
	return integrityToken;
}

export function getUsername(): string | undefined {
	return username;
}

export function resetUrlIdentityForTests(): void {
	captured = false;
	integrityToken = "";
	username = undefined;
}
