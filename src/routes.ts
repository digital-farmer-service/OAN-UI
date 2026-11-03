import { index, layout, rootRoute, route } from "@tanstack/virtual-file-routes";

const middleware = (file: string, children: any[]) => layout(`middlewares/${file}`, children);

// The app exposes a single surface, /chat. `/` only redirects to it; the error routes stay.
export const routes = rootRoute("root.tsx", [
	// Landing/redirect logic
	index("index.tsx"),

	// Public chat surface with its own layout
	middleware("public-chat.tsx", [
		layout("chat-layout", "app/(_chat)/layout.tsx", [route("/chat", "app/(_chat)/chat-screen/routes.ts")])
	]),

	// Error surfaces
	route("/403", "error/403/routes.ts"),
	route("/404", "error/404/routes.ts"),
	route("/500", "error/500/routes.ts"),
	route("/error", "error/default-error/routes.ts")
]);
