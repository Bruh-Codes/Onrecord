/**
 * Lets any page hand Ona a question. AgentDockHost listens for this event,
 * opens the dock and sends the message as if the owner had typed it.
 */

export const ASK_ONA_EVENT = "ona:ask";

export function askOna(message: string) {
	window.dispatchEvent(new CustomEvent<string>(ASK_ONA_EVENT, { detail: message }));
}
