/** Helpers for recording voice notes in the browser. */

const PREFERRED_MIME_TYPES = [
	"audio/webm;codecs=opus",
	"audio/webm",
	"audio/mp4",
	"audio/ogg;codecs=opus",
	"audio/ogg",
];

/** First recording format this browser supports, or "" to let it choose. */
export function pickRecordingMimeType(): string {
	if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") {
		return "";
	}
	return PREFERRED_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

/** File name whose extension matches the audio format (the transcriber reads it). */
export function recordingFileName(mimeType: string): string {
	const type = mimeType.toLowerCase();
	if (type.includes("mp4") || type.includes("m4a") || type.includes("aac")) return "recording.m4a";
	if (type.includes("ogg")) return "recording.ogg";
	if (type.includes("wav")) return "recording.wav";
	if (type.includes("mpeg") || type.includes("mp3")) return "recording.mp3";
	return "recording.webm";
}

/** Why recording can't start here, or null when the browser can record. */
export function voiceUnsupportedReason(): string | null {
	if (typeof window === "undefined") return "Voice notes aren't available here.";
	if (!window.isSecureContext) {
		return "Voice notes need a secure (https) connection. Open OnRecord over https and try again.";
	}
	if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
		return "This browser can't record audio. Try the latest Chrome, Edge or Safari, or type your message.";
	}
	return null;
}

/** A plain explanation of a getUserMedia / MediaRecorder failure. */
export function microphoneErrorMessage(error: unknown): string {
	const name = error instanceof DOMException || error instanceof Error ? error.name : "";
	switch (name) {
		case "NotAllowedError":
		case "PermissionDeniedError":
			return "Microphone access is blocked. Allow the microphone for this site (the icon in the address bar), and check your system privacy settings, then try again.";
		case "NotFoundError":
		case "DevicesNotFoundError":
			return "No microphone was found. Connect one and try again.";
		case "NotReadableError":
		case "TrackStartError":
		case "AbortError":
			return "Your microphone couldn't be started. Another app may be using it, or it's turned off in your system settings.";
		case "OverconstrainedError":
			return "Your microphone doesn't support the settings needed to record.";
		case "SecurityError":
			return "Your browser blocked the microphone on this page.";
		case "NotSupportedError":
			return "This browser can't use the microphone here. Try the latest Chrome, Edge or Safari, or type your message.";
		default:
			return "We couldn't start the microphone. Please try again or type your message.";
	}
}
