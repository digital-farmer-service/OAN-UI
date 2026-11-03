import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Copy, Loader2, ThumbsDown, ThumbsUp, Volume2, RefreshCw } from "lucide-react";
import { type CardMessage } from "./chat-types";
import { FeedbackModal } from "../feedback-modal";
import { canRetryMessage, useChatStore } from "@/hooks/store/chat";
import { useLanguage } from "@/components/LanguageProvider";
import { useIsMobile } from "@/hooks/use-mobile";
import { getTtsLabelKey } from "@/lib/audio-utils";
import { cn } from "@/lib/utils";
import { BetaLanguageNote } from "./beta-language-note";
import { SafeMarkdown } from "./safe-markdown";

export function CardBubble({ message }: { readonly message: CardMessage }) {
	const { language, t } = useLanguage();
	const isMobile = useIsMobile();
	const toggleTTS = useChatStore((s) => s.toggleTTS);
	const currentlyPlayingId = useChatStore((s) => s.currentlyPlayingId);
	const ttsStatus = useChatStore((s) => s.ttsStatus);
	const feedback = useChatStore((s) => s.messageFeedback[message.id]);
	const toggleLike = useChatStore((s) => s.toggleLike);
	const copyMessage = useChatStore((s) => s.copyMessage);
	const submitFeedback = useChatStore((s) => s.submitMessageFeedback);
	const retryLastMessage = useChatStore((s) => s.retryLastMessage);

	const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [isRetrying, setIsRetrying] = useState(false);

	const isThisMessage = currentlyPlayingId === message.id;
	const isThisLoading = isThisMessage && ttsStatus === "loading";
	const isThisPlaying = isThisMessage && ttsStatus === "playing";
	const isLiked = feedback === "like";
	const isDisliked = feedback === "dislike";
	const isRetryableError = message.isError && message.failedUserText;
	const canRetry = canRetryMessage(message);
	const responseLanguage = message.responseLanguage ?? language;

	const handleListen = async () => {
		try {
			await toggleTTS(message.body, language, message.id);
		} catch (error) {
			console.error("TTS action failed:", error);
		}
	};

	const handleRetry = () => {
		if (isRetrying) return;
		setIsRetrying(true);
		retryLastMessage(language, t);
	};

	const handleLike = () => {
		void toggleLike(message.id, t);
	};

	const handleThumbsDown = () => {
		setFeedbackModalOpen(true);
	};

	const handleCopy = () => {
		void copyMessage(message.id, t);
	};

	const handleFeedbackSubmit = async (
		reason: string,
		feedbackMessage: string
	) => {
		setIsSubmitting(true);
		setFeedbackModalOpen(false);

		try {
			await submitFeedback(message.id, false, reason, feedbackMessage);
		} catch (error) {
			console.error("Feedback submission failed:", error);
		} finally {
			setIsSubmitting(false);
		}
	};

	const iconButton =
		"h-9 w-9 rounded-md text-muted-foreground transition-all hover:bg-primary/10 hover:text-primary cursor-pointer";

	// AI Messages are always cards in this design
	return (
		<>
			<div className="w-full max-w-full sm:max-w-[90%] mb-8">
				<Card className={cn(
					"relative rounded-2xl rounded-tl-none border-none p-4 shadow-none overflow-hidden",
					isRetryableError
						? "bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30"
						: isMobile
							? "bg-transparent px-1"
							: "bg-muted"
				)}>
					{/* Content */}
					<div>
						{message.title ? (
							<div className="mb-2 text-base font-bold">{message.title}</div>
						) : null}

						<div className={cn("prose prose-sm dark:prose-invert max-w-none text-base leading-relaxed text-foreground break-words overflow-wrap-anywhere", message.isError && "text-red-600 dark:text-red-400 font-medium")}>
							<SafeMarkdown>{message.body}</SafeMarkdown>
						</div>
						<BetaLanguageNote language={responseLanguage} />

						{/* Retry Button for error messages, until the retry limit is reached */}
						{canRetry && (
							<div className="mt-3 flex items-center gap-2">
								<Button
									data-action="retry"
									size="sm"
									className="gap-2 rounded-md cursor-pointer"
									onClick={handleRetry}
									disabled={isRetrying}
								>
									<RefreshCw className={cn("h-3.5 w-3.5", isRetrying && "animate-spin")} />
									{(isRetrying ? t("retrying") : t("retry")) as string}
								</Button>
							</div>
						)}

						{/* Action Chips */}
						{message.actions?.length ? (
							<div className="mt-3 flex flex-wrap gap-2 pt-1">
								{message.actions.map((a) => (
									<Button
										key={a.id}
										variant="outline"
										className="h-8 rounded-full border-indigo-200 bg-white px-4 text-xs font-medium text-indigo-700 hover:bg-indigo-50"
									>
										{a.label}
									</Button>
								))}
							</div>
						) : null}
					</div>

					{/* Action row: hidden for retryable errors */}
					{message.showListenRow && !isRetryableError && (
						<div className="mt-3 flex flex-wrap items-center gap-1">
							<Button
								data-action="listen"
								variant="outline"
								className={cn(
									"h-9 gap-2 rounded-md border-primary/20 bg-primary/10 px-3 text-sm font-medium text-primary hover:bg-primary/20 hover:text-primary cursor-pointer",
									isThisPlaying && "bg-primary/20"
								)}
								onClick={handleListen}
								disabled={isThisLoading}
								aria-disabled={isThisLoading || undefined}
								aria-busy={isThisLoading || undefined}
							>
								{isThisLoading ? (
									<Loader2 data-testid="tts-spinner" className="h-4 w-4 animate-spin" />
								) : (
									<Volume2 className={cn("h-4 w-4", isThisPlaying && "animate-pulse")} />
								)}
								<span>{t(getTtsLabelKey(ttsStatus)) as string}</span>
							</Button>

							<Button
								data-action="copy"
								variant="ghost"
								size="icon"
								className={iconButton}
								aria-label="Copy"
								title="Copy"
								onClick={handleCopy}
							>
								<Copy className="h-4 w-4" />
							</Button>

							{!isDisliked && (
								<Button
									data-action="like"
									variant="ghost"
									size="icon"
									className={cn(iconButton, isLiked && "like-active")}
									aria-label="Helpful"
									aria-pressed={isLiked}
									title="Helpful"
									onClick={handleLike}
								>
									<ThumbsUp className="h-4 w-4" fill={isLiked ? "currentColor" : "none"} />
								</Button>
							)}

							{!isLiked && (
								<Button
									data-action="dislike"
									variant="ghost"
									size="icon"
									className={cn(iconButton, "disabled:opacity-100", isDisliked && "pointer-events-none text-primary")}
									aria-label="Not Helpful"
									title="Not Helpful"
									onClick={handleThumbsDown}
									disabled={isSubmitting || isDisliked}
								>
									<ThumbsDown className="h-4 w-4" fill={isDisliked ? "currentColor" : "none"} />
								</Button>
							)}
						</div>
					)}
				</Card>
			</div>

			{/* Feedback Modal */}
			<FeedbackModal
				open={feedbackModalOpen}
				onClose={() => setFeedbackModalOpen(false)}
				onSubmit={handleFeedbackSubmit}
			/>
		</>
	);
}
