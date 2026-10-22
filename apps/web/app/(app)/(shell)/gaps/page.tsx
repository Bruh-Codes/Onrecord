import { redirect } from "next/navigation";

// Gaps now live on the Loan readiness page as one "Do these next" list.
export default function GapsPage() {
	redirect("/readiness");
}
