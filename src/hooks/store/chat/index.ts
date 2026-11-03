import { create } from "zustand";
import type {
	ChatMessage,
	TextMessage
} from "@/components/screens-component/chat-screen/components/bubbles/chat-types";
import { LANGUAGES, type LanguageCode } from "@/components/screens-component/chat-screen/config";

import {
	fetchSuggestions,
	type Suggestion
} from "@/components/screens-component/chat-screen/api/suggestions-api";
import apiService from "@/lib/api-service";
import { getFingerprintId } from "@/lib/utils";
import { shuffle, randomPick } from "@/lib/qa-utils";
import type { ToastType } from "@/components/screens-component/chat-screen/components/toast";
import { environment } from "@/lib/config/environment";
import { neutralizeHtmlMarkup } from "@/lib/security/html";
import { sunbirdAnswer, sunbirdChunk, sunbirdError, sunbirdFeedback, sunbirdQuestion } from "@/lib/sunbird-telemetry/chat-hooks";

export type ApiNotification = {
	notification_id: string;
	type: string;
	priority: "HIGH" | "MEDIUM" | "LOW";
	valid_from: string;
	valid_to: string;
	created_at: string;
	content: { title: string; body: string };
	location: {
		subdistrict_name: string;
		district_name: string;
		state_name: string;
		distance_km?: number;
	} | null;
	metadata: {
		source: string;
		template: string;
		unique_id_iitm: string;
		unique_id_pm_kisan: number;
	};
};

export const SEEN_NOTIFICATIONS_KEY = "seen_notification_ids";

export type PxDWeatherRecord = {
	unique_id_pm_kisan: number;
	unique_id_iitm: number;
	subdistrict_code: number;
	subdistrict_name: string;
	district_code: number;
	district_name: string;
	state_code: number;
	state_name: string;
	lang_abb: string;
	forecast_message: string;
	template_abbreviation: string;
	Lat: number;
	Lon: number;
};

export type WeatherForecastMatch = PxDWeatherRecord & {
	distanceKm: number;
	/** True local matches (ST_DWithin-style). False = KNN fallback when user is outside covered lat/lon extent. */
	isWithinSearchRadius: boolean;
};

export type QuickAction = {
	id: string;
	title: string;
	description: string;
	icon:
		| "tractor"
		| "wheat"
		| "cow"
		| "cloud"
		| "money"
		| "document"
		| "insurance"
		| "alert"
		| "bank"
		| "search"
		| "soil"
		| "card";
	prompt: string;
};

type FetchLocationOptions = {
	trackBrowserDecision?: boolean;
};

type ChatStore = {
	messages: ChatMessage[];
	quickActions: QuickAction[];
	draft: string;
	suggestions: Suggestion[];
	isAssistantTyping: boolean;
	isInputLocked: boolean;
	isListening: boolean;
	isTranscribing: boolean;
	isFetchingSuggestions: boolean;
	sessionId: string | null;
	initializeSession: (user: any) => Promise<void>;
	sendText: (text: string, language: string, t?: any) => Promise<void>;
	sendAudio: (blob: Blob, sessionId: string, language: string) => Promise<void>;
	sendImage: (imageFile: File, language: string, t?: any) => Promise<void>;
	sendQuickAction: (id: string, language: string, t?: any) => void;
	sendQuickReply: (payload: string, language: string, t?: any) => void;
	retryLastMessage: (language: string, t?: any) => void;
	setDraft: (value: string) => void;
	startListening: () => void;
	stopListening: () => void;
	clearChat: () => void;
	setIsTranscribing: (value: boolean) => void;
	setSuggestions: (suggestions: Suggestion[]) => void;
	clearSuggestions: () => void;
	fetchSuggestionsForMessage: (messageId: string) => Promise<void>;
	generateQuickActions: (t: any) => void;
	playTTS: (text: string, language: string, messageId: string) => Promise<void>;
	pauseTTS: () => void;
	resumeTTS: () => Promise<void>;
	stopTTS: () => void;
	currentlyPlayingId: string | null;
	ttsStatus: "playing" | "paused" | "stopped";
	submitMessageFeedback: (
		messageId: string,
		isPositive: boolean,
		reason?: string,
		feedback?: string
	) => Promise<void>;
	toast: { message: string; type: ToastType } | null;
	setToast: (toast: { message: string; type: ToastType } | null) => void;
	fetchLocation: (t?: any, options?: FetchLocationOptions) => Promise<void>;
	weatherForecastMatches: WeatherForecastMatch[];
	notifications: ApiNotification[];
	isFetchingNotifications: boolean;
	fetchNotifications: () => Promise<void>;
	markNotificationRead: (id: string) => void;
};
const quickActionSeeds: QuickAction[] = [
	{
		id: "1",
		title: "What is the treatment for Mastitis in cow?",
		description: "",
		icon: "cow",
		prompt: "What is the treatment for Mastitis in cow?"
	},
	{
		id: "2",
		title: "What is the today’s price of amaranth in APMC Mumbai?",
		description: "",
		icon: "wheat",
		prompt: "What is the today’s price of amaranth in APMC Mumbai?"
	},
	{
		id: "3",
		title: "What is the ideal irrigation schedule for muskmelon?",
		description: "",
		icon: "cloud",
		prompt: "What is the ideal irrigation schedule for muskmelon?"
	}
];

