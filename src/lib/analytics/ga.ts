// Google Analytics (GA4, gtag.js), kept from the old app (doc 80 §8).
// The old inline bootstrap is bundled here because the CSP forbids inline scripts; the only
// external script is gtag.js from https://www.googletagmanager.com (nginx.conf script-src).
// Page views carry the pathname only: query strings and hashes (token, integrity_token,
// username) never reach Google.

import { environment } from "../config/environment";

const GTAG_SCRIPT_URL = "https://www.googletagmanager.com/gtag/js?id=";

type Gtag = (...args: unknown[]) => void;

declare global {
	interface Window {
		dataLayer?: unknown[];
		gtag?: Gtag;
	}
}

let initialized = false;

function measurementId(): string {
	return environment.gaEnabled ? environment.gaMeasurementId : "";
}

function hasDom(): boolean {
	return typeof window !== "undefined" && typeof document !== "undefined";
}

/** Defines window.dataLayer / window.gtag, queues js + config and loads gtag.js once. */
export function initAnalytics(): void {
	if (initialized || !hasDom()) return;
	const id = measurementId();
	if (!id) return;

	try {
		const dataLayer = (window.dataLayer = window.dataLayer ?? []);
		// gtag.js reads the `arguments` object itself from the queue, not an array copy.
		window.gtag = function gtag() {
			// eslint-disable-next-line prefer-rest-params
			dataLayer.push(arguments);
		};
		window.gtag("js", new Date());
		window.gtag("config", id, { send_page_view: false });

		const src = `${GTAG_SCRIPT_URL}${id}`;
		if (!document.querySelector(`script[src="${src}"]`)) {
			const script = document.createElement("script");
			script.async = true;
			script.src = src;
			document.head.appendChild(script);
		}
		initialized = true;
	} catch {
		// Analytics must never break the app.
	}
}

function send(...args: unknown[]): void {
	if (!initialized || !hasDom() || typeof window.gtag !== "function") return;
	try {
		window.gtag(...args);
	} catch {
		// Analytics must never break the app.
	}
}

/** Strips any ?query or #hash, so only the path is reported. */
function pathOnly(pathname: string): string {
	const path = pathname.split(/[?#]/, 1)[0] ?? "";
	return path.startsWith("/") ? path : `/${path}`;
}

/** Explicit GA4 page view (config uses send_page_view:false). Dropped before init or when disabled. */
export function trackPageView(pathname: string, title?: string): void {
	if (!initialized || !hasDom()) return;
	const path = pathOnly(pathname);
	send("event", "page_view", {
		page_path: path,
		page_location: `${window.location.origin}${path}`,
		page_title: title ?? document.title
	});
}

export function trackEvent(name: string, params?: Record<string, unknown>): void {
	if (params === undefined) send("event", name);
	else send("event", name, params);
}

export function trackLanguageChange(language: string): void {
	send("event", "language_change", { language });
}
