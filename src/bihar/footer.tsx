import { Info } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import BharatVistarLogo from "@/assets/BharatVistarLogo.png";

/**
 * Old chat footer (80adef9 src/components/ChatInterface.tsx:1267-1285): Info icon + disclaimer,
 * then "Powered by" + the Bharat Vistaar logo. English reads "Powered by <logo>"; the other
 * languages read "<logo> द्वारा संचालित", so the logo comes first. Stacked on mobile.
 */
export function BiharFooter() {
	const { language, t } = useLanguage();
	const isMobile = useIsMobile();

	const logo = (
		<img src={BharatVistarLogo} alt="Bharat Vistaar Logo" className="inline-block h-6 w-auto" />
	);
	const poweredBy = <span>{t("poweredBy") as string}</span>;

	return (
		<div
			className={cn(
				"flex items-center justify-center text-center text-xs text-muted-foreground",
				isMobile ? "flex-col" : "flex-row"
			)}
		>
			<div className="flex items-center justify-center">
				<Info className="mr-1 inline-block h-3 w-3" />
				<span>{t("disclaimerText") as string}</span>
			</div>
			<div className={cn("flex items-center justify-center gap-1", isMobile ? "mt-1" : "ml-1")}>
				{language === "en" ? (
					<>
						{poweredBy}
						{logo}
					</>
				) : (
					<>
						{logo}
						{poweredBy}
					</>
				)}
			</div>
		</div>
	);
}
