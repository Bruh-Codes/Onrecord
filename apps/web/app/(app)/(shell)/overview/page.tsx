import { redirect } from "next/navigation";

// Business health was folded into Money; "What a lender works out" now sits on Readiness.
export default function OverviewPage() {
	redirect("/money");
}
