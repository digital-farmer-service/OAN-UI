export const env = {
	apiBaseUrl: import.meta.env.VITE_API_BASE_URL as string,
	apiKey: import.meta.env.VITE_API_KEY as string,
	mode: import.meta.env.MODE as string,
	// Ticker Feature UI Variant
	// Controls which announcement banner design is shown on the chatbot homepage.
	// Values: 0 = Off (Bihar Krishi: no ticker)
	//         1 = Scrolling Strip (below header)
	//         2 = Pinned Banner Card (prev/next arrows)
	//         3 = Story-ring Bubbles (tap to expand)
	//         4 = Auto-rotating Carousel
	//         5 = Branded Top Announcement Hero (above header)
	// After changing this value, RESTART the dev server (Ctrl+C then npm run dev).
	uiTicker: 0,
};

// if (!env.apiBaseUrl) throw new Error("Missing VITE_API_BASE_URL");
// if (!env.apiKey) throw new Error("Missing VITE_API_KEY");
