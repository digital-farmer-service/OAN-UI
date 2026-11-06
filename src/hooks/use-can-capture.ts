import { useEffect, useState } from "react";

const COARSE_POINTER_QUERY = "(pointer: coarse)";

/**
 * True only on a touch device whose primary pointer is coarse (phone, tablet, Android WebView).
 * Viewport width is deliberately ignored: on desktop the chat runs in a narrow iframe, where a
 * width check would wrongly offer a camera that only opens a file picker.
 */
function detectCanCapture(): boolean {
	if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
	const touchPoints = window.navigator?.maxTouchPoints ?? 0;
	if (touchPoints <= 0) return false;
	try {
		return window.matchMedia(COARSE_POINTER_QUERY).matches;
	} catch {
		return false;
	}
}

export function useCanCapture(): boolean {
	// Lazy initial state so the value is right on the first render (no Camera button pop-in).
	const [canCapture, setCanCapture] = useState<boolean>(detectCanCapture);

	useEffect(() => {
		if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
		const mql = window.matchMedia(COARSE_POINTER_QUERY);
		const onChange = () => setCanCapture(detectCanCapture());
		mql.addEventListener?.("change", onChange);
		return () => mql.removeEventListener?.("change", onChange);
	}, []);

	return canCapture;
}
