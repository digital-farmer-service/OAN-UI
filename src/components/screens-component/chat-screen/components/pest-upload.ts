type CameraToast = { message: string; type: "error" };

type CameraResultDeps = {
	setToast: (toast: CameraToast) => void;
	t: (key: string) => unknown;
};

/**
 * Result of the camera <input capture>. When no file comes back (user cancelled, camera
 * permission denied, or a WebView without a camera handler) the user gets an error toast
 * instead of silence; the Gallery button stays available as the fallback.
 */
export function handleCameraResult(
	files: FileList | File[] | null | undefined,
	{ setToast, t }: CameraResultDeps
): File | null {
	const file = files?.[0] ?? null;
	if (!file) {
		setToast({ message: t("imageUpload.cameraUnavailable") as string, type: "error" });
		return null;
	}
	return file;
}
