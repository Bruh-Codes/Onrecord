import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* `pg` uses dynamic require() calls that Turbopack externalizes with a
   * hashed module id that doesn't exist at runtime, crashing every page
   * that imports better-auth ("Cannot find package 'pg-<hash>'"). Compiling
   * its source inline avoids the broken external resolution.
   * See https://github.com/ramonmalcolm10/next-bun-compile/issues/14. */
  transpilePackages: ["pg", "pg-pool", "pg-protocol", "pg-types", "pgpass"],
};

export default nextConfig;
