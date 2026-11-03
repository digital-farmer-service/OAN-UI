import { ChevronDown, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/components/LanguageProvider";
import { LANGUAGES, THEMES } from "@/components/screens-component/chat-screen/config";
import { LanguageSelectionDropdown } from "@/components/screens-component/chat-screen/components/language-selection-dialog";
import { resolveTheme, useThemeStore } from "@/hooks/store/theme";
import logo from "@/assets/biharKrishiLogo.png";
const langIcon = "/assets/langIcon.svg";

export type ChatHeaderProps = {
	title: string;
	subtitle?: string;
	rightAvatarUrl?: string;
	rightLabel?: string;
	onBack?: () => void;
	onOpenProfile?: () => void;
	onClearChat?: () => void;
	/** Kept for API compatibility; the Bihar header has no settings gear. */
	onOpenSettings?: () => void;
};

// Bihar Krishi header (old Layout.tsx:70-121): logo + title text, language selector and theme
// toggle. No notifications bell, no settings gear.
export function ChatHeader(props: ChatHeaderProps) {
	const { title } = props;

	const { language } = useLanguage();
	const currentLanguage = (LANGUAGES as any)[language] || LANGUAGES.en;
	const theme = useThemeStore((s) => s.theme);
	const toggleTheme = useThemeStore((s) => s.toggleTheme);
	const isDark = resolveTheme(theme) === THEMES.dark;

	return (
		<header className="sticky top-0 z-50 w-full border-b border-border bg-background/80 backdrop-blur-md transition-colors duration-300">
			<div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-3 sm:px-4">
				{/* Left: Logo & Title */}
				<div className="flex min-w-0 items-center gap-2">
					<img src={logo} alt="" className="h-6 w-auto shrink-0 object-contain" />
					<span className="truncate text-lg font-bold text-primary">{title}</span>
				</div>

				{/* Right: Language + Theme */}
				<div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
					{/* Language Dropdown */}
					<LanguageSelectionDropdown>
						{/* Desktop Language Button */}
						<Button
							variant="outline"
							className="hidden h-9 w-auto gap-2 rounded-full border hover:border-[var(--primary)] px-3 font-normal text-foreground sm:flex cursor-pointer hover:bg-accent/50"
						>
							<img src={langIcon} alt="Language" className="h-5 w-5" />
							<span className="font-medium text-xs">{currentLanguage.name}</span>
							<ChevronDown className="ml-1 h-4 w-4 opacity-50" />
						</Button>
					</LanguageSelectionDropdown>

					{/* Mobile Language Button */}
					<LanguageSelectionDropdown>
						<Button
							variant="ghost"
							size="icon"
							className="h-9 w-9 sm:hidden cursor-pointer"
						>
							<img src={langIcon} alt="Language" className="h-6 w-6" />
						</Button>
					</LanguageSelectionDropdown>

					<Button
						data-testid="theme-toggle"
						variant="ghost"
						size="icon"
						className="h-9 w-9 rounded-full text-foreground cursor-pointer hover:bg-accent/50"
						aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
						onClick={toggleTheme}
					>
						{isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
					</Button>
				</div>
			</div>
		</header>
	);
}
