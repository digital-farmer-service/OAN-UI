import { useEffect, useState, useRef } from "react";
import { Play, Pause } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/components/LanguageProvider";

const deleteIcon = `${import.meta.env.BASE_URL}assets/delete.svg`;
const micIcon = `${import.meta.env.BASE_URL}assets/micIcon.svg`;
const sendRecord = `${import.meta.env.BASE_URL}assets/sendRecord.svg`;
const pauseRecordIcon = `${import.meta.env.BASE_URL}assets/pauseRecordIcon.svg`;

type RecordingState = "recording" | "paused";

interface RecordingControlsProps {
	state: RecordingState;
	duration: number; // in seconds
	audioBlob: Blob | null;
	onPause: () => void;
	onResume: () => void;
	onDelete: () => void;
	onSend: () => void;
}

export function RecordingControls({
	state,
	duration,
	audioBlob,
	onPause,
	onResume,
	onDelete,
	onSend,
}: RecordingControlsProps) {
	const { t } = useLanguage();
	const [playbackTime, setPlaybackTime] = useState(0);
	const [isPlayingPreview, setIsPlayingPreview] = useState(false);
	const audioRef = useRef<HTMLAudioElement | null>(null);

	const [audioUrl, setAudioUrl] = useState<string | null>(null);

	// Reset playback when switching back to recording
	useEffect(() => {
		if (state === "recording") {
			if (audioRef.current) {
				audioRef.current.pause();
				audioRef.current.currentTime = 0;
			}
			setIsPlayingPreview(false);
			setPlaybackTime(0);
		}
	}, [state]);

	useEffect(() => {
		if (audioBlob) {
			const url = URL.createObjectURL(audioBlob);
			setAudioUrl(url);
			return () => URL.revokeObjectURL(url);
		} else {
			setAudioUrl(null);
		}
	}, [audioBlob]);

	function formatTime(sec: number) {
		const m = Math.floor(sec / 60);
		const s = Math.floor(sec % 60);
		return `${m}:${s.toString().padStart(2, "0")}`;
	}

	function togglePreview() {
		if (!audioRef.current) return;
		if (isPlayingPreview) {
			audioRef.current.pause();
		} else {
			audioRef.current.play().catch(e => console.error("Playback failed", e));
		}
	}

	return (
		<div className="flex w-full flex-col items-center gap-4 pb-2 pt-6">
			{/* Hidden Audio for Preview */}
			{audioUrl && (
				<audio
					ref={audioRef}
					src={audioUrl}
					onPlay={() => setIsPlayingPreview(true)}
					onPause={() => setIsPlayingPreview(false)}
					onTimeUpdate={(e) => setPlaybackTime(e.currentTarget.currentTime)}
					onEnded={() => {
						setIsPlayingPreview(false);
						setPlaybackTime(0);
					}}
					className="hidden"
				/>
			)}

			{/* Top Pill Status - Absolute Positioned on the border */}
			<div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 transform">
				<div className="whitespace-nowrap rounded-full bg-blue-50 px-6 py-1.5 text-xs font-medium text-blue-600 shadow-sm border border-blue-100">
					{t("recordingListening", { botName: "Bharati" })}
				</div>
			</div>

			{/* Waveform Area */}
			<div className="flex w-full items-center justify-between px-2">
				{state === "paused" && (
					<Button
						variant="ghost"
						size="icon"
						onClick={togglePreview}
						className="mr-2 cursor-pointer h-8 w-8 text-black dark:text-white hover:bg-transparent"
					>
						{isPlayingPreview ? (
							<Pause className="h-5 w-5 fill-current" />
						) : (
							<Play className="h-5 w-5 fill-current" />
						)}
					</Button>
				)}

				<div className="flex h-12 flex-1 items-center justify-center gap-[3px] overflow-hidden px-4">
					{Array.from({ length: 45 }).map((_, i) => {
                                // Reduced maximum height for a cleaner look
                                const height = 10 + Math.random() * 30;
                                return (
                                    <div
                                        key={i}
                                        className={cn(
                                            "w-[4px] rounded-full bg-black dark:bg-[var(--wave-dark)] transition-all duration-75",
                                            state === "recording" ? "animate-pulse" : "" 
                                        )}
                                        style={{ height: `${height}%` }}
                                    />
                                );
                            })}
				</div>

				<span className="ml-2 min-w-[36px] text-right text-sm font-medium text-muted-foreground">
					{formatTime(state === "paused" && isPlayingPreview ? playbackTime : duration)}
				</span>
			</div>

			{/* Bottom Controls */}
			<div className="flex w-full items-center justify-between px-4">
				{/* Left: Delete */}
				<Button
					variant="ghost"
					size="icon"
					onClick={onDelete}
					className="h-12 w-12 cursor-pointer text-red-500 hover:bg-red-50 hover:text-red-600"
				>
					<img src={deleteIcon} alt="Delete" className="h-6 w-6" />
				</Button>

				{/* Center: Pause/Resume */}
				{state === "recording" ? (
					<Button
						variant="ghost"
						size="icon"
						onClick={onPause}
						className="h-12 w-12 cursor-pointer text-[var(--primary)] hover:bg-indigo-50"
					>
						<img src={pauseRecordIcon} alt="Pause" className="h-8 w-8" />
					</Button>
				) : (
					<Button
						variant="ghost"
						size="icon"
						onClick={onResume}
						className="h-12 w-12 cursor-pointer text-[var(--primary)] hover:bg-indigo-50"
					>
						<img src={micIcon} alt="Mic" className="h-8 w-8" />
					</Button>
				)}

				{/* Right: Send */}
				<Button
					size="icon"
					onClick={onSend}
					className={cn(
						"h-12 w-12 cursor-pointer rounded-full text-white shadow-lg hover:bg-[var(--primary)]/90 relative bg-[var(--primary)]"
					)}
				>
					<img 
						src={sendRecord} 
						alt="Send" 
						className={cn(
							"h-5 w-5 recording animate-earthquake"
						)} 
					/>
				</Button>
			</div>
		</div>
	);
}
