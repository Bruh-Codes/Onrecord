"use server";

import { headers } from "next/headers";
import { auth, pool } from "./auth";

// Writes business_id/institution_id back onto the Better Auth user once a
// business/institution has been created in apps/api (ROADMAP.md Phase 1
// "known gap"). Both `additionalFields` are `input: false` in lib/auth.ts —
// deliberately not settable through Better Auth's own client-facing
// update-user API, so a client can't just PATCH its own business_id. This
// runs server-side, after the caller has already gotten a real id back from
// `POST /v1/businesses`, and writes it directly through the same pool
// Better Auth itself uses.
export async function linkBusiness(businessId: string): Promise<void> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error("Not signed in.");

  const result = await pool.query(`UPDATE auth_user SET "businessId" = $1, "updatedAt" = now()
    WHERE id = $2 AND EXISTS (
      SELECT 1 FROM business_access WHERE business_id = $1::uuid
        AND user_id = $2::uuid AND role::text = 'OWNER'
    )`, [
    businessId,
    session.user.id,
  ]);
  if (result.rowCount !== 1) throw new Error("You do not own this business.");
}
