import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Mic, X, Camera, ImageIcon } from "lucide-react";
import Lottie from "lottie-react";
import loadingAnim from "@/assets/Loading.json";
import sendIcon from "@/assets/send.svg";
import activeSend from "@/assets/activeSend.svg";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { RecordingControls } from "./recording-controls";
import { Suggestions } from "./suggestions";
import type { Suggestion } from "../api/suggestions-api";
import { useLanguage } from "@/components/LanguageProvider";
import { useAuth } from "@/contexts/AuthContext";
import { useChatStore } from "@/hooks/store/chat";
import { useIsMobile } from "@/hooks/use-mobile";
import { environment } from "@/lib/config/environment";

const MAX_CLIENT_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/jpg"]);

export type ChatInputPayload = {
	text: string;
	files: File[];
	mode?: "chat" | "pest_api";
	voice?: Blob | null;
	duration?: number;
};

export type ChatInputProps = {
	placeholder?: string;
	disabled?: boolean;
	value: string;
	onValueChange: (_value: string) => void;
	onSend: (_payload: ChatInputPayload) => void;
	onTypingChange?: (_isTyping: boolean) => void;
	onVoiceStart?: () => void;
	onVoiceStop?: () => void;
	micHint?: string;
	footerNote?: ReactNode;
	isListening?: boolean;
	isTranscribing?: boolean;
	suggestions?: Suggestion[];
	onSuggestionClick?: (text: string) => void;
};

