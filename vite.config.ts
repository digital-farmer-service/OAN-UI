import { defineConfig, loadEnv, PluginOption } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import tsconfigPaths from "vite-tsconfig-paths";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
const virtualRouteFileChangeReloadPlugin: PluginOption = {
	name: "watch-config-restart",
	configureServer(server) {
		server.watcher.add("./src/routes.ts");
		server.watcher.on("change", (path) => {
			if (path.endsWith("src/routes.ts")) {
				console.log("Virtual route changed");
				server.restart();
			}
		});
	}
};
// Opt-in dev proxy: set VITE_DEV_PROXY_TARGET (e.g. in .env.local) to forward /api and /observability-service, so
// `window.__ENV__.VITE_API_URL: ""` (same origin) works locally without CORS. Off when unset.
const devProxyTarget = loadEnv(process.env.NODE_ENV ?? "development", process.cwd(), "VITE_")
	.VITE_DEV_PROXY_TARGET;
// https://vite.dev/config/
export default defineConfig({
	base: "/bihar-krishi/",
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "src"),
			"~": path.resolve(__dirname),
			"lottie-web": path.resolve(
				__dirname,
				"node_modules/lottie-web/build/player/lottie_light.js"
			)
		}
	},
	plugins: [
		tsconfigPaths(),
		nodePolyfills({ globals: { Buffer: true } }),
		tanstackRouter({
			target: "react",
			autoCodeSplitting: true,
			routesDirectory: path.resolve(__dirname, "src/pages"),
			virtualRouteConfig: "./src/routes.ts",
			generatedRouteTree: "./src/routeTree.gen.ts"
		}),
		react(),
		virtualRouteFileChangeReloadPlugin
	],
	server: {
		port: 3000,
		...(devProxyTarget
			? {
					proxy: Object.fromEntries(
						["/api", "/observability-service"].map((p) => [
							p,
							{ target: devProxyTarget, changeOrigin: true, secure: true }
						])
					)
				}
			: {})
	}
});
