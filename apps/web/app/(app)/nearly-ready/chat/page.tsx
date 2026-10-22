import { redirect } from "next/navigation";

// Ona lives in the dock on every page; "Ask Ona" buttons open it directly.
export default function AssistantChatPage() {
	redirect("/readiness");
}
