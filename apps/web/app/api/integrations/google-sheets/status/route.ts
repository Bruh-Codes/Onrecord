import { auth } from "@/lib/auth";

export async function GET(request: Request) {
  if (!(await auth.api.getSession({ headers: request.headers }))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const accounts = await auth.api.listUserAccounts({ headers: request.headers });
  return Response.json({ connected: accounts.some((account) => account.providerId === "google") });
}
