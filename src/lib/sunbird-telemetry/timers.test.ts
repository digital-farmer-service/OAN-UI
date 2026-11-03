import { afterEach, describe, expect, it, vi } from "vitest";

// Per-question performance marks (doc 80 §2.5, §6.1). Replaces the old PerformanceObserver:
// server_response_time_ms = round(responseEnd - firstByte), browser_render_time_ms = round(paint - responseEnd).

type Perf = { server_response_time_ms: number | null; browser_render_time_ms: number | null };

interface TimersModule {
	markRequestStart: (qid: string, t?: number) => void;
	markFirstByte: (qid: string, t?: number) => void;
	markResponseEnd: (qid: string, t?: number) => void;
	markPainted: (qid: string, t?: number) => void;
	getPerformance: (qid: string) => Perf;
	clearTimers: (qid: string) => void;
}

const TIMERS_MODULE = "./timers";
const EMPTY: Perf = { server_response_time_ms: null, browser_render_time_ms: null };

async function loadTimers(): Promise<TimersModule> {
	vi.resetModules();
	return (await import(/* @vite-ignore */ TIMERS_MODULE)) as TimersModule;
}

afterEach(() => {
	vi.restoreAllMocks();
	vi.resetModules();
});

describe("sunbird telemetry timers", () => {
	it("performance uses old definitions", async () => {
		const t = await loadTimers();

		t.markRequestStart("q1", 10);
		t.markFirstByte("q1", 100.2);
		t.markResponseEnd("q1", 350.9);
		t.markPainted("q1", 400.1);

		expect(t.getPerformance("q1")).toStrictEqual({
			server_response_time_ms: 251,
			browser_render_time_ms: 49
		});
	});

	it("null when a mark is missing", async () => {
		const t = await loadTimers();

		t.markRequestStart("q2", 0);
		t.markResponseEnd("q2", 300);
		expect(t.getPerformance("q2")).toStrictEqual(EMPTY);

		t.markPainted("q2", 320);
		expect(t.getPerformance("q2")).toStrictEqual({
			server_response_time_ms: null,
			browser_render_time_ms: 20
		});

		t.markFirstByte("q3", 50);
		t.markPainted("q3", 90);
		expect(t.getPerformance("q3")).toStrictEqual(EMPTY);
	});

	it("unknown qid gives nulls", async () => {
		const t = await loadTimers();

		expect(t.getPerformance("never-seen")).toStrictEqual(EMPTY);
	});

	it("keeps qids apart", async () => {
		const t = await loadTimers();

		t.markFirstByte("a", 0);
		t.markResponseEnd("a", 100);
		t.markFirstByte("b", 0);
		t.markResponseEnd("b", 300);

		expect(t.getPerformance("a").server_response_time_ms).toBe(100);
		expect(t.getPerformance("b").server_response_time_ms).toBe(300);
	});

	it("clearTimers resets", async () => {
		const t = await loadTimers();

		t.markFirstByte("q4", 0);
		t.markResponseEnd("q4", 100);
		t.markPainted("q4", 110);
		t.clearTimers("q4");

		expect(t.getPerformance("q4")).toStrictEqual(EMPTY);
	});

	it("defaults the timestamp to performance.now()", async () => {
		const now = vi.spyOn(performance, "now");
		const t = await loadTimers();

		now.mockReturnValueOnce(1000).mockReturnValueOnce(1250).mockReturnValueOnce(1260);
		t.markFirstByte("q5");
		t.markResponseEnd("q5");
		t.markPainted("q5");

		expect(t.getPerformance("q5")).toStrictEqual({
			server_response_time_ms: 250,
			browser_render_time_ms: 10
		});
	});
});
