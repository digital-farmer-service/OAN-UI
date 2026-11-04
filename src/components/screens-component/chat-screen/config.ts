import rootConfigData from "../../../../config.json";
const rootConfig = rootConfigData as any;

// ============================================================================
// LANGUAGE CONFIGURATION
// ============================================================================

export type LanguageCode = "hi" | "en" | "bn" | "te" | "mr" | "ta" | "gu" | "kn" | "ml" | "as" | "mai";

export type Language = {
	code: LanguageCode;
	name: string;
	nativeName: string;
	icon: string;
};

export const LANGUAGES: Record<LanguageCode, Language> = rootConfig.languages.reduce((acc: any, lang: any) => {
	acc[lang.code as LanguageCode] = lang as Language;
	return acc;
}, {} as Record<LanguageCode, Language>);

export const DEFAULT_LANGUAGE: LanguageCode = rootConfig.defaultLanguage as LanguageCode || "hi";

// ============================================================================
// CHAT CONFIGURATION
// ============================================================================
// CHAT CONFIGURATION
// ============================================================================

export const CHAT_ASSISTANT = {
	name: "Bharati",
	avatar: rootConfig.icons.assistant
};

export const APP_LOGO = rootConfig.icons.appLogo || rootConfig.icons.assistant;

export const CHAT_USER = {
	name: "",
	avatar: rootConfig.icons.user
};


// Helper function to get text for current language
// Deprecated: use useLanguage().t instead.
export const getLanguageText = (languageCode: LanguageCode): any => {
	return (rootConfig.languageTexts as any)[languageCode];
};

export type FAQItem = {
	id: string;
	question: string;
	answer: string;
	image?: string;
};

export const FAQ_DATA: FAQItem[] = [
	{
		id: "1",
		question: "How can I get subsidy for farm machinery?",
		answer: "Farmers can apply for machinery subsidy through the MahaDBT portal. Subsidy amount depends on machine type, farmer category, and scheme availability.",
		image: `${import.meta.env.BASE_URL}faq-machinery.png`
	},
	{
		id: "2",
		question: "Why is my crop not growing properly?",
		answer: "Proper crop growth depends on soil health, water quality, and appropriate fertilizer usage. We recommend testing your soil at the nearest government lab.",
	}
];

export const THEMES = {
	light: "light",
	dark: "dark",
	system: "system"
} as const;

export type Theme = keyof typeof THEMES;

// ============================================================================
// ICON CONFIGURATION
// ============================================================================

export const ICONS = {
	language: "अ",
	settings: "Settings",
	bell: "Bell",
	user: "User",
	chevronDown: "ChevronDown",
	microphone: "Mic",
	send: "Send",
	play: "Play",
	pause: "Pause",
	copy: "Copy",
	thumbsUp: "ThumbsUp",
	thumbsDown: "ThumbsDown"
} as const;

// ============================================================================
// FONT CONFIGURATION
// ============================================================================

export const FONTS = {
	primary: "system-ui, -apple-system, sans-serif",
	heading: "system-ui, -apple-system, sans-serif",
	mono: "monospace",
	sizes: {
		xs: "0.75rem",
		sm: "0.875rem",
		base: "1rem",
		lg: "1.125rem",
		xl: "1.25rem",
		"2xl": "1.5rem",
		"3xl": "1.875rem"
	}
} as const;

// ============================================================================
// COLOR CONFIGURATION
// ============================================================================

export const COLORS = {
	primary: {
		main: "#06038D",
		light: "#818CF8",
		dark: "#312E81",
		contrast: "#ffffff"
	},
	secondary: {
		main: "#f3f4f6",
		light: "#ffffff",
		dark: "#e5e7eb",
		contrast: "#000000"
	},
	accent: {
		blue: "#3b82f6",
		lightBlue: "#E0E7FF",
		white: "#ffffff",
		gray: "#6b7280",
		lightGray: "#f9fafb"
	},
	status: {
		success: "#22c55e",
		error: "#ef4444",
		warning: "#f59e0b",
		info: "#3b82f6"
	}
} as const;

