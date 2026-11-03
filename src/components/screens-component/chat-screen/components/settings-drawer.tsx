import { useState } from "react";
import { ChevronDown, ChevronUp, Moon, Sun, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/components/LanguageProvider";
import { useThemeStore } from "@/hooks/store/theme";
import { THEMES, FAQ_DATA } from "@/components/screens-component/chat-screen/config";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Sheet, SheetContent } from "@/components/ui/sheet";

interface SettingsDrawerProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function SettingsDrawer({ open, onOpenChange }: SettingsDrawerProps) {
	const { t } = useLanguage();
	const { theme, setTheme } = useThemeStore();
	const [faqOpen, setFaqOpen] = useState(true);
	const [expandedFaqs, setExpandedFaqs] = useState<Record<string, boolean>>({ "1": true });

	const toggleFaq = (id: string) => {
		setExpandedFaqs((prev) => ({
			...prev,
			[id]: !prev[id]
		}));
	};

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent
				side="right"
				className="flex h-full w-full flex-col border-l border-gray-200 bg-[#f1f3ff] p-0 sm:max-w-[50%] dark:border-[var(--border-dark)] dark:bg-[var(--background-dark)]"
			>
				{/* Custom Header to match the design */}
				<div className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-6 dark:border-[var(--border-dark)] dark:bg-[var(--headerBg-dark)]">
					<h2 className="text-xl font-bold text-gray-900 dark:text-[var(--headerText-dark)]">
						{t("settingsPage.title")}
					</h2>
					<Button
						variant="ghost"
						size="icon"
						onClick={() => onOpenChange(false)}
						className="h-10 w-10 text-gray-500 hover:bg-indigo-50 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
					>
						<X className="h-6 w-6" />
					</Button>
				</div>

				<div className="flex-1 space-y-8 overflow-y-auto p-6">
					{/* Theme Toggle */}
					<div className="space-y-4">
						<h3 className="text-sm font-semibold tracking-wider text-gray-500 uppercase dark:text-gray-400">
							{t("settingsPage.appearance")}
						</h3>
						<div className="flex gap-4">
							<button
								onClick={() => setTheme(THEMES.light)}
								className={`flex h-14 flex-1 items-center justify-center gap-3 rounded-xl border-2 transition-all ${
									theme === THEMES.light
										? "border-[var(--primary)] bg-indigo-50/50 text-[var(--primary)] dark:bg-indigo-900/10"
										: "border-[#4F4F4F] bg-[#FFFFFF0D] text-gray-600 dark:border-[#4F4F4F] dark:bg-[#FFFFFF0D] dark:text-gray-400"
								}`}
							>
								<Sun
									className={`h-5 w-5 ${theme === THEMES.light ? "text-[var(--primary)]" : "text-[#B0B0B0]"}`}
								/>
								<span className="text-sm font-bold dark:text-[#B0B0B0]">
									{t("settingsPage.lightMode")}
								</span>
							</button>

							<button
								onClick={() => setTheme(THEMES.dark)}
								className={`flex h-14 flex-1 items-center justify-center gap-3 rounded-xl border-2 transition-all ${
									theme === THEMES.dark
										? "border-[var(--primary)] bg-indigo-50/50 text-[var(--primary)] dark:bg-indigo-900/10"
										: "border-gray-100 bg-gray-50 text-gray-600 dark:border-gray-900 dark:bg-gray-900/50 dark:text-gray-400"
								}`}
							>
								<Moon
									className={`h-5 w-5 ${theme === THEMES.dark ? "text-[var(--primary)]" : "text-gray-400"}`}
								/>
								<span className="text-sm font-bold">{t("settingsPage.darkMode")}</span>
							</button>
						</div>
					</div>

					{/* FAQ Section */}
					<div className="space-y-4">
						<h3 className="text-sm font-semibold tracking-wider text-gray-500 uppercase dark:text-gray-400">
							{t("settingsPage.helpAndSupport")}
						</h3>
						<Collapsible
							open={faqOpen}
							onOpenChange={setFaqOpen}
							className="w-full overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-[var(--border-dark)] dark:bg-[var(--background-dark)]"
						>
							<CollapsibleTrigger asChild>
								<button className="flex w-full items-center justify-between px-5 py-4 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-900/50">
									<span className="text-base font-bold text-gray-900 dark:text-gray-100">
										{t("settingsPage.faq")}
									</span>
									{faqOpen ? (
										<ChevronUp className="h-5 w-5 text-gray-500" />
									) : (
										<ChevronDown className="h-5 w-5 text-gray-500" />
									)}
								</button>
							</CollapsibleTrigger>
							<CollapsibleContent className="space-y-4 px-5 pb-5">
								<div className="space-y-4 border-t border-gray-100 pt-5 dark:border-[var(--border-dark)]">
									{FAQ_DATA.map((faq, index) => (
										<div
											key={faq.id}
											className="overflow-hidden rounded-xl border border-gray-100 dark:border-[var(--border-dark)]"
										>
											<button
												onClick={() => toggleFaq(faq.id)}
												className="flex w-full items-start gap-3 px-4 py-4 text-left transition-colors hover:bg-gray-50/50 dark:hover:bg-gray-900/30"
											>
												<span className="mt-0.5 min-w-[20px] font-bold text-gray-400 dark:text-gray-500">
													{index + 1}.
												</span>
												<span className="flex-1 leading-snug font-bold text-gray-900 dark:text-gray-100">
													{faq.question}
												</span>
												{expandedFaqs[faq.id] ? (
													<ChevronUp className="h-4 w-4 flex-shrink-0 text-gray-400" />
												) : (
													<ChevronDown className="h-4 w-4 flex-shrink-0 text-gray-400" />
												)}
											</button>
											{expandedFaqs[faq.id] && (
												<div className="space-y-4 px-4 pb-4">
													{/* {faq.image && (
														<div className="relative w-full aspect-video bg-gray-100 dark:bg-gray-900 rounded-xl overflow-hidden border border-gray-100 dark:border-gray-800">
															<img
																src={faq.image}
																alt={faq.question}
																className="w-full h-full object-cover"
																onError={(e) => {
																	(e.target as HTMLImageElement).src = "/images/fallback-farm.jpg";
																}}
															/>
														</div>
													)} */}
													<p className="text-sm leading-relaxed text-gray-600 dark:text-gray-400">
														{faq.answer}
													</p>
												</div>
											)}
										</div>
									))}
								</div>
							</CollapsibleContent>
						</Collapsible>
					</div>
				</div>

				<div className="border-t border-gray-100 bg-gray-50/50 p-6 dark:border-gray-900 dark:bg-gray-900/30">
					<p className="text-center text-xs text-gray-400 dark:text-gray-500">
						Version 1.0.0 • {t("settingsPage.poweredBy")}
					</p>
				</div>
			</SheetContent>
		</Sheet>
	);
}
