const DELAYS_MS = [0, 150, 300];

/**
 * Old "assistant is typing" indicator (80adef9 src/components/ChatMessage.tsx:324-341): three
 * bouncing dots in `bg-current`, so they follow the theme's text colour.
 */
export function TypingDots() {
	return (
		<div className="flex h-6 items-center justify-start space-x-2 px-1 pt-2 text-primary" role="status">
			{DELAYS_MS.map((delay) => (
				<div
					key={delay}
					data-typing-dot=""
					className="h-2 w-2 animate-bounce rounded-full bg-current"
					style={{ animationDelay: `${delay}ms` }}
				/>
			))}
		</div>
	);
}
