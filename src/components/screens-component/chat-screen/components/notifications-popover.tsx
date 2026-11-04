import { useCallback, useMemo, useState } from "react";
import { CheckCheck, Cloud, ThumbsUp, ThumbsDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useChatStore, type ApiNotification, SEEN_NOTIFICATIONS_KEY } from "@/hooks/store/chat";
import { cn } from "@/lib/utils/index";
import { useLanguage } from "@/components/LanguageProvider";
import apiService from "@/lib/api-service";
import {
	NotificationFeedbackModal,
	type NotificationFeedbackReason
} from "./notification-feedback-modal";

const bellIcon = `${import.meta.env.BASE_URL}assets/bell.svg`;

function unescapeNewlines(text: string): string {
	return text.replace(/\\n/g, "\n");
}

function bodyPreview(text: string, maxLen = 110): string {
	const normalized = unescapeNewlines(text);
	const line = normalized.split(/\r?\n/).find((l) => l.trim().length > 0) ?? normalized;
	const trimmed = line.trim();
	return trimmed.length <= maxLen ? trimmed : `${trimmed.slice(0, maxLen - 1)}…`;
}

function getSeenIds(): Set<string> {
	try {
		const raw = localStorage.getItem(SEEN_NOTIFICATIONS_KEY);
		return raw ? new Set(JSON.parse(raw)) : new Set();
	} catch { return new Set(); }
}

