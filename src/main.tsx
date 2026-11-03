import { captureUrlIdentity } from "./lib/url-identity";
import "./config/csp";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

import { Loader } from "./components";
import "./styles/global.css";
import { queryClient } from "./hooks";
import PageNotFound from "./pages/error/404";
import DefaultError from "./pages/error/default-error";
import { createRouteProgress } from "./config/route-progress";

// Must run before anything reads or rewrites the URL (router, AuthContext).
captureUrlIdentity();

window.addEventListener("vite:preloadError", async (event) => {
	event.preventDefault();
	// Get current count from session storage or initialize to 0
	const reloadCount = parseInt(sessionStorage.getItem("vitePreloadErrorCount") || "0", 10);

	// Check if we've already tried 3 times
	if (reloadCount >= 2) {
		console.warn("Vite preload has failed multiple times. Stopping automatic reload.");
		// Optionally show a user-facing message here
		return;
	}

	try {
		if ("caches" in window) {
			const keys = await caches.keys();
			await Promise.all(keys.map((key) => caches.delete(key)));
		}
	} catch (cleanupError) {
		console.error(cleanupError);
	}
	//
	// Increment and save the counter
	sessionStorage.setItem("vitePreloadErrorCount", (reloadCount + 1).toString());

	console.log(`Reloading page (attempt ${reloadCount + 1} of 2)...`);
	window.location.reload(); // for example, refresh the page
});

const routeProgress = createRouteProgress();
const router = createRouter({
	routeTree,
	context: { queryClient },
	defaultPendingComponent: () => (
		<div className="bg-background flex h-screen w-screen items-center justify-center">
			<Loader />
		</div>
	),
	defaultNotFoundComponent: PageNotFound,
	defaultErrorComponent: DefaultError
});

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}

router.subscribe("onBeforeLoad", ({ pathChanged }) => {
	if (pathChanged) {
		routeProgress.start();
	}
});

router.subscribe("onResolved", () => {
	routeProgress.done();
});
import { LanguageProvider } from "./components/LanguageProvider";
import { AuthProvider } from "./contexts/AuthContext";
import { ConfigProvider } from "./hooks/ConfigProvider";

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<AuthProvider>
			<ConfigProvider>
				<LanguageProvider>
					<RouterProvider router={router} />
				</LanguageProvider>
			</ConfigProvider>
		</AuthProvider>
	</StrictMode>
);
