/** Test-only bootstrap using Better Auth's own migration engine. */
import { getMigrations } from "better-auth/db/migration";

const url = process.env.DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test")) {
	throw new Error("Use an isolated DATABASE_URL ending in _test.");
}
const { auth, pool } = await import("../lib/auth");
const migrations = await getMigrations(auth.options);
await migrations.runMigrations();
await pool.end();
console.log("Better Auth test schema ready.");
