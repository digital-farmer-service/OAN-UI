import type { Performance } from "./types";

// Per-question performance marks (doc 80 §2.5). Replaces the old PerformanceObserver:
// server_response_time_ms = round(responseEnd - firstByte) (stream duration),
// browser_render_time_ms = round(painted - responseEnd).

interface Marks {
	requestStart?: number;
	firstByte?: number;
	responseEnd?: number;
	painted?: number;
}

const MAX_TRACKED = 200;
const timers = new Map<string, Marks>();

function now(): number {
	return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function mark(qid: string, key: keyof Marks, t: number, keepFirst = false): void {
	const marks = timers.get(qid) ?? {};
	if (keepFirst && marks[key] !== undefined) return;
	marks[key] = t;
	timers.set(qid, marks);
	if (timers.size > MAX_TRACKED) {
		const oldest = timers.keys().next().value;
		if (oldest !== undefined) timers.delete(oldest);
	}
}

export function markRequestStart(qid: string, t: number = now()): void {
	mark(qid, "requestStart", t);
}

/** First stream chunk. Later chunks for the same qid keep the first mark. */
export function markFirstByte(qid: string, t: number = now()): void {
	mark(qid, "firstByte", t, true);
}

export function markResponseEnd(qid: string, t: number = now()): void {
	mark(qid, "responseEnd", t);
}

export function markPainted(qid: string, t: number = now()): void {
	mark(qid, "painted", t);
}

function diff(from: number | undefined, to: number | undefined): number | null {
	return from === undefined || to === undefined ? null : Math.round(to - from);
}

export function getPerformance(qid: string): Performance {
	const marks = timers.get(qid) ?? {};
	return {
		server_response_time_ms: diff(marks.firstByte, marks.responseEnd),
		browser_render_time_ms: diff(marks.responseEnd, marks.painted)
	};
}

export function clearTimers(qid: string): void {
	timers.delete(qid);
}
