import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// Owner dev review §1: there is no login route any more, so the auth-error surface must not
// offer a way to one (no link, no href, no button, no programmatic navigation to /login).

const navigate = vi.fn();

vi.mock("@tanstack/react-router", async (importOriginal) => {
	const actual = await importOriginal<Record<string, unknown>>();
	return {
		...actual,
		useNavigate: () => navigate,
		useRouter: () => ({ navigate, history: { back: () => {} } }),
		Link: ({ to, children }: { to?: string; children?: unknown }) => (
			<a href={String(to ?? "")}>{children as never}</a>
		)
	};
});

import AuthError from "@/pages/error/default-error/auth-error";

function render(): string {
	return renderToStaticMarkup(<AuthError />);
}

describe("auth-error page (dev review §1)", () => {
	it("renders no href pointing at a login route", () => {
		const html = render();

		expect(html).not.toMatch(/href="[^"]*login[^"]*"/i);
	});

	it("renders no login button or link", () => {
		const html = render();
		const controls = [...html.matchAll(/<(a|button)\b[^>]*>([\s\S]*?)<\/\1>/gi)].map((m) => m[0]);

		for (const control of controls) {
			expect(control).not.toMatch(/log\s*-?in/i);
		}
	});

	it("does not navigate to /login while rendering", () => {
		navigate.mockClear();
		render();

		expect(navigate).not.toHaveBeenCalledWith(
			expect.objectContaining({ to: expect.stringMatching(/login/i) })
		);
		expect(navigate).not.toHaveBeenCalledWith(expect.stringMatching(/login/i));
	});
});
