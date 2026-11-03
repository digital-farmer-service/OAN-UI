import { useState } from "react";
import { cn } from "@/lib/utils";
import {
	Popover,
	PopoverContent,
	PopoverTrigger
} from "@/components/ui/popover";
import { LANGUAGES } from "../config";
import { useLanguage } from "@/components/LanguageProvider";
import { useChatStore } from "@/hooks/store/chat";

type LanguageSelectionDropdownProps = {
	children: React.ReactNode;
};

export function LanguageSelectionDropdown({
	children
}: LanguageSelectionDropdownProps) {
	const { language: selectedLanguage, setLanguage } = useLanguage();
	const fetchNotifications = useChatStore((state) => state.fetchNotifications);
	const [open, setOpen] = useState(false);

	const handleLanguageSelect = (code: keyof typeof LANGUAGES) => {
		setLanguage(code);
		setOpen(false);
		void fetchNotifications();
	};

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				{children}
			</PopoverTrigger>
			<PopoverContent 
				className="w-[200px] p-0 rounded-2xl border border-gray-100 dark:border-transparent overflow-hidden shadow-xl"
				align="end"
				sideOffset={8}
			>
				<div className="bg-white dark:bg-[#5D5D5D] flex flex-col">
					{Object.values(LANGUAGES).map((language) => {
						const isActive = selectedLanguage === language.code;
						return (
							<button
								key={language.code}
								onClick={() => handleLanguageSelect(language.code)}
								className={cn(
									"w-full flex items-center px-5 py-3.5 transition-colors text-left cursor-pointer",
									isActive 
										? "bg-primary text-primary-foreground font-bold"
										: "bg-white dark:bg-[#5D5D5D] text-gray-800 dark:text-white font-medium hover:bg-gray-50 dark:hover:brightness-110"
								)}
							>
								<span className="text-sm font-medium">
									{language.nativeName}
								</span>
							</button>
						);
					})}
				</div>
			</PopoverContent>
		</Popover>
	);
}
