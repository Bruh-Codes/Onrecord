import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, pool } from "@/lib/auth";
import { AppStateProvider } from "@/lib/app-state";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    redirect("/signup");
  }

  // Owners need a business before any of these screens mean anything —
  // /setup creates one and writes business_id back (lib/link-business.ts).
  // Reviewers/admins carry institution_id instead, so they're exempt.
  const user = session.user as { role?: string; id: string; businessId?: string | null };
  if (user.role === "owner") {
    // Resolve from the auth_user row, not the JWT claim — the claim is a
    // cache signed at session start and lags behind linkBusiness's write-back
    // (lib/link-business.ts writes the field directly for this reason).
    const result = await pool.query<{ businessId: string | null }>(
      'SELECT "businessId" FROM auth_user WHERE id = $1',
      [user.id]
    );
    if (!result.rows[0]?.businessId) {
      redirect("/setup");
    }
  }

  return <AppStateProvider>{children}</AppStateProvider>;
}