import { redirect } from "next/navigation";

// The old "Almost lender-ready" checklist is folded into Loan readiness.
export default function NearlyReadyPage() {
	redirect("/readiness");
}
