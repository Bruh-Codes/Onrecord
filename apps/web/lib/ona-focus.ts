/**
 * What Ona should talk about when it isn't the signed-in owner's own business.
 *
 * The Approvals page sets this to the upload a reviewer has open, so the Ona
 * bubble asks about that upload's business and document. Pages that don't
 * set it leave Ona on the owner's business as before.
 */

import { useSyncExternalStore } from "react";

export type OnaFocus = {
	businessId: string;
	documentId: string;
	/** Shown under Ona's name, e.g. "Yaw's Tomatoes · statement.pdf". */
	label: string;
};

let current: OnaFocus | null = null;
const listeners = new Set<() => void>();

export function setOnaFocus(next: OnaFocus | null) {
	current = next;
	for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export function useOnaFocus(): OnaFocus | null {
	return useSyncExternalStore(subscribe, () => current, () => null);
}
