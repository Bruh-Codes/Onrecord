import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AppStateProvider } from "@/lib/app-state";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    redirect("/signup");
  }

  // Owners need a business before any of these screens mean anything —
  // /setup creates one and writes business_id back (lib/link-business.ts).
  // Reviewers/admins carry institution_id instead, so they're exempt.
  const user = session.user as { role?: string; businessId?: string | null };
  if (user.role === "owner" && !user.businessId) {
    redirect("/setup");
  }

  return <AppStateProvider>{children}</AppStateProvider>;
}
