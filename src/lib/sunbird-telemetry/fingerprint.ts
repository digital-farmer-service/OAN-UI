import FingerprintJS from "@fingerprintjs/fingerprintjs";
import { UAParser } from "ua-parser-js";

import type { FingerprintDetails } from "./types";

// fingerprint_details for Sunbird events (doc 80 §2.2). Cached in localStorage["fingerprint_context"]
// as { ready, data } exactly like the old app, so getFingerprintId() (src/lib/utils/fingerprint.ts)
// reads the same device_id and existing users keep their device id.

const STORAGE_KEY = "fingerprint_context";

function browserCode(name: string): string {
	const n = name.toLowerCase();
	if (n.includes("edge")) return "ED";
	if (n.includes("firefox")) return "FF";
	if (n.includes("safari")) return "SF";
	if (n.includes("chrome") || n.includes("chromium")) return "CH";
	return "OT";
}

function osCode(name: string): string {
	const n = name.toLowerCase();
	if (n.includes("windows")) return "WIN";
	if (n.includes("ios")) return "IOS";
	if (n.includes("mac")) return "MAC";
	if (n.includes("android")) return "AND";
	if (/linux|ubuntu|debian|fedora|centos|mint|arch|chrome os|chromium os/.test(n)) return "LNX";
	return "OT";
}

function deviceInfo(type: string | undefined): { code: string; name: string } {
	if (type === "mobile") return { code: "MB", name: "mobile" };
	if (type === "tablet") return { code: "TB", name: "tablet" };
	return { code: "DT", name: "desktop" };
}

function readCache(): FingerprintDetails | null {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as { ready?: unknown; data?: { device_id?: unknown } } | null;
		const deviceId = parsed?.data?.device_id;
		if (parsed?.ready && typeof deviceId === "string" && deviceId.trim()) {
			return parsed.data as FingerprintDetails;
		}
	} catch {
		// Corrupt cache: recompute.
	}
	return null;
}

function currentUserAgent(): string {
	if (typeof navigator !== "undefined" && navigator.userAgent) return navigator.userAgent;
	return "";
}

/** Resolves the cached or freshly computed details; null (never throws) when FingerprintJS fails. */
export async function getFingerprintDetails(
	userAgent: string = currentUserAgent()
): Promise<FingerprintDetails | null> {
	const cached = readCache();
	if (cached) return cached;

	try {
		const agent = await FingerprintJS.load();
		const { visitorId } = await agent.get();
		if (!visitorId) return null;

		const ua = new UAParser(userAgent).getResult();
		const browserName = ua.browser.name ?? "";
		const osName = ua.os.name ?? "";
		const device = deviceInfo(ua.device.type);
		const nowMs = Date.now();
		const data: FingerprintDetails = {
			device_id: visitorId,
			browser: { code: browserCode(browserName), name: browserName, version: ua.browser.version ?? "" },
			os: { code: osCode(osName), name: osName, version: ua.os.version ?? "" },
			device: { ...device, model: ua.device.model ?? "" },
			session: { session_start_at: nowMs, session_end_at: null },
			device_lifecycle: { first_seen_at: nowMs, last_seen_at: nowMs }
		};

		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify({ ready: true, data }));
		} catch {
			// Storage full or blocked: still usable for this send.
		}
		return data;
	} catch {
		return null;
	}
}
