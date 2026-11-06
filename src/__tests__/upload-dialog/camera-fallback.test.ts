import { beforeEach, describe, expect, it, vi } from "vitest";

import chatInputSource from "../../components/screens-component/chat-screen/components/chat-input.tsx?raw";
import { translationValue } from "../ui-parity/test-i18n";

// Spec (camera fallback): when the camera <input capture="environment"> fires `change` with no file
// (user cancelled, camera permission denied, or a WebView without a camera handler), the user gets a
// toast instead of silence, and the Gallery button stays available.
//
// Seam: pure helper `handleCameraResult(files, { setToast, t })` exported from
// src/components/screens-component/chat-screen/components/pest-upload.ts. It returns the picked
// File, or null when there is none; on null it calls
// setToast({ message: t("imageUpload.cameraUnavailable"), type: "error" }). ChatInput uses it for
// the camera input. Gallery availability is covered in upload-dialog.test.tsx (always rendered).
//
// Harness: node env. The module is imported through a variable path so tsc passes before the file
// exists (same pattern as ui-parity/footer.test.tsx).

type ToastArg = { message: string; type: string } | null;

interface PestUploadModule {
	handleCameraResult: (
		files: FileList | File[] | null | undefined,
		deps: { setToast: (toast: ToastArg) => void; t: (key: string) => unknown }
	) => File | null;
}

const PEST_UPLOAD_MODULE = "../../components/screens-component/chat-screen/components/pest-upload";

async function load(): Promise<PestUploadModule> {
	return (await import(/* @vite-ignore */ PEST_UPLOAD_MODULE)) as PestUploadModule;
}

const setToast = vi.fn((_toast: ToastArg) => undefined);
const t = vi.fn((key: string) => key);

beforeEach(() => {
	vi.clearAllMocks();
});

describe("handleCameraResult: no file from the camera -> error toast, null", () => {
	it.each([
		["null (no FileList)", null],
		["undefined", undefined],
		["an empty list (user cancelled / denied)", [] as File[]]
	])("%s", async (_label, files) => {
		const { handleCameraResult } = await load();

		const result = handleCameraResult(files, { setToast, t });

		expect(result).toBeNull();
		expect(t).toHaveBeenCalledWith("imageUpload.cameraUnavailable");
		expect(setToast).toHaveBeenCalledTimes(1);
		expect(setToast).toHaveBeenCalledWith({ message: "imageUpload.cameraUnavailable", type: "error" });
	});
});

describe("handleCameraResult: a photo was taken", () => {
	it("returns the first file and shows no toast", async () => {
		const { handleCameraResult } = await load();
		const photo = new File([new Uint8Array([1, 2, 3])], "leaf.jpg", { type: "image/jpeg" });

		const result = handleCameraResult([photo], { setToast, t });

		expect(result).toBe(photo);
		expect(setToast).not.toHaveBeenCalled();
	});
});

describe("cameraUnavailable message", () => {
	it.each(["en", "hi"] as const)("translations/%s.json has a non-empty imageUpload.cameraUnavailable", (lang) => {
		const value = translationValue(lang, "imageUpload.cameraUnavailable");

		expect(typeof value).toBe("string");
		expect((value as string).trim()).not.toBe("");
	});
});

describe("ChatInput wires the camera input through handleCameraResult", () => {
	it("chat-input.tsx imports handleCameraResult from ./pest-upload", () => {
		expect(chatInputSource).toMatch(
			/import\s*\{[^}]*\bhandleCameraResult\b[^}]*\}\s*from\s*["']\.\/pest-upload["']/
		);
	});
});
