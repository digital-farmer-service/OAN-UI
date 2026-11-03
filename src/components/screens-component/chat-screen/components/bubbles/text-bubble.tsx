import { cn } from "@/lib/utils";
import { type TextMessage } from "./chat-types";
import { useLanguage } from "@/components/LanguageProvider";
import { BetaLanguageNote } from "./beta-language-note";
import { SafeMarkdown } from "./safe-markdown";

export function TextBubble({ message }: { message: TextMessage }) {
	const { language } = useLanguage();
	const isUser = message.role === "user";
	const responseLanguage = message.responseLanguage ?? language;

	return (
		<div
			data-bubble={isUser ? "user" : "assistant"}
			className={cn(
				"max-w-full rounded-[20px] px-4 py-3 text-base shadow-sm sm:max-w-[85%]",
				isUser
					? "rounded-2xl rounded-tr-none bg-primary text-primary-foreground dark:bg-[var(--userBubble-dark)] dark:text-[var(--userBubbleText-dark)]"
					: "rounded-tl-md border bg-card text-card-foreground dark:bg-[var(--aiBubble-dark)] dark:text-[var(--aiBubbleText-dark)] dark:border-[var(--border-dark)]"
			)}
		>
			<div className="prose prose-sm dark:prose-invert max-w-none leading-relaxed whitespace-pre-wrap break-words overflow-wrap-anywhere">
				{isUser ? message.text : <SafeMarkdown>{message.text}</SafeMarkdown>}
			</div>
			{!isUser ? <BetaLanguageNote language={responseLanguage} /> : null}
		</div>
	);
}
