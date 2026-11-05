import { redirect } from "next/navigation";

// The old "Almost lender-ready" checklist is folded into Readiness.
export default function NearlyReadyPage() {
	redirect("/readiness");
}
