import { useLanguage } from "@/components/LanguageProvider";
import { useIsMobile } from "@/hooks/use-mobile";
import welcomeImage from "@/assets/welcome.png";

/**
 * Old empty-chat screen (80adef9 src/components/EmptyStateScreen.tsx:30-80): the welcome image and
 * "How can I help you today?" only. No quick-action cards, no ticker.
 */
export function BiharWelcome() {
	const { t } = useLanguage();
	const isMobile = useIsMobile();

	return (
		<div className="flex min-h-[calc(100svh-17rem)] w-full items-center justify-center py-6">
			{/* translate-y: optical centre between header and input, as in the old UI (list padding shifts it up) */}
			<div className="flex w-full max-w-[200px] translate-y-10 flex-col items-center">
				<div
					className="mb-[3px] flex shrink-0 items-center justify-center"
					style={{ width: isMobile ? 120 : 135, height: isMobile ? 160 : 180 }}
				>
					<img src={welcomeImage} alt="Welcome" className="h-full w-full object-contain" />
				</div>
				<p className={isMobile ? "w-full text-center text-[15px]" : "w-full text-center text-base"}>
					{t("helpYouToday") as string}
				</p>
			</div>
		</div>
	);
}
