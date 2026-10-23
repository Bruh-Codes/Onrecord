import { redirect } from "next/navigation";

// Farm sales and costs are ordinary records now, tagged by crop and season on the Money page.
export default function FarmPage() {
	redirect("/money");
}