export function NotificationsPopover() {
	const notifications = useChatStore((s) => s.notifications);
	const markNotificationRead = useChatStore((s) => s.markNotificationRead);

	const { t } = useLanguage();

	const [popoverOpen, setPopoverOpen] = useState(false);
	const [detailOpen, setDetailOpen] = useState(false);
	const [selected, setSelected] = useState<ApiNotification | null>(null);
	const [feedbackTarget, setFeedbackTarget] = useState<ApiNotification | null>(null);
	const [seenIds, setSeenIds] = useState<Set<string>>(getSeenIds);
	const [feedbackMap, setFeedbackMap] = useState<Record<string, "liked" | "disliked">>({});
	const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
	const [showTooltip, setShowTooltip] = useState(
		() => localStorage.getItem("notifications_tooltip_seen") !== "true"
	);

	const dismissTooltip = useCallback(() => {
		localStorage.setItem("notifications_tooltip_seen", "true");
		setShowTooltip(false);
	}, []);

	const unreadCount = useMemo(
		() => notifications.filter((n) => !seenIds.has(n.notification_id)).length,
		[notifications, seenIds]
	);

	const openDetail = useCallback(
		(n: ApiNotification) => {
			apiService.trackUiTelemetryEvent({
				event_name: "notification_selected",
				category: "notification",
				metadata: {
					notification_id: n.notification_id,
					notification_detail: n
				}
			});
			markNotificationRead(n.notification_id);
			setSeenIds((prev) => new Set(prev).add(n.notification_id));
			setSelected(n);
			setPopoverOpen(false);
			setDetailOpen(true);
		},
		[markNotificationRead]
	);

	const markAllRead = useCallback(() => {
		apiService.trackUiTelemetryEvent({
			event_name: "notifications_mark_all_read",
			category: "notification",
			metadata: {}
		});
		const allIds = notifications.map((n) => n.notification_id);
		const existing: string[] = (() => {
			try { return JSON.parse(localStorage.getItem(SEEN_NOTIFICATIONS_KEY) || "[]"); }
			catch { return []; }
		})();
		const merged = [...new Set([...existing, ...allIds])];
		localStorage.setItem(SEEN_NOTIFICATIONS_KEY, JSON.stringify(merged));
		setSeenIds(new Set(merged));
	}, [notifications]);

	return (
		<>
			<Popover
				open={popoverOpen}
				onOpenChange={(open) => {
					setPopoverOpen(open);
					if (open) {
						apiService.trackUiTelemetryEvent({
							event_name: "notification_bell",
							category: "notification",
							metadata: {}
						});
						dismissTooltip();
					}
				}}
			>
				<div className="relative">
					{/* Tooltip */}
					{showTooltip && (
						<div className="absolute top-full right-0 mt-3 z-[70] pointer-events-none select-none animate-[float_3s_ease-in-out_infinite]">
							<div className="relative w-[160px] rounded-lg bg-[var(--secondary)] px-3 py-2 text-sm font-medium text-[var(--primary)] shadow-sm">
								{t("notifications.tooltip") as string}
								<div className="absolute -top-1.5 right-4 h-3 w-3 rotate-45 bg-[var(--secondary)]" aria-hidden />
							</div>
						</div>
					)}

					<PopoverTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							className="h-11 w-11 text-muted-foreground cursor-pointer hover:bg-[var(--secondary)] relative"
							aria-label="Notifications"
						>
							<img src={bellIcon} alt="" className="h-8 w-8" aria-hidden />
							{unreadCount > 0 && (
								<span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold leading-none text-white" aria-hidden>
									{unreadCount > 99 ? "99+" : unreadCount}
								</span>
							)}
						</Button>
					</PopoverTrigger>
				</div>

				<PopoverContent
					forceMount
					align="center"
					side="bottom"
					sideOffset={8}
					collisionPadding={12}
					className="z-[60] w-72 p-0 shadow-lg border border-gray-200 dark:border-[var(--border-dark)] bg-white dark:bg-[var(--background-dark)] duration-75 data-[state=closed]:pointer-events-none data-[state=closed]:opacity-0"
				>
					{/* Header */}
					<div className="flex items-center gap-2 border-b border-gray-200 px-3 py-2 dark:border-[var(--border-dark)]">
						<img src={bellIcon} alt="" className="h-4 w-4 shrink-0" aria-hidden />
						<h2 className="text-sm font-bold text-gray-900 dark:text-[var(--headerText-dark)]">
							{t("notifications.title") as string}
						</h2>
						{unreadCount > 0 && (
							<span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold leading-none text-white">
								{unreadCount}
							</span>
						)}
					</div>

					{/* List */}
					<div className="max-h-60 overflow-y-auto px-2 py-1.5">
						{notifications.length > 0 ? (
							<div className="flex flex-col gap-1">
								{notifications.map((n) => {
									const read = seenIds.has(n.notification_id);
									return (
										<button
											key={n.notification_id}
											type="button"
											onClick={() => openDetail(n)}
											className={cn(
												"relative flex w-full cursor-pointer items-start gap-2 rounded-md border px-2 py-2 text-left transition-colors overflow-hidden",
												read
													? "border-gray-200 bg-white hover:bg-gray-50 dark:border-[var(--border-dark)] dark:bg-transparent dark:hover:bg-gray-900/40"
													: "border-[var(--primary)]/30 bg-indigo-50/60 hover:bg-indigo-50 dark:border-[var(--primary)]/40 dark:bg-indigo-900/20 dark:hover:bg-indigo-900/30"
											)}
										>
											{/* Left accent bar for unread */}
											{!read && (
												<span className="absolute left-0 top-0 h-full w-[3px] rounded-l-md bg-[var(--primary)]" aria-hidden />
											)}

											<Cloud className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", read ? "text-gray-400" : "text-[var(--primary)]")} aria-hidden />

											<div className="min-w-0 flex-1 pl-0.5">
												<div className="flex items-start justify-between gap-1">
													<p className={cn(
														"text-[11px] leading-tight",
														read ? "font-medium text-gray-500 dark:text-gray-400" : "font-bold text-gray-900 dark:text-gray-100"
													)}>
														{n.location ? (
															<>
																{n.location.subdistrict_name}
																<span className={cn("font-normal", read ? "text-gray-400" : "text-gray-500 dark:text-gray-400")}>
																	{" "}· {n.location.district_name}
																</span>
															</>
														) : (
															n.content.title
														)}
													</p>
													{/* Seen indicator */}
													{read
														? <CheckCheck className="h-3.5 w-3.5 shrink-0 text-blue-400 dark:text-blue-400" aria-label="Seen" />
														: <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-[var(--primary)]" aria-label="Unread" />
													}
												</div>
												<p className={cn(
													"mt-0.5 line-clamp-2 text-[10px] leading-snug",
													read ? "text-gray-400 dark:text-gray-500" : "text-gray-600 dark:text-gray-400"
												)}>
													{bodyPreview(n.content.body)}
												</p>
												{n.location && n.location.distance_km != null && (
													<p className="mt-0.5 text-[9px] text-gray-400 dark:text-gray-500">
														{n.location.distance_km === 0
															? t("notifications.yourArea") as string
															: (t("notifications.kmAway") as string).replace("[km]", n.location.distance_km.toFixed(1))}
													</p>
												)}
											</div>
										</button>
									);
								})}
							</div>
						) : (
							<div className="flex flex-col items-center justify-center py-6 text-center">
								<img src={bellIcon} alt="" className="h-10 w-10 opacity-30" aria-hidden />
								{localStorage.getItem("user_location") ? (
									<>
										<p className="mt-2 text-xs font-semibold text-gray-500 dark:text-gray-400">
											{t("notifications.noNotificationsTitle") as string}
										</p>
										<p className="mt-1 px-2 text-[10px] leading-snug text-gray-400 dark:text-gray-500">
											{t("notifications.noNotificationsBody") as string}
										</p>
									</>
								) : (
									<>
										<p className="mt-2 text-xs font-semibold text-gray-500 dark:text-gray-400">
											{t("notifications.noLocationTitle") as string}
										</p>
										<p className="mt-1 px-2 text-[10px] leading-snug text-gray-400 dark:text-gray-500">
											{t("notifications.noLocationBody") as string}
										</p>
									</>
								)}
							</div>
						)}
					</div>

					{notifications.length > 0 && unreadCount > 0 && (
						<div className="border-t border-gray-100 px-2 py-1.5 dark:border-gray-800">
							<Button
								variant="outline"
								size="sm"
								className="h-7 w-full rounded-full text-[10px]"
								onClick={markAllRead}
							>
								<CheckCheck className="mr-1.5 h-3 w-3" />
								{t("notifications.markAllRead") as string}
							</Button>
						</div>
					)}
				</PopoverContent>
			</Popover>

			{/* Detail sheet */}
			<Sheet
				open={detailOpen}
				onOpenChange={(open) => {
					setDetailOpen(open);
					if (!open && !feedbackModalOpen) setSelected(null);
				}}
			>
				<SheetContent
					side="right"
					className={cn(
						"z-[110] flex h-full max-h-dvh flex-col gap-0 overflow-hidden p-0",
						"w-[min(24rem,calc(100vw-1rem))] max-w-[min(24rem,calc(100vw-1rem))]",
						"border-l border-gray-200 bg-white shadow-[-8px_0_40px_rgba(15,23,42,0.14)]",
						"dark:border-[var(--border-dark)] dark:bg-[var(--background-dark)]"
					)}
				>
					{selected && (
						<>
							{/* ── Header ── */}
							<SheetHeader className="shrink-0 space-y-0 border-b border-gray-200 bg-white px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] dark:border-[var(--border-dark)] dark:bg-[var(--headerBg-dark)]">
								<div className="flex items-start justify-between gap-3">
									<div className="flex min-w-0 flex-1 items-start gap-3">
										<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-950/50">
											<Cloud className="h-5 w-5 text-[var(--primary)]" aria-hidden />
										</div>
										<div className="min-w-0">
											<SheetTitle className="text-left text-base font-bold leading-snug text-gray-900 dark:text-[var(--headerText-dark)]">
												{selected.location ? selected.location.subdistrict_name : selected.content.title}
											</SheetTitle>
											<SheetDescription className="mt-0.5 text-left text-xs leading-snug text-gray-600 dark:text-gray-400">
												{selected.location
													? `${selected.location.district_name}, ${selected.location.state_name}`
													: selected.type}
											</SheetDescription>
										</div>
									</div>
									<Button
										type="button"
										variant="ghost"
										size="icon"
										className="h-9 w-9 shrink-0 rounded-full text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
										onClick={() => setDetailOpen(false)}
										aria-label="Close"
									>
										<X className="h-5 w-5" />
									</Button>
								</div>
							</SheetHeader>

							{/* ── Forecast body ── */}
							<div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5">
								{(() => {
									const paras = unescapeNewlines(selected.content.body).split(/\n\n+/).map(p => p.trim()).filter(Boolean);
									const pleaseNoteLabel = String(t("notifications.pleaseNote")).toLowerCase();
									const isNotePara = (p: string) => {
										const lower = p.toLowerCase();
										return lower.startsWith("please note") || lower.startsWith(pleaseNoteLabel);
									};
									const mainParas = paras.filter(p => !isNotePara(p) && !p.startsWith("("));
									const infoLine = paras.find(p => p.startsWith("("));
									const noteParas = paras.filter(p => isNotePara(p));
									const escapedLabel = pleaseNoteLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
									const noteItems = noteParas.map(p => p.replace(new RegExp(`^(please note|${escapedLabel})[:\\s]*`, "i"), "").trim());

									return (
										<div className="space-y-4">
											{/* Main forecast paragraphs */}
											{mainParas.map((para, i) => (
												<p key={i} className="text-sm leading-relaxed text-gray-700 dark:text-gray-300">
													{para}
												</p>
											))}

											{/* Info line (parenthetical) */}
											{infoLine && (
												<p className="text-[11px] italic text-gray-400 dark:text-gray-500">
													{infoLine}
												</p>
											)}

											{/* Single note block with all note paragraphs */}
											{noteItems.length > 0 && (
												<div className="rounded-xl bg-amber-50 px-4 py-3 ring-1 ring-amber-100 dark:bg-amber-950/30 dark:ring-amber-900/40">
													<p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
														{t("notifications.pleaseNote") as string}
													</p>
													<div className="space-y-2">
														{noteItems.map((note, i) => (
															<p key={i} className="text-xs leading-relaxed text-amber-900 dark:text-amber-200">
																{note}
															</p>
														))}
													</div>
												</div>
											)}
										</div>
									);
								})()}
							</div>

							{/* ── Feedback footer ── */}
							<div className="shrink-0 border-t border-gray-100 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-900/30 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
								{feedbackMap[selected.notification_id] ? (
									<div className="flex items-center justify-center gap-2 py-1">
										<span className="text-lg">
											{feedbackMap[selected.notification_id] === "liked" ? "👍" : "👎"}
										</span>
										<p className="text-sm font-medium text-gray-500 dark:text-gray-400">
											{feedbackMap[selected.notification_id] === "liked"
												? t("notifications.feedbackLiked") as string
												: t("notifications.feedbackDisliked") as string}
										</p>
									</div>
								) : (
									<div className="flex items-center justify-between gap-4">
										<p className="text-sm font-semibold text-gray-600 dark:text-gray-300">
											{t("notifications.wasHelpful") as string}
										</p>
										<div className="flex items-center gap-2">
											<button
												type="button"
												onClick={() => {
													apiService.trackUiTelemetryEvent({
														event_name: "notification_feedback_yes",
														category: "notification_feedback",
														metadata: {
															notification_id: selected.notification_id
														}
													});
													setFeedbackMap((p) => ({ ...p, [selected.notification_id]: "liked" }));
												}}
												className="flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-500 shadow-sm transition-all hover:border-green-400 hover:bg-green-50 hover:text-green-600 hover:shadow-none active:scale-95 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-green-700 dark:hover:bg-green-950/50 dark:hover:text-green-400"
												aria-label="Helpful"
											>
												<ThumbsUp className="h-3.5 w-3.5" />
												Yes
											</button>
											<button
												type="button"
												onClick={() => {
													apiService.trackUiTelemetryEvent({
														event_name: "notification_feedback_no",
														category: "notification_feedback",
														metadata: {
															notification_id: selected.notification_id
														}
													});
													setFeedbackTarget(selected);
													setDetailOpen(false);
													setFeedbackModalOpen(true);
												}}
												className="flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-500 shadow-sm transition-all hover:border-red-400 hover:bg-red-50 hover:text-red-500 hover:shadow-none active:scale-95 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-red-700 dark:hover:bg-red-950/50 dark:hover:text-red-400"
												aria-label="Not helpful"
											>
												<ThumbsDown className="h-3.5 w-3.5" />
												No
											</button>
										</div>
									</div>
								)}
							</div>
						</>
					)}
				</SheetContent>
			</Sheet>
			<NotificationFeedbackModal
				open={feedbackModalOpen}
				onClose={() => {
					setFeedbackModalOpen(false);
					setFeedbackTarget(null);
					setSelected(null);
				}}
				onSubmit={(reason: NotificationFeedbackReason, message: string) => {
					if (!feedbackTarget) return;
					apiService.trackUiTelemetryEvent({
						event_name: "notification_feedback_dislike_submitted",
						category: "notification_feedback",
						metadata: {
							notification_id: feedbackTarget.notification_id,
							reason,
							feedback: message
						}
					});
					setFeedbackMap((previous) => ({ ...previous, [feedbackTarget.notification_id]: "disliked" }));
					setFeedbackModalOpen(false);
					setFeedbackTarget(null);
					setSelected(null);
				}}
			/>
		</>
	);
}
