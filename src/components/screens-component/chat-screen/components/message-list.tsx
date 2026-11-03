import { useEffect, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageChrome } from "./message-chrome";
import { ChatMessage } from "./bubbles/chat-types";
import { Bubble } from "./bubbles";
import { TypingDots } from "@/bihar/typing-dots";

type MessageListProps = {
	messages: ChatMessage[];
	isAssistantTyping?: boolean;
	welcome?: React.ReactNode;
	onQuickReply?: (payload: string) => void;
};

export function MessageList(props: MessageListProps) {
	const lastMessageRef = useRef<HTMLDivElement | null>(null);
	const containerRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		if (props.messages.length > 0) {
			// Small timeout to allow DOM to update fully
			setTimeout(() => {
				lastMessageRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
			}, 100);
		} else {
			// Scroll to top when there are no messages (WelcomePanel visible)
			const scrollArea = containerRef.current?.closest("[data-radix-scroll-area-viewport]");
			if (scrollArea) {
				scrollArea.scrollTo({ top: 0, behavior: "smooth" });
			}
		}
	}, [props.messages.length, props.isAssistantTyping]);

	return (
		<ScrollArea className="h-full">
			<div ref={containerRef} className="mx-auto flex w-full flex-col gap-3 px-2 pt-3 pb-14 sm:px-4 lg:w-3/4">
				{props.welcome}
				{props.messages.map((m, i) => (
					<div key={m.id} ref={i === props.messages.length - 1 ? lastMessageRef : null} className="w-full">
						<Bubble message={m} onQuickReply={props.onQuickReply} />
					</div>
				))}
				{props.isAssistantTyping && props.messages[props.messages.length - 1]?.role !== "assistant" ? (
					<MessageChrome role="assistant" showLabel={true}>
						<TypingDots />
					</MessageChrome>
				) : null}
			</div>
		</ScrollArea>
	);
}
