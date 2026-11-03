import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { visibleText } from "./test-i18n";

// P4.8.4 (doc 70 §2.2 User/Bot bubble, §3 Username avatar, §3.1 "Doc 50 #11"): no name labels
// ("Bharati" or the user's name) around bubbles; the user avatar shows initials from the boot
// `?username=` (url-identity) with the auth user as fallback, computed exactly like the old
// ChatMessage.getInitials (80adef9 src/components/ChatMessage.tsx:74-92); the assistant avatar is
// a bot icon on desktop and absent on mobile (old mobile bot answers had no avatar).
//
// Seams fixed here:
//   - `getInitials(name?: string): string` exported from `src/bihar/initials.ts`
//   - user avatar element carries `data-avatar="user"`, assistant avatar `data-avatar="bot"`
//     (the bot avatar contains an <svg> icon, e.g. lucide BotMessageSquare)
//   - MessageChrome reads `getUsername()` from `@/lib/url-identity` and `useIsMobile()` from
//     `@/hooks/use-mobile`

const state = vi.hoisted(() => ({
	urlUsername: undefined as string | undefined,
	mobile: false,
	user: null as null | { id: string; email: string; name?: string; username?: string }
}));

vi.mock("@/lib/url-identity", () => ({
	getUsername: () => state.urlUsername,
	getIntegrityToken: () => "",
	captureUrlIdentity: () => {},
	resetUrlIdentityForTests: () => {}
}));

vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => state.mobile }));

vi.mock("@/hooks/store/auth", () => ({
	useAuthStore: (selector?: (s: { user: typeof state.user }) => unknown) =>
		selector ? selector({ user: state.user }) : { user: state.user }
}));

vi.mock("@/contexts/AuthContext", () => ({
	useAuth: () => ({ user: state.user, isLoading: false })
}));

import { MessageChrome } from "@/components/screens-component/chat-screen/components/message-chrome";

interface InitialsModule {
	getInitials: (name?: string) => string;
}

const INITIALS_MODULE = "../../bihar/initials";

async function loadInitials(): Promise<InitialsModule> {
	return (await import(/* @vite-ignore */ INITIALS_MODULE)) as InitialsModule;
}

function render(role: "user" | "assistant"): string {
	return renderToStaticMarkup(
		<MessageChrome role={role}>
			<p>message body</p>
		</MessageChrome>
	);
}

beforeEach(() => {
	state.urlUsername = undefined;
	state.mobile = false;
	state.user = null;
});

describe("getInitials (old ChatMessage parity)", () => {
	it.each([
		["Ravi Pratap Singh Rajawat", "RP"],
		["ravi", "RA"],
		["  sunita   devi  ", "SD"],
		["Ravi%20Pratap", "RP"],
		["r", "R"],
		["", "U"],
		["   ", "U"],
		[undefined, "U"]
	])("getInitials(%j) -> %s", async (name, expected) => {
		const { getInitials } = await loadInitials();

		expect(getInitials(name)).toBe(expected);
	});

	it("does not throw on a name that is not valid URI encoding", async () => {
		const { getInitials } = await loadInitials();

		expect(getInitials("100% kisan")).toBe("1K");
	});
});

describe("MessageChrome: user (P4.8.4)", () => {
	it("shows initials from the boot ?username= and no name label", () => {
		state.urlUsername = "Ravi Pratap Singh Rajawat";
		state.user = { id: "u1", email: "", name: "Sunita Devi", username: "Sunita Devi" };

		const html = render("user");

		expect(html).toMatch(/data-avatar="user"[^>]*>[\s\S]*?RP/);
		const text = visibleText(html);
		expect(text).not.toContain("Ravi Pratap Singh Rajawat");
		expect(text).not.toContain("Sunita Devi");
	});

	it("falls back to the auth user name when no ?username= was given", () => {
		state.user = { id: "u1", email: "", name: "Sunita Devi", username: "Sunita Devi" };

		const html = render("user");

		expect(html).toMatch(/data-avatar="user"[^>]*>[\s\S]*?SD/);
		expect(visibleText(html)).not.toContain("Sunita Devi");
	});

	it("falls back to U when there is no name at all", () => {
		const html = render("user");

		expect(html).toMatch(/data-avatar="user"[^>]*>[\s\S]*?\bU\b/);
	});
});

describe("MessageChrome: assistant (P4.8.4)", () => {
	it("desktop: bot icon avatar and no 'Bharati' label", () => {
		const html = render("assistant");

		expect(html).toMatch(/data-avatar="bot"[^>]*>[\s\S]*?<svg/);
		expect(html).not.toContain("Bharati");
		expect(html).toContain("message body");
	});

	it("mobile: no avatar and no label", () => {
		state.mobile = true;

		const html = render("assistant");

		expect(html).not.toContain('data-avatar="bot"');
		expect(html).not.toContain("Bharati");
		expect(html).toContain("message body");
	});
});
