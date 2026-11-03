import { ChatHeader } from "@/components/screens-component/layouts/chat-header";
import { TickerVariant1, TickerVariant5 } from "@/components/screens-component/chat-screen/components/ticker-designs";
import { ChatInput, type ChatInputPayload } from "@/components/screens-component/chat-screen/components/chat-input";
import { env } from "@/config/env";
import { CHAT_USER } from "@/components/screens-component/chat-screen/config";
import { useChatStore } from "@/hooks/store/chat";
import { Outlet } from "@tanstack/react-router";
import { useLanguage } from "@/components/LanguageProvider";
import { useCallback, useState, useEffect } from "react";
import { Toast } from "@/components/screens-component/chat-screen/components/toast";
import { SettingsDrawer } from "@/components/screens-component/chat-screen/components/settings-drawer";
// import { LocationPermissionDialog } from "@/components/screens-component/chat-screen/components/location-permission-dialog";
import apiService from "@/lib/api-service";
import { BiharFooter } from "@/bihar/footer";

const ONE_DAY = 24 * 60 * 60 * 1000;

function getCachedLocation() {
	const cached = localStorage.getItem("user_location");
	if (!cached) return null;

	try {
		const parsed = JSON.parse(cached) as { latitude: number; longitude: number; timestamp: number };
		if (Date.now() - parsed.timestamp >= ONE_DAY) {
			return null;
		}
		return parsed;
	} catch {
		return null;
	}
}

function ChatLayout() {
	const sessionId = useChatStore((s) => s.sessionId);
	const clearChat = useChatStore((s) => s.clearChat);
	const draft = useChatStore((s) => s.draft);
	const setDraft = useChatStore((s) => s.setDraft);
	const sendText = useChatStore((s) => s.sendText);
	const sendAudio = useChatStore((s) => s.sendAudio);
	const sendImage = useChatStore((s) => s.sendImage);
	const isListening = useChatStore((s) => s.isListening);
	const isTranscribing = useChatStore((s) => s.isTranscribing);
	const isInputLocked = useChatStore((s) => s.isInputLocked);
	const startListening = useChatStore((s) => s.startListening);
	const stopListening = useChatStore((s) => s.stopListening);
	const suggestions = useChatStore((s) => s.suggestions);
	const messages = useChatStore((s) => s.messages);
	const toastData = useChatStore((s) => s.toast);
	const setToast = useChatStore((s) => s.setToast);
	const fetchLocation = useChatStore((s) => s.fetchLocation);

	const { language, t } = useLanguage();
	const [settingsOpen, setSettingsOpen] = useState(false);
	// const [showLocationPrompt, setShowLocationPrompt] = useState(false);

	useEffect(() => {
		const cachedLocation = getCachedLocation();
		if (cachedLocation) {
			apiService.setLocationData({
				latitude: cachedLocation.latitude,
				longitude: cachedLocation.longitude,
			});
			void useChatStore.getState().fetchNotifications();
		}

		navigator.permissions?.query({ name: "geolocation" }).then((result) => {
			if (result.state === "granted") {
				if (cachedLocation) {
					return;
				}
				fetchLocation();
			} else if (result.state === "prompt") {
				if (cachedLocation) {
					return;
				}
				// setShowLocationPrompt(true);
				fetchLocation(undefined, { trackBrowserDecision: true });
			}
			// "denied" — skip silently
		}).catch(() => {
			if (cachedLocation) {
				return;
			}
			// setShowLocationPrompt(true);
			fetchLocation(undefined, { trackBrowserDecision: true });
		});
	}, [fetchLocation]);

	const handleCloseToast = useCallback(() => {
		setToast(null);
	}, [setToast]);

	return (
		<div 
			className="flex h-svh w-full flex-col overflow-hidden text-foreground relative"
			style={{ background: 'var(--background)' }}
		>
			{toastData && (
				<Toast
					message={toastData.message}
					type={toastData.type}
					onClose={handleCloseToast}
				/>
			)}
			{/* Variant 5: Branded announcement hero at the top of the chatbot */}
			{env.uiTicker === 5 && <TickerVariant5 />}
			<ChatHeader
				title={t("appTitle") as string}
				subtitle="Government assistance and agriculture insights"
				rightAvatarUrl={CHAT_USER.avatar}
				rightLabel={CHAT_USER.name}
				onClearChat={clearChat}
				onOpenSettings={() => setSettingsOpen(true)}
				onBack={() => window.history.back()}
			/>
			{/* Variant 1: Original scrolling strip below the header */}
			{env.uiTicker === 1 && <TickerVariant1 inLayout />}
			{/* Only this area can scroll (via ChatShell/MessageList) */}
			<main className="min-h-0 flex-1 bg-transparent">
				<Outlet />
			</main>
			<div className="relative z-20">
				<ChatInput
					disabled={isInputLocked}
					placeholder={t("inputPlaceholder") as string}
					value={draft}
					onValueChange={setDraft}
					onSend={async (payload: ChatInputPayload) => {
						const { text, voice, files, mode } = payload;
						if (files && files.length > 0) {
							const imageFile = files[0];
							if (!imageFile) return;
							try {
								void mode;
								await sendImage(imageFile, language, t);
							} catch (error) {
								console.error(error);
							}
						} else if (text.trim()) {
							sendText(text, language, t);
						} else if (voice) {
							try {
								await sendAudio(voice, sessionId || '', language);
							} catch (error) {
								console.error(error);
							}
						}
					}}
					onVoiceStart={startListening}
					onVoiceStop={stopListening}
					isListening={isListening}
					isTranscribing={isTranscribing}
					suggestions={suggestions}
					onSuggestionClick={(text: string) => sendText(text, language, t)}
					micHint={messages.length > 0 ? undefined : (t("chatMicHint") as string)}
					footerNote={<BiharFooter />}
				/>
			</div>

			<SettingsDrawer
				open={settingsOpen}
				onOpenChange={setSettingsOpen}
			/>

			{/* Custom location permission popup disabled — using native browser prompt instead
			{showLocationPrompt && (
				<LocationPermissionDialog
					onAllow={() => {
						apiService.trackUiTelemetryEvent({
							event_name: "location_allowed",
							category: "location",
							metadata: {
								action: "allow"
							}
						});
						setShowLocationPrompt(false);
						fetchLocation(undefined, { trackBrowserDecision: true });
					}}
					onDismiss={(reason) => {
						apiService.trackUiTelemetryEvent({
							event_name: "location_denied",
							category: "location",
							metadata: {
								action: "deny",
								reason
							}
						});
						setShowLocationPrompt(false);
					}}
				/>
			)}
			*/}

		</div>
	);
}

export default ChatLayout;