export function ChatInput({
	placeholder = "Type a message…",
	disabled,
	value,
	onValueChange,
	onSend,
	onTypingChange,
	onVoiceStart,
	onVoiceStop,
	micHint,
	footerNote,
	isListening,
	isTranscribing,
	suggestions = [],
	onSuggestionClick
}: ChatInputProps) {
	const { t } = useLanguage();
	const { user } = useAuth();
	const setToast = useChatStore((s) => s.setToast);
	const isMobile = useIsMobile();
	const isUnauthenticated = !user;
	const [isPestDialogOpen, setIsPestDialogOpen] = useState(false);
	const [pestImage, setPestImage] = useState<File | null>(null);
	const [pestImagePreview, setPestImagePreview] = useState<string | null>(null);
	const [voice, setVoice] = useState<Blob | null>(null);
	const [recordingState, setRecordingState] = useState<"idle" | "recording" | "paused">("idle");
	const [recordingDuration, setRecordingDuration] = useState(0);
	const [audioBlob, setAudioBlob] = useState<Blob | null>(null);

	const mediaRecorderRef = useRef<MediaRecorder | null>(null);
	const chunksRef = useRef<BlobPart[]>([]);
	const timerRef = useRef<NodeJS.Timeout | null>(null);

	const pestCameraInputRef = useRef<HTMLInputElement>(null);
	const pestGalleryInputRef = useRef<HTMLInputElement>(null);
	const taRef = useRef<HTMLTextAreaElement | null>(null);

	const canSend = useMemo(() => value.trim().length > 0 || !!voice, [value, voice]);
	const isLoading = isTranscribing || Boolean(disabled);
	const isPestSubmitDisabled = disabled || isLoading || isUnauthenticated || !pestImage;
	const maxLength = environment.chatMessageMaxLength ?? 4000;
	const charCount = value.length;
	const isNearLimit = charCount >= maxLength * 0.8;
	const isAtLimit = charCount >= maxLength;

	// Clean up on unmount
	useEffect(() => {
		return () => {
			if (timerRef.current) clearInterval(timerRef.current);
			if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
				mediaRecorderRef.current.stream.getTracks().forEach((t) => t.stop());
			}
			if (pestImagePreview) {
				URL.revokeObjectURL(pestImagePreview);
			}
		};
	}, [pestImagePreview]);


	useEffect(() => {
		onTypingChange?.(value.trim().length > 0);
	}, [onTypingChange, value]);

	useEffect(() => {
		if (!isPestDialogOpen) {
			setPestImage(null);
			setPestImagePreview((currentPreview) => {
				if (currentPreview) {
					URL.revokeObjectURL(currentPreview);
				}
				return null;
			});
		}
	}, [isPestDialogOpen]);

	async function startRecording() {
		try {
			const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
			const recorder = new MediaRecorder(stream);
			chunksRef.current = [];

			recorder.ondataavailable = (e) => {
				if (e.data.size > 0) chunksRef.current.push(e.data);
			};

			recorder.onstop = () => {
				stream.getTracks().forEach((t) => t.stop());
				const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
				setAudioBlob(blob);
			};

			recorder.start();
			mediaRecorderRef.current = recorder;

			setRecordingState("recording");
			setRecordingDuration(0);
			onVoiceStart?.();

			timerRef.current = setInterval(() => {
				setRecordingDuration((prev) => prev + 1);
			}, 1000);
		} catch (error) {
			console.error("Failed to start recording:", error);
		}
	}

	function pauseRecording() {
		if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
			mediaRecorderRef.current.requestData(); 
			const mimeType = mediaRecorderRef.current.mimeType;
			setTimeout(() => {
				const blob = new Blob(chunksRef.current, { type: mimeType || "audio/webm" });
				setAudioBlob(blob);
				mediaRecorderRef.current?.pause();
				setRecordingState("paused");
				if (timerRef.current) clearInterval(timerRef.current);
			}, 100); // Increased timeout slightly to be safe
		}
	}

	function resumeRecording() {
		if (mediaRecorderRef.current && mediaRecorderRef.current.state === "paused") {
			mediaRecorderRef.current.resume();
			setRecordingState("recording");
			timerRef.current = setInterval(() => {
				setRecordingDuration((prev) => prev + 1);
			}, 1000);
		}
	}

	function stopRecording() {
		if (mediaRecorderRef.current) {
			mediaRecorderRef.current.stop();
			if (timerRef.current) clearInterval(timerRef.current);
			onVoiceStop?.();
		}
	}

	function cancelRecording() {
		stopRecording();
		setRecordingState("idle");
		setAudioBlob(null);
		setRecordingDuration(0);
		chunksRef.current = [];
	}

	function finishRecordingAndSend() {
		// Stop recorder if running or paused
		if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
			mediaRecorderRef.current.stop();
			// Ensure tracks are stopped
			mediaRecorderRef.current.stream.getTracks().forEach((t) => t.stop());
		}

		if (timerRef.current) clearInterval(timerRef.current);

		// Allow small buffer for onvideo/onstop to finalize state
		setTimeout(() => {
			const type = mediaRecorderRef.current?.mimeType || "audio/webm"; 
			const blob = new Blob(chunksRef.current, { type });
			if (blob.size > 0) {
				onSend({ text: "", files: [], voice: blob, duration: recordingDuration });
			}
			// Reset all state
			setRecordingState("idle");
			setAudioBlob(null);
			setRecordingDuration(0);
			chunksRef.current = [];
			onVoiceStop?.();
		}, 50);
	}

	function openPestApiPicker() {
		pestCameraInputRef.current?.click();
	}

	function openPestGalleryPicker() {
		pestGalleryInputRef.current?.click();
	}

	function clearVoice() {
		setVoice(null);
	}

	function setPestFile(file: File) {
		setPestImage(file);
		setPestImagePreview((currentPreview) => {
			if (currentPreview) {
				URL.revokeObjectURL(currentPreview);
			}
			return URL.createObjectURL(file);
		});
	}

	function onPestFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
		const file = e.target.files?.[0];
		if (!file) return;
		if (!validateSelectedImage(file)) {
			e.target.value = "";
			return;
		}
		setPestFile(file);
		e.target.value = "";
	}

	function validateSelectedImage(file: File) {
		const fileType = file.type.toLowerCase();
		const validType = ACCEPTED_IMAGE_TYPES.has(fileType);
		if (!validType) {
			setToast({
				message: t("imageUpload.invalidFormat") as string,
				type: "error"
			});
			return false;
		}

		if (file.size > MAX_CLIENT_IMAGE_SIZE_BYTES) {
			setToast({
				message: t("imageUpload.imageTooLarge") as string,
				type: "error"
			});
			return false;
		}

		return true;
	}

	function removePestFile() {
		setPestImage(null);
		setPestImagePreview((currentPreview) => {
			if (currentPreview) {
				URL.revokeObjectURL(currentPreview);
			}
			return null;
		});
	}

	function submitPestImage() {
		if (!pestImage || isPestSubmitDisabled) return;

		const selectedImage = pestImage;
		setIsPestDialogOpen(false);
		onSend({ text: "", files: [selectedImage], mode: "pest_api" });
	}

	function submit() {
		if (!canSend || disabled || isLoading) return;
		onSend({ text: value.trim(), files: [], voice, mode: "chat" });
		onValueChange("");
		setVoice(null);
	}

	function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			submit();
		}
	}

	if (recordingState !== "idle") {
		return (
			<div className="relative bg-[#FFFFFF] dark:bg-[var(--inputBg-dark)] backdrop-blur supports-[backdrop-filter]:bg-[#FFFFFF] dark:supports-[backdrop-filter]:bg-[var(--inputBg-dark)]">
				<div className="mx-auto w-full lg:w-1/2 px-2 py-2 sm:px-4">
					<RecordingControls
						state={recordingState}
						duration={recordingDuration}
						audioBlob={audioBlob}
						onPause={pauseRecording}
						onResume={resumeRecording}
						onDelete={cancelRecording}
						onSend={finishRecordingAndSend}
					/>
				</div>
			</div>
		);
	}

	return (
		<div className="bg-[#FFFFFF] dark:bg-[var(--inputBg-dark)] backdrop-blur supports-[backdrop-filter]:bg-[#FFFFFF] dark:supports-[backdrop-filter]:bg-[var(--inputBg-dark)]">
			<Dialog open={isPestDialogOpen} onOpenChange={setIsPestDialogOpen}>
				<DialogContent className="max-w-md overflow-hidden rounded-2xl p-0 gap-0 bg-white dark:bg-[var(--background)] border shadow-xl" showCloseButton={false}>
					{/* Warm amber header — softer than before */}
					<DialogHeader className="gap-0">
						<div className="bg-gradient-to-br from-amber-400 to-amber-500 px-6 py-5 text-white">
							<div className="flex items-center gap-2 mb-1">
								<Camera className="h-5 w-5 opacity-90" />
								<DialogTitle className="text-lg font-semibold">
									{t("pestApi.title") as string}
								</DialogTitle>
							</div>
							<DialogDescription className="text-amber-50/90 text-sm leading-relaxed">
								{t("pestApi.description") as string}
							</DialogDescription>
						</div>
					</DialogHeader>

					<div className="px-6 py-5 space-y-5">
						{/* Refined amber note with icon */}
						<div className="flex items-start gap-3 rounded-xl border border-amber-100 bg-amber-50/60 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/30 dark:bg-amber-950/20 dark:text-amber-100">
							<svg className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
								<path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
							</svg>
							{t("pestApi.note") as string}
						</div>

						{/* Photo section */}
						<div className="space-y-3">
							<p className="text-sm font-semibold text-foreground flex items-center gap-2">
								<span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500" />
								{t("pestApi.photoLabel") as string}
							</p>

							{pestImagePreview ? (
								<div className="relative overflow-hidden rounded-xl border border-border bg-muted/30 shadow-sm">
									<img
										src={pestImagePreview}
										alt={pestImage?.name || "Crop image preview"}
										className="max-h-56 w-full object-contain p-3"
									/>
									<button
										type="button"
										onClick={removePestFile}
										className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-md transition-all hover:bg-black/70 hover:scale-105"
									>
										<X className="h-4 w-4" />
									</button>
								</div>
							) : (
								<div className="rounded-xl border-2 border-dashed border-amber-200/70 bg-amber-50/30 px-4 py-8 transition-all hover:border-amber-300 hover:bg-amber-50/50 dark:border-amber-900/30 dark:bg-amber-950/10">
									<div className={cn("flex items-center justify-center", isMobile ? "gap-8" : "gap-4 flex-col")}>
										{isMobile && (
											<button
												type="button"
												onClick={openPestApiPicker}
												className="group flex flex-col items-center gap-2.5"
											>
												<div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-amber-300/80 bg-white text-amber-600 shadow-sm transition-all group-hover:border-amber-400 group-hover:bg-amber-50 group-hover:shadow-md group-hover:scale-105 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
													<Camera className="h-6 w-6" />
												</div>
												<span className="text-center text-sm font-medium text-foreground">
													{t("imageUpload.captureImage") as string}
												</span>
											</button>
										)}
										<button
											type="button"
											onClick={openPestGalleryPicker}
											className="group flex flex-col items-center gap-2.5"
										>
											<div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-amber-300/80 bg-white text-amber-600 shadow-sm transition-all group-hover:border-amber-400 group-hover:bg-amber-50 group-hover:shadow-md group-hover:scale-105 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
												<ImageIcon className="h-6 w-6" />
											</div>
											<span className="text-center text-sm font-medium text-foreground">
												{t("imageUpload.selectFromGallery") as string}
											</span>
										</button>
									</div>
									<p className="mt-5 text-center text-xs text-muted-foreground/80">
										{t("imageUpload.imageFormatHint") as string}
									</p>
								</div>
							)}
						</div>

						<input
							ref={pestCameraInputRef}
							type="file"
							accept="image/jpeg,image/png,image/jpg"
							capture="environment"
							className="hidden"
							onChange={onPestFilePicked}
						/>
						<input
							ref={pestGalleryInputRef}
							type="file"
							accept="image/jpeg,image/png,image/jpg"
							className="hidden"
							onChange={onPestFilePicked}
						/>
					</div>

					{/* Footer buttons */}
					<DialogFooter className="border-t border-border/50 px-6 py-4 gap-3 sm:justify-end bg-muted/20">
						<Button
							type="button"
							variant="outline"
							onClick={() => setIsPestDialogOpen(false)}
							className="flex-1 sm:flex-none rounded-xl border-border/80 hover:bg-muted"
						>
							{t("pestApi.cancel") as string}
						</Button>
						<Button
							type="button"
							onClick={submitPestImage}
							disabled={isPestSubmitDisabled}
							className="flex-1 sm:flex-none rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-md hover:from-amber-600 hover:to-amber-700 hover:shadow-lg disabled:opacity-50 transition-all"
						>
							{t("pestApi.submit") as string}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>


			<div className="mx-auto w-full lg:w-1/2 px-2 pt-2 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] sm:px-4">
				<Suggestions
					suggestions={suggestions}
					onSuggestionClick={(text) => onSuggestionClick?.(text)}
					className="mb-2"
				/>
				{/* Voice preview row */}
				{voice && (
					<div className="mb-2 flex flex-wrap items-center gap-2">
						<Badge variant="secondary" className="gap-2">
							<span>Voice message</span>
							<button
								type="button"
								onClick={clearVoice}
								className="cursor-pointer rounded-sm p-0.5 hover:bg-muted"
							>
								<X className="h-3.5 w-3.5" />
							</button>
						</Badge>
					</div>
				)}

			<div className="flex items-center gap-2">
				<div className="relative">
					{micHint && !value.trim() ? (
						<div className="absolute bottom-full left-0 mb-3 animate-[float_3s_ease-in-out_infinite]">
							<div className="relative whitespace-nowrap rounded-lg bg-[var(--secondary)] px-3 py-2 text-sm font-medium text-[var(--primary)] shadow-sm">
								{t("chatMicHint")}
								<div className="absolute -bottom-1.5 left-4 h-3 w-3 rotate-45 bg-[var(--secondary)]"></div>
							</div>
						</div>
					) : null}
					<Button
						type="button"
						size="icon"
						disabled={disabled || isLoading || isUnauthenticated}
						onClick={startRecording}
						className={cn(
							"h-11 w-11 shrink-0 rounded-full text-black bg-[var(--primary)] hover:bg-[var(--accent)]/90 dark:bg-[var(--primary)] dark:hover:bg-[var(--primary)]/90 shadow-md",
							isListening ? "animate-pulse" : "",
							disabled || isLoading || isUnauthenticated ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
						)}
						aria-label="Record voice"
					>
						<Mic color="white" className="h-5 w-5" />
					</Button>
				</div>

<div
  className={cn(
    "flex flex-1 min-h-[50px] min-w-0 items-stretch rounded-[16px] border bg-white dark:bg-[var(--inputBg-dark)] shadow-sm transition-colors duration-200 relative",
    canSend ? "border-black dark:border-[var(--border-dark)]" : "border-gray-300 dark:border-gray-700",
    isLoading || isUnauthenticated ? "bg-gray-50 opacity-80 cursor-not-allowed" : ""
  )}
>
  {isLoading && (
    <div className="absolute inset-0 z-10 flex items-center ml-4 justify-start rounded-[16px] bg-white pointer-events-none dark:bg-[var(--inputBg-dark)]">
      <div className="flex items-center gap-1">
        <div className="h-8 w-8 overflow-hidden">
			{isTranscribing && (
				<Lottie
					animationData={loadingAnim}
					loop={true}
					autoplay={true}
					style={{ width: "100%", height: "100%" }}
				/>
			)}
        </div>
        <span className="text-base text-gray-500">
			{isTranscribing ? "Transcribing..." : ""}
		</span>
      </div>
    </div>
  )}
					<Textarea
						ref={taRef}
						value={value}
						onChange={(e) => {
							const newValue = e.target.value;
							if (newValue.length <= maxLength) {
								onValueChange(newValue);
								return;
							}
							onValueChange(newValue.slice(0, maxLength));
						}}
						onKeyDown={onKeyDown}
						disabled={disabled || isLoading || isUnauthenticated}
						placeholder={(isLoading || isUnauthenticated) ? "" : placeholder}
    className={cn(
      "flex-1 min-w-0 max-h-[140px] min-h-[50px] mx-4 resize-none border-0 bg-transparent px-0 py-[13px] text-base leading-6 shadow-none",
      "focus-visible:ring-0 focus-visible:ring-offset-0 focus:outline-none",
      "placeholder:text-gray-400 placeholder:leading-6 dark:text-[var(--inputText-dark)]",
      "break-words whitespace-pre-wrap overflow-y-auto block",
	  disabled || isLoading || isUnauthenticated ? "cursor-not-allowed" : ""
						)}
					/>
					{isNearLimit && (
						<span
							className={cn(
								"absolute bottom-1 right-14 text-[10px] leading-none opacity-60 select-none pointer-events-none",
								isAtLimit ? "text-red-500 opacity-90" : "text-muted-foreground"
							)}
						>
							{charCount}/{maxLength}
						</span>
					)}
					<div className="flex shrink-0 items-center pr-2">
    <Button
      type="button"
      disabled={disabled || isLoading || isUnauthenticated}
      onClick={() => setIsPestDialogOpen(true)}
      className={cn(
        "h-12 w-12 rounded-full border border-transparent bg-transparent text-amber-700 hover:bg-amber-50 hover:text-amber-900 dark:text-amber-200 dark:hover:bg-amber-950/40 dark:hover:text-amber-100 shadow-none p-0",
        disabled || isLoading || isUnauthenticated ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
      )}
      aria-label={t("pestApi.trigger") as string}
      title={t("pestApi.trigger") as string}
    >
      <Camera className="size-5" />
    </Button>
  </div>

  {/* Grey/Green area around send button */}
  <div
    className={cn(
      "flex w-12 items-stretch justify-center transition-colors duration-200",
      "rounded-r-[16px] rounded-l-none bg-[#F6F6F6] dark:bg-[#FFFFFF1A]",
	  canSend && !isLoading ? "brand-gradient" : "bg-gray-200 dark:bg-[#FFFFFF1A]"
    )}
  >
    <Button
      type="button"
      size="icon"
      variant="ghost"
      className={cn(
        "h-full w-12 rounded-r-[16px] rounded-l-none hover:bg-transparent shadow-none",
        "focus-visible:ring-0 focus-visible:ring-offset-0 focus:outline-none",
        canSend && !isLoading ? "text-white cursor-pointer" : "text-gray-500 cursor-not-allowed"
      )}
      onClick={submit}
      disabled={!canSend || disabled || isLoading}
      aria-label="Send"
    >
      <img 
        src={canSend && !isLoading ? activeSend : sendIcon} 
        alt="Send" 
        className={cn(
          "h-5 w-5",
          canSend && !isLoading ? "animate-earthquake" : ""
        )} 
      />
    </Button>
  </div>
</div>

				</div>

				{footerNote ? (
					<div className="mt-3 text-center text-[12px] text-muted-foreground dark:text-[var(--inputText-dark)]">{footerNote}</div>
				) : null}

			</div>
		</div>
	);
}
