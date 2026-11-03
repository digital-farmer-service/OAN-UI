import { create } from "zustand";
import { persist } from "zustand/middleware";
import { Theme, THEMES } from "@/components/screens-component/chat-screen/config";

type ResolvedTheme = Exclude<Theme, typeof THEMES.system>;

interface ThemeStore {
	theme: Theme;
	setTheme: (theme: Theme) => void;
	toggleTheme: () => void;
}

const DARK_QUERY = "(prefers-color-scheme: dark)";

function getDarkQuery(): MediaQueryList | null {
	if (typeof window === "undefined" || typeof window.matchMedia !== "function") return null;
	return window.matchMedia(DARK_QUERY);
}

/** The theme the user actually sees: `system` follows the OS colour scheme. */
export function resolveTheme(theme: Theme): ResolvedTheme {
	if (theme !== THEMES.system) return theme;
	return getDarkQuery()?.matches ? THEMES.dark : THEMES.light;
}

export const useThemeStore = create<ThemeStore>()(
	persist(
		(set) => ({
			theme: THEMES.system,
			setTheme: (theme) => {
				set({ theme });
				applyTheme(theme);
			},
			toggleTheme: () => {
				set((state) => {
					const newTheme = resolveTheme(state.theme) === THEMES.dark ? THEMES.light : THEMES.dark;
					applyTheme(newTheme);
					return { theme: newTheme };
				});
			}
		}),
		{
			name: "theme-storage"
		}
	)
);

function applyTheme(theme: Theme) {
	const root = window.document.documentElement;
	root.classList.remove(THEMES.light, THEMES.dark);
	root.classList.add(resolveTheme(theme));
}

// Initial theme application: a stored explicit choice wins, otherwise follow the OS.
if (typeof window !== "undefined") {
	let initialTheme: Theme = THEMES.system;
	const storedTheme = localStorage.getItem("theme-storage");
	if (storedTheme) {
		try {
			const parsed = JSON.parse(storedTheme);
			if (parsed.state && parsed.state.theme) {
				initialTheme = parsed.state.theme;
			}
		} catch (e) {
			console.error("Failed to parse theme from storage", e);
		}
	}
	applyTheme(initialTheme);

	// Re-apply on a live OS colour-scheme change while the user has not picked a theme.
	getDarkQuery()?.addEventListener?.("change", () => {
		if (useThemeStore.getState().theme === THEMES.system) applyTheme(THEMES.system);
	});
}
