import { auth } from "@/lib/auth";

async function backendToken(request: Request) {
	const response = await fetch(new URL("/api/auth/token", request.url), {
		headers: { cookie: request.headers.get("cookie") ?? "" },
	});
	if (!response.ok) throw new Error("Your OnRecord session has expired.");
	return ((await response.json()) as { token?: string }).token ?? "";
}

export async function POST(request: Request) {
	if (!(await auth.api.getSession({ headers: request.headers }))) {
		return Response.json({ error: { message: "Unauthorized" } }, { status: 401 });
	}

	try {
		const form = await request.formData();
		const audio = form.get("audio");
		if (!(audio instanceof File)) {
			return Response.json({ error: { message: "No audio was recorded." } }, { status: 400 });
		}

		const backendOrigin = (
			process.env.API_BACKEND_ORIGIN ??
			process.env.NEXT_PUBLIC_BACKEND_URL ??
			process.env.NEXT_PUBLIC_API_URL ??
			process.env.NEXT_PUBLIC_API_BASE_URL ??
			"http://localhost:8000"
		).replace(/\/$/, "");
		const token = await backendToken(request);
		const forward = new FormData();
		forward.append("audio", audio, audio.name || "recording.webm");
		const response = await fetch(`${backendOrigin}/v1/voice/transcribe`, {
			method: "POST",
			headers: { Authorization: `Bearer ${token}` },
			body: forward,
		});
		const body = await response.json().catch(() => ({ error: { message: response.statusText } }));
		return Response.json(body, { status: response.status });
	} catch (error) {
		console.error("Voice transcription proxy failed", error);
		return Response.json(
			{ error: { message: error instanceof Error ? error.message : "Voice transcription failed." } },
			{ status: 502 },
		);
	}
}
