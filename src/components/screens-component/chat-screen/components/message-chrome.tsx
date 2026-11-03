import { ReactNode } from "react";
import { BotMessageSquare } from "lucide-react";
import { MessageRole } from "./bubbles/chat-types";
import { useAuthStore } from "@/hooks/store/auth";
import { useIsMobile } from "@/hooks/use-mobile";
import { getUsername } from "@/lib/url-identity";
import { getInitials } from "@/bihar/initials";

type MessageChromeProps = {
	role: MessageRole;
	children: ReactNode;
	/** Show the avatar beside the bubble (no name labels are rendered). */
	showLabel?: boolean;
};

// Old-UI chrome (80adef9 src/components/ChatMessage.tsx): avatar beside the bubble, no name label.
// User: initials from the boot `?username=`, falling back to the signed-in user. Assistant: a bot
// icon on desktop, nothing on mobile.
export function MessageChrome({ role, children, showLabel = true }: MessageChromeProps) {
	const isUser = role === "user";
	const user = useAuthStore((s) => s.user);
	const isMobile = useIsMobile();

	if (isUser) {
		const initials = getInitials(getUsername() || user?.username || user?.name);
		return (
			<div className="mb-4 flex w-full min-w-0 items-start justify-end gap-2 pr-1">
				<div className="flex min-w-0 flex-col items-end">{children}</div>
				{showLabel && (
					<div
						data-avatar="user"
						className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary"
					>
						{initials}
					</div>
				)}
			</div>
		);
	}

	// Assistant / System
	return (
		<div className="flex w-full min-w-0 items-start gap-2 pl-1">
			{showLabel && !isMobile && (
				<div
					data-avatar="bot"
					className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
				>
					<BotMessageSquare className="h-4 w-4" aria-hidden="true" />
				</div>
			)}
			<div className="w-full min-w-0">{children}</div>
		</div>
	);
}