const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;
const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/jpg"]);
const NORMALIZED_IMAGE_MIME = "image/jpeg";
const NORMALIZED_IMAGE_EXTENSION = ".jpg";
const MAX_IMAGE_DIMENSION = 1600;
const JPEG_QUALITY = 0.82;

function isSupportedImageType(file: File): boolean {
	const fileType = file.type.toLowerCase();
	if (SUPPORTED_IMAGE_TYPES.has(fileType)) return true;

	const fileName = file.name.toLowerCase();
	return fileName.endsWith(".jpg") || fileName.endsWith(".jpeg") || fileName.endsWith(".png");
}

function replaceFileExtension(fileName: string, extension: string): string {
	const trimmedName = fileName.trim();
	if (!trimmedName) {
		return `crop-image${extension}`;
	}

	const dotIndex = trimmedName.lastIndexOf(".");
	if (dotIndex <= 0) {
		return `${trimmedName}${extension}`;
	}

	return `${trimmedName.slice(0, dotIndex)}${extension}`;
}

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const imageUrl = URL.createObjectURL(file);
		const image = new Image();

		image.onload = () => {
			URL.revokeObjectURL(imageUrl);
			resolve(image);
		};

		image.onerror = () => {
			URL.revokeObjectURL(imageUrl);
			reject(new Error("Failed to load image for normalization."));
		};

		image.src = imageUrl;
	});
}

async function normalizeImageForUpload(file: File): Promise<File> {
	const image = await loadImageFromFile(file);
	const width = image.naturalWidth || image.width;
	const height = image.naturalHeight || image.height;
	if (!width || !height) {
		throw new Error("Invalid image dimensions.");
	}

	const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(width, height));
	const targetWidth = Math.max(1, Math.round(width * scale));
	const targetHeight = Math.max(1, Math.round(height * scale));

	const canvas = document.createElement("canvas");
	canvas.width = targetWidth;
	canvas.height = targetHeight;

	const context = canvas.getContext("2d");
	if (!context) {
		throw new Error("Canvas is unavailable for image normalization.");
	}

	context.drawImage(image, 0, 0, targetWidth, targetHeight);

	const blob = await new Promise<Blob>((resolve, reject) => {
		canvas.toBlob((result) => {
			if (result) {
				resolve(result);
				return;
			}

			reject(new Error("Failed to normalize image for upload."));
		}, NORMALIZED_IMAGE_MIME, JPEG_QUALITY);
	});

	return new File([blob], replaceFileExtension(file.name, NORMALIZED_IMAGE_EXTENSION), {
		type: NORMALIZED_IMAGE_MIME,
		lastModified: Date.now()
	});
}

function makeUserMessage(text: string): TextMessage {
	return {
		id: crypto.randomUUID(),
		role: "user",
		type: "text",
		text,
		status: "sent",
		createdAt: new Date().toISOString()
	};
}

function makeAssistantMessage(
	text: string,
	isError?: boolean,
	showListenRow = false,
	qid?: string,
	failedUserText?: string,
	failedLanguage?: string,
	responseLanguage?: LanguageCode
): ChatMessage {
	return {
		id: crypto.randomUUID(),
		role: "assistant",
		type: "card",
		qid,
		body: text,
		createdAt: new Date().toISOString(),
		showListenRow,
		isError,
		failedUserText,
		failedLanguage,
		responseLanguage
	};
}

function getResponseLanguage(language: string): LanguageCode | undefined {
	return language in LANGUAGES ? (language as LanguageCode) : undefined;
}

function getErrorQid(error: unknown): string | undefined {
	const qid = (error as { qid?: unknown })?.qid;
	return typeof qid === "string" && qid.trim() ? qid : undefined;
}

function warnMissingBackendQid(context: string, fallbackQid: string) {
	console.warn(`Backend did not return X-QID for ${context}; using message id fallback for telemetry`, {
		fallbackQid
	});
}

function attachQidToLatestAssistantMessage(messages: ChatMessage[], qid?: string): ChatMessage[] {
	if (!qid) return messages;

	for (let index = messages.length - 1; index >= 0; index--) {
		const message = messages[index];
		if (message?.role === "assistant" && message.type === "card") {
			const updated = [...messages];
			updated[index] = { ...message, qid };
			return updated;
		}
	}

	return messages;
}

function makeImageMessage(imageUrl: string, caption?: string): ChatMessage {
	return {
		id: crypto.randomUUID(),
		role: "user",
		type: "image",
		imageUrl,
		caption,
		createdAt: new Date().toISOString()
	};
}

import { playTTS as playTTSHelper, pauseAudio, resumeAudio, stopAudio } from "@/lib/audio-utils";

let locationFetchPromise: Promise<void> | null = null;
let hasResolvedLocationAttempt = false;

export const useChatStore = create<ChatStore>((set, get) => ({
	messages: [],
	quickActions: quickActionSeeds,
	draft: "",
	suggestions: [],
	isAssistantTyping: false,
	isInputLocked: false,
	isListening: false,
	isTranscribing: false,
	isFetchingSuggestions: false,
	sessionId: null,
	toast: null,
	currentlyPlayingId: null,
	ttsStatus: "stopped",
	weatherForecastMatches: [],
	notifications: [],
	isFetchingNotifications: false,

	setToast: (toast) => set({ toast }),
	initializeSession: async (_user) => {
		const sid = crypto.randomUUID();
		set({ sessionId: sid });
		apiService.setSessionId(sid);
	},

	setDraft: (value) => set(() => ({ draft: value })),

	fetchLocation: (t, options) => {
		if (typeof window === "undefined" || !navigator.geolocation) {
			set({
				toast: {
					message: t ? String(t("toast.locationNotSupported.description")) : "Your browser does not support geolocation.",
					type: "error"
				}
			});
			return Promise.resolve();
		}

		if (apiService.getLocationData() || hasResolvedLocationAttempt) {
			return Promise.resolve();
		}

		if (locationFetchPromise) {
			return locationFetchPromise;
		}

		locationFetchPromise = new Promise<void>((resolve) => {
			navigator.geolocation.getCurrentPosition(
				(position) => {
					const latitude = position.coords.latitude;
					const longitude = position.coords.longitude;
					apiService.setLocationData({
						latitude,
						longitude,
					});
					localStorage.setItem(
						"user_location",
						JSON.stringify({ latitude, longitude, timestamp: Date.now() })
					);
					if (!options?.trackBrowserDecision) {
						apiService.trackUiTelemetryEvent({
							event_name: "location_allowed",
							category: "location",
							metadata: { action: "allow" }
						});
					}
					if (options?.trackBrowserDecision) {
						apiService.trackUiTelemetryEvent({
							event_name: "location_browser_allowed",
							category: "location",
							metadata: { action: "allow" }
						});
					}
					hasResolvedLocationAttempt = true;
					locationFetchPromise = null;
					void get().fetchNotifications();
					resolve();
				},
				(error) => {
					const key =
						error.code === error.PERMISSION_DENIED
							? "toast.locationPermissionDenied.description"
							: error.code === error.TIMEOUT
								? "toast.locationTimeout.description"
								: error.code === error.POSITION_UNAVAILABLE
									? "toast.locationUnavailable.description"
									: "toast.locationError.description";

					if (options?.trackBrowserDecision) {
						void navigator.permissions?.query({ name: "geolocation" }).then((result) => {
							if (result.state === "denied") {
								apiService.trackUiTelemetryEvent({
									event_name: "location_browser_never_allow",
									category: "location",
									metadata: { action: "deny" }
								});
							}
						}).catch(() => undefined);
					}

					hasResolvedLocationAttempt = true;
					locationFetchPromise = null;
					set({
						toast: {
							message: t ? String(t(key)) : "Could not get your location.",
							type: "error"
						}
					});
					resolve();
				},
				{
					enableHighAccuracy: false,
					timeout: 10000,
					maximumAge: 300000,
				}
			);
		});

		return locationFetchPromise;
	},

	fetchNotifications: async () => {
		if (get().isFetchingNotifications) return;
		const locationRaw = localStorage.getItem("user_location");
		if (!locationRaw) return;

		set({ isFetchingNotifications: true });

		let latitude: number;
		let longitude: number;
		try {
			({ latitude, longitude } = JSON.parse(locationRaw));
		} catch {
			set({ isFetchingNotifications: false });
			return;
		}

		let visitor_id = "unknown";
		try {
			visitor_id = (await getFingerprintId()) || "unknown";
		} catch {
			// Keep fallback visitor id.
		}

		const lang = localStorage.getItem("app_language") || "en";
		const seenRaw = localStorage.getItem(SEEN_NOTIFICATIONS_KEY);
		const seen_message_ids: string[] = seenRaw ? JSON.parse(seenRaw) : [];

		const body: Record<string, unknown> = { visitor_id, lat: latitude, lon: longitude, lang };
		if (seen_message_ids.length > 0) {
			body.seen_message_ids = seen_message_ids;
		}

		try {
			const res = await fetch(`${environment.notificationApiUrl}/notification`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			let responseBody: unknown = null;
			try {
				responseBody = await res.clone().json();
			} catch {
				try {
					responseBody = await res.clone().text();
				} catch {
					responseBody = null;
				}
			}

			apiService.trackUiTelemetryEvent({
				event_name: "notification_api_response",
				category: "notification",
				metadata: {
					status_code: res.status,
					success: res.ok,
					response: responseBody
				}
			});
			if (!res.ok) return;
			const data = responseBody as { success: boolean; notifications: ApiNotification[] };
			if (data.success && Array.isArray(data.notifications)) {
				set({ notifications: data.notifications });
			}
		} catch {
			// Keep previous notifications on request failure.
		} finally {
			set({ isFetchingNotifications: false });
		}
	},

	markNotificationRead: (id: string) => {
		const seenRaw = localStorage.getItem(SEEN_NOTIFICATIONS_KEY);
		const seen: string[] = seenRaw ? JSON.parse(seenRaw) : [];
		if (!seen.includes(id)) {
			localStorage.setItem(SEEN_NOTIFICATIONS_KEY, JSON.stringify([...seen, id]));
		}
	},

	setIsTranscribing: (value) => set(() => ({ isTranscribing: value })),
	setSuggestions: (suggestions) => set({ suggestions }),
	clearSuggestions: () => set({ suggestions: [] }),

	startListening: () => {
		get().stopTTS();
		set(() => ({ isListening: true }));
	},
	stopListening: () => set(() => ({ isListening: false })),

	clearChat: () =>
		set(() => ({
			messages: [],
			draft: "",
			suggestions: [],
			isAssistantTyping: false,
			isInputLocked: false,
			isListening: false,
			isTranscribing: false,
			isFetchingSuggestions: false
		})),

	sendText: async (text, language, t) => {
		const trimmed = text.trim();
		if (!trimmed) return;
		const safeText = neutralizeHtmlMarkup(trimmed);
		const responseLanguage = getResponseLanguage(language);

		get().stopTTS();
		await get().fetchLocation(t);

		const userMessage = makeUserMessage(safeText);
		set((state) => ({
			messages: [...state.messages, userMessage],
			draft: "",
			suggestions: [],
			isAssistantTyping: true,
			isInputLocked: true
		}));

		const { sessionId } = get();
		const currentSession = sessionId || crypto.randomUUID();
		if (!sessionId) {
			set({ sessionId: currentSession });
			apiService.setSessionId(currentSession);
		}
		const sunbirdQid = sunbirdQuestion(currentSession, safeText);

		try {
			// In a real app we'd detect language, here we use what's passed
			let streamingText = "";

			const response = await apiService.sendUserQuery(
				safeText,
				currentSession,
				language, // source
				language, // target
				(chunk) => {
					sunbirdChunk(sunbirdQid);
					streamingText += chunk;
					set((state) => {
						const lastMsg = state.messages[state.messages.length - 1];
						if (lastMsg && lastMsg.role === "assistant" && lastMsg.type === "card") {
							return {
								messages: [...state.messages.slice(0, -1), { ...lastMsg, body: streamingText, showListenRow: true, responseLanguage }],
								isAssistantTyping: false
							};
						} else {
							return {
								messages: [
									...state.messages,
									makeAssistantMessage(streamingText, false, true, undefined, undefined, undefined, responseLanguage)
								],
								isAssistantTyping: false
							};
						}
					});
				}
				// Note: input stays locked until sendUserQuery fully resolves (after all stream chunks)
			);

			set((state) => ({
				messages: attachQidToLatestAssistantMessage(state.messages, response.qid),
				isAssistantTyping: false,
				isInputLocked: false
			}));
			sunbirdAnswer({ qid: sunbirdQid, sessionId: currentSession, questionText: safeText, answerText: streamingText, messageId: get().messages.findLast((m) => m.role === "assistant")?.id, backendQid: response.qid });

			if (!environment.suggestionsDisabled) {
				const suggestions = await apiService.getSuggestions(currentSession, language);
				set({
					suggestions: suggestions.map((s) => ({
						id: crypto.randomUUID(),
						text: s.question,
						label: s.question
					}))
				});
			}
		} catch (error: any) {
			console.error("Error sending text:", error);
			set({ isAssistantTyping: false, isInputLocked: false });

			const isRateLimitError =
				error?.status === 429 ||
				error?.response?.status === 429 ||
				(error instanceof Error && error.message.includes("Rate limit"));
			sunbirdError(sunbirdQid, currentSession, error, isRateLimitError);

			if (isRateLimitError) {
				const limitMessage = t
					? t("limitMessage")
					: "Dear user, you have reached the allotted question limit for today. You may continue to explore the other features of the Bharat-VISTAAR app.";
				set((state) => ({
					messages: (() => {
						const backendQid = getErrorQid(error);
						const message = makeAssistantMessage(limitMessage, true, true, backendQid, undefined, undefined, responseLanguage);
						if (!backendQid) warnMissingBackendQid("text rate-limit error", message.id);
						return [...state.messages, message];
					})()
				}));
				const telemetryQid = getErrorQid(error) || get().messages.at(-1)?.id || "missing-qid";

				await apiService
					.submitTelemetryError({
						qid: telemetryQid,
						session_id: currentSession,
						error_text: "Rate limit error (429)",
						question_text: safeText
					})
					.catch((telemetryError) =>
						console.warn("Backend telemetry error relay failed", telemetryError)
					);
			} else {
				// Show error as an in-chat message with retry capability
				const errorMessage = t
					? t("chatErrorMessage") || "Sorry, there was an error processing your request. Please try again."
					: "Sorry, there was an error processing your request. Please try again.";
				set((state) => ({
					messages: (() => {
						const backendQid = getErrorQid(error);
						const message = makeAssistantMessage(
							errorMessage as string,
							true,
							false,
							backendQid,
							safeText,
							language,
							responseLanguage
						);
						if (!backendQid) warnMissingBackendQid("text chat error", message.id);
						return [...state.messages, message];
					})()
				}));
				const telemetryQid = getErrorQid(error) || get().messages.at(-1)?.id || "missing-qid";

				await apiService
					.submitTelemetryError({
						qid: telemetryQid,
						session_id: currentSession,
						error_text: String(error),
						question_text: safeText
					})
					.catch((telemetryError) =>
						console.warn("Backend telemetry error relay failed", telemetryError)
					);
			}
		}
	},

	fetchSuggestionsForMessage: async (messageId) => {
		set({ isFetchingSuggestions: true });
		try {
			const suggestions = await fetchSuggestions(messageId);
			set({ suggestions, isFetchingSuggestions: false });
		} catch (error) {
			console.error("Error fetching suggestions:", error);
			set({ isFetchingSuggestions: false });
			// set({ toast: { message: "Failed to load suggestions.", type: "error" } });
		}
	},

	sendImage: async (imageFile, language, t) => {
		if (!imageFile) return;
		const responseLanguage = getResponseLanguage(language);
		if (imageFile.size > MAX_IMAGE_SIZE_BYTES) {
			set({
				toast: {
					message: t ? String(t("imageUpload.imageTooLarge")) : "Image too large. Max 10 MB.",
					type: "error"
				}
			});
			return;
		}

		if (!isSupportedImageType(imageFile)) {
			set({
				toast: {
					message: t ? String(t("imageUpload.invalidFormat")) : "Invalid image format. Use JPEG or PNG.",
					type: "error"
				}
			});
			return;
		}

		get().stopTTS();
		await get().fetchLocation(t);

		let uploadFile = imageFile;
		try {
			uploadFile = await normalizeImageForUpload(imageFile);
		} catch (error) {
			console.error("Error normalizing image:", error);
			set({
				toast: {
					message: t ? String(t("imageUpload.processingFailed")) : "Could not process the image. Please try another photo.",
					type: "error"
				}
			});
			return;
		}

		if (uploadFile.size > MAX_IMAGE_SIZE_BYTES) {
			set({
				toast: {
					message: t ? String(t("imageUpload.imageTooLarge")) : "Image too large. Max 10 MB.",
					type: "error"
				}
			});
			return;
		}

		const imageUrl = URL.createObjectURL(uploadFile);
		const imageMessage = makeImageMessage(imageUrl, uploadFile.name);
		set((state) => ({
			messages: [...state.messages, imageMessage],
			suggestions: [],
			isAssistantTyping: true,
			isInputLocked: true
		}));

		const { sessionId } = get();
		const currentSession = sessionId || crypto.randomUUID();
		if (!sessionId) {
			set({ sessionId: currentSession });
			apiService.setSessionId(currentSession);
		}

		try {
			let streamingText = "";

			const response = await apiService.sendImageQuery(
				uploadFile,
				currentSession,
				language,
				language,
				(chunk) => {
					streamingText += chunk;
					set((state) => {
						const lastMsg = state.messages[state.messages.length - 1];
						if (lastMsg && lastMsg.role === "assistant" && lastMsg.type === "card") {
							return {
								messages: [...state.messages.slice(0, -1), { ...lastMsg, body: streamingText, showListenRow: true, responseLanguage }],
								isAssistantTyping: false
							};
						} else {
							return {
								messages: [
									...state.messages,
									makeAssistantMessage(streamingText, false, true, undefined, undefined, undefined, responseLanguage)
								],
								isAssistantTyping: false
							};
						}
					});
				}
				// Note: input stays locked until sendImageQuery fully resolves (after all stream chunks)
			);

			set((state) => ({
				messages: attachQidToLatestAssistantMessage(state.messages, response.qid),
				isAssistantTyping: false,
				isInputLocked: false
			}));

			if (!environment.suggestionsDisabled) {
				const suggestions = await apiService.getSuggestions(currentSession, language);
				set({
					suggestions: suggestions.map((s) => ({
						id: crypto.randomUUID(),
						text: s.question,
						label: s.question
					}))
				});
			}
		} catch (error: any) {
			console.error("Error sending image:", error);
			set({ isAssistantTyping: false, isInputLocked: false });

			const isRateLimitError =
				error?.status === 429 ||
				error?.response?.status === 429 ||
				(error instanceof Error && error.message.includes("Rate limit"));

			if (isRateLimitError) {
				const limitMessage = t
					? t("limitMessage")
					: "Dear user, you have reached the allotted question limit for today. You may continue to explore the other features of the Bharat-VISTAAR app.";
				set((state) => ({
					messages: (() => {
						const backendQid = getErrorQid(error);
						const message = makeAssistantMessage(limitMessage, true, true, backendQid, undefined, undefined, responseLanguage);
						if (!backendQid) warnMissingBackendQid("image rate-limit error", message.id);
						return [...state.messages, message];
					})()
				}));
				const telemetryQid = getErrorQid(error) || get().messages.at(-1)?.id || "missing-qid";

				await apiService
					.submitTelemetryError({
						qid: telemetryQid,
						session_id: currentSession,
						error_text: "Rate limit error (429)",
						question_text: `[Image] ${uploadFile.name}`
					})
					.catch((telemetryError) =>
						console.warn("Backend telemetry error relay failed", telemetryError)
					);
			} else {
				const errorMessage = t
					? t("imageUpload.analysisFailed") || "Sorry, there was an error analyzing your image. Please try again."
					: "Sorry, there was an error analyzing your image. Please try again.";
				set((state) => ({
					messages: (() => {
						const backendQid = getErrorQid(error);
						const message = makeAssistantMessage(
							errorMessage as string,
							true,
							false,
							backendQid,
							`[Image] ${uploadFile.name}`,
							language,
							responseLanguage
						);
						if (!backendQid) warnMissingBackendQid("image chat error", message.id);
						return [...state.messages, message];
					})()
				}));
				const telemetryQid = getErrorQid(error) || get().messages.at(-1)?.id || "missing-qid";

				await apiService
					.submitTelemetryError({
						qid: telemetryQid,
						session_id: currentSession,
						error_text: String(error),
						question_text: `[Image] ${uploadFile.name}`
					})
					.catch((telemetryError) =>
						console.warn("Backend telemetry error relay failed", telemetryError)
					);
			}
		}
	},

	sendAudio: async (blob, sessionId, language) => {
		if (!blob) return;

		set({ isTranscribing: true });

		try {
			// Convert raw MediaRecorder audio (WebM) to optimized WAV for ASR
			const AudioContextClass =
				window.AudioContext ||
				(window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
			const audioContext = new AudioContextClass();
			const arrayBuffer = await blob.arrayBuffer();
			const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

			// Create optimized WAV (16kHz, mono) - same as oan-ui-service
			const offlineContext = new OfflineAudioContext({
				numberOfChannels: 1,
				length: audioBuffer.duration * 16000,
				sampleRate: 16000
			});
			const source = offlineContext.createBufferSource();
			source.buffer = audioBuffer;
			source.connect(offlineContext.destination);
			source.start();
			const renderedBuffer = await offlineContext.startRendering();

			// Convert to WAV blob
			const numChannels = renderedBuffer.numberOfChannels;
			const sampleRate = renderedBuffer.sampleRate;
			const length = renderedBuffer.length;
			const bytesPerSample = 2;
			const blockAlign = numChannels * bytesPerSample;
			const byteRate = sampleRate * blockAlign;
			const dataSize = length * blockAlign;
			const wavBuffer = new ArrayBuffer(44 + dataSize);
			const view = new DataView(wavBuffer);

			// WAV header
			const writeStr = (offset: number, str: string) => {
				for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
			};
			writeStr(0, "RIFF");
			view.setUint32(4, 36 + dataSize, true);
			writeStr(8, "WAVE");
			writeStr(12, "fmt ");
			view.setUint32(16, 16, true);
			view.setUint16(20, 1, true);
			view.setUint16(22, numChannels, true);
			view.setUint32(24, sampleRate, true);
			view.setUint32(28, byteRate, true);
			view.setUint16(32, blockAlign, true);
			view.setUint16(34, 16, true);
			writeStr(36, "data");
			view.setUint32(40, dataSize, true);

			const channelData = renderedBuffer.getChannelData(0);
			for (let i = 0; i < length; i++) {
				const sample = Math.max(-1, Math.min(1, channelData[i]!));
				view.setInt16(
					44 + i * bytesPerSample,
					sample < 0 ? sample * 0x8000 : sample * 0x7fff,
					true
				);
			}

			const wavBlob = new Blob([wavBuffer], { type: "audio/wav" });
			const base64Audio = await apiService.blobToBase64(wavBlob);
			const transcription = await apiService.transcribeAudio(
				base64Audio,
				"bhashini",
				sessionId,
				language
			);

			if (transcription && transcription.text) {
				set((state) => ({
					draft: state.draft ? `${state.draft} ${transcription.text}` : transcription.text,
					isTranscribing: false
				}));
				set({ toast: { message: "Transcribed successfully", type: "success" } });
			} else {
				set({ isTranscribing: false });
			}
		} catch (error) {
			console.error("Transcription error:", error);
			set({ isAssistantTyping: false, isTranscribing: false });
			set({ toast: { message: "Transcription failed. Please try again.", type: "error" } });
			throw error;
		}
	},

	sendQuickAction: (id, language, t) => {
		const action = get().quickActions.find((qa) => qa.id === id);
		if (!action) return;
		get().sendText(action.prompt, language, t);
	},

	sendQuickReply: (payload, language, t) => {
		get().sendText(payload, language, t);
	},

	retryLastMessage: (language, t) => {
		const { messages } = get();
		// Find the last error message with retry info
		const lastErrorIdx = messages.findLastIndex(
			(m) => m.type === "card" && m.isError && (m as any).failedUserText
		);
		if (lastErrorIdx === -1) return;

		const errorMsg = messages[lastErrorIdx] as any;
		const textToRetry = errorMsg.failedUserText;
		const langToUse = errorMsg.failedLanguage || language;

		// Remove the error message from the list
		set((state) => ({
			messages: state.messages.filter((_, i) => i !== lastErrorIdx)
		}));

		// Also remove the corresponding user message (the one right before the error)
		set((state) => {
			const msgs = [...state.messages];
			// Find the last user message before where the error was
			for (let i = msgs.length - 1; i >= 0; i--) {
				if (msgs[i]!.role === "user" && msgs[i]!.type === "text" && (msgs[i] as any).text === textToRetry) {
					msgs.splice(i, 1);
					break;
				}
			}
			return { messages: msgs };
		});

		// Re-send the message
		get().sendText(textToRetry, langToUse, t);
	},

	generateQuickActions: (t) => {
		// Use questions from translations
		if (t("questions") && Array.isArray(t("questions")) && t("questions").length > 0) {
			const questions = t("questions") as Array<{ key: string; text: string; vars?: string[] }>;
			// Shuffle and select 3 random questions
			const selectedQuestions = shuffle([...questions]).slice(0, 3);

			// Substitute variable placeholders with random values from translations
			const resolveVars = (q: { key: string; text: string; vars?: string[] }): string => {
				let resolved = q.text;
				if (q.vars && q.vars.length > 0) {
					for (const varName of q.vars) {
						const values = t(`variables.${varName}`) as string[] | undefined;
						if (Array.isArray(values) && values.length > 0) {
							resolved = resolved.replace(`[${varName}]`, randomPick(values));
						}
					}
				}
				return resolved;
			};

			// Function to determine icon based on question key (dot notation)
			const getIconForKey = (
				key: string
			):
				| "tractor"
				| "wheat"
				| "cow"
				| "cloud"
				| "money"
				| "document"
				| "insurance"
				| "alert"
				| "bank"
				| "search"
				| "soil"
				| "card" => {
				const [category, subcategory, detail] = key.split(".");

				// Schemes category
				if (category === "schemes") {
					if (detail === "pm_kisan") return "money";
					if (detail === "kisan_credit_card") return "card";
					if (detail === "fasal_bima") return "insurance";
					if (detail === "soil_health_card") return "document";
					if (detail === "pmksy") return "document";
					if (detail === "enam_platform") return "wheat";
					if (detail === "seed_authentication") return "document";
					if (detail === "agriculture_fund") return "bank";
					if (detail === "coverage") return "insurance";
					if (subcategory === "general") return "tractor";
					if (subcategory === "insurance") return "insurance";
					return "tractor";
				}

				// Status category
				if (category === "status") {
					if (subcategory === "payment") return "money";
					if (subcategory === "claims") return "insurance";
					if (subcategory === "card") return "document";
					if (subcategory === "grievance") return "alert";
					return "search";
				}

				// Grievance category
				if (category === "grievance") {
					if (subcategory === "payment") return "money";
					if (subcategory === "claims") return "insurance";
					if (subcategory === "card") return "document";
					if (subcategory === "benefits") return "alert";
					return "alert";
				}

				// Soil category
				if (category === "soil") {
					return "soil";
				}

				// Loan category
				if (category === "loan") {
					return "bank";
				}

				// Mandi / market price category
				if (category === "mandi") {
					return "wheat";
				}

				// Weather category
				if (category === "weather") {
					return "cloud";
				}

				// Livestock and market
				if (category === "livestock") return "cow";
				if (category === "market") return "wheat";

				// Default to tractor for scheme-related app
				return "tractor";
			};

			// Create quick actions from selected questions with variable substitution
			const newActions: QuickAction[] = selectedQuestions.map((q, index) => {
				const resolvedText = resolveVars(q);
				return {
					id: `question-${index}`,
					title: resolvedText,
					description: "",
					icon: getIconForKey(q.key),
					prompt: resolvedText
				};
			});
			set({ quickActions: newActions });
		} else {
			// Fallback to seed questions if no questions in translations
			set({ quickActions: quickActionSeeds });
		}
	},

	playTTS: async (text, language, messageId) => {
		const { sessionId } = get();
		if (!sessionId) return;

		set({ currentlyPlayingId: messageId, ttsStatus: "playing" });

		try {
			await playTTSHelper(text, language, sessionId, () => {
				// Only reset if it's the SAME message that just finished
				if (get().currentlyPlayingId === messageId) {
					set({ currentlyPlayingId: null, ttsStatus: "stopped" });
				}
			});
		} catch (error) {
			console.error("TTS Playback failed:", error);
			set({ currentlyPlayingId: null, ttsStatus: "stopped" });
			set({ toast: { message: "Error Playing Audio. Please try again.", type: "error" } });
		}
	},

	pauseTTS: () => {
		pauseAudio();
		set({ ttsStatus: "paused" });
	},

	resumeTTS: async () => {
		try {
			await resumeAudio();
			set({ ttsStatus: "playing" });
		} catch (error) {
			console.error("TTS Resume failed:", error);
		}
	},

	stopTTS: () => {
		stopAudio();
		set({ currentlyPlayingId: null, ttsStatus: "stopped" });
	},

	submitMessageFeedback: async (messageId, isPositive, reason, feedback) => {
		const { sessionId, messages } = get();
		if (!sessionId) return;

		const msg = messages.find((m) => m.id === messageId);
		if (!msg) return;

		const userMsg = messages.findLast((m) => m.role === "user");
		const questionText = userMsg && userMsg.type === "text" ? userMsg.text : "";
		const responseText = msg && msg.type === "card" ? msg.body : "";
		const qid = msg.type === "card" ? msg.qid || messageId : messageId;
		if (msg.type !== "card" || !msg.qid) {
			warnMissingBackendQid("message feedback", qid);
		}
		const feedbackType = isPositive ? "like" : "dislike";
		const feedbackMsg = isPositive
			? "Liked the response"
			: feedback || reason || "Negative feedback";
		sunbirdFeedback({ messageId, fallbackQid: qid, sessionId, feedbackText: feedbackMsg, feedbackType, questionText, answerText: responseText });

		try {
			await apiService.submitTelemetryFeedback({
				qid,
				session_id: sessionId,
				message_id: messageId,
				feedback_type: feedbackType,
				feedback_text: feedbackMsg,
				question_text: questionText,
				answer_text: responseText
			});

			// Logic from user code: show success toast
			// if (isPositive) {
			// 	set({ toast: { message: "Thank you for your feedback! We're glad this response was helpful.", type: "success" } });
			// } else {
			// 	set({ toast: { message: "Thank you for your feedback. We'll use it to improve our responses.", type: "success" } });
			// }
		} catch (error) {
			console.error("Feedback telemetry error:", error);
			set({ toast: { message: "Failed to submit feedback. Please try again.", type: "error" } });
		}
	}
}));
