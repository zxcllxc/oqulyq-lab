import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite ships its own WASM; keep it out of the bundle and ship the schema file with the API functions
  serverExternalPackages: ["@electric-sql/pglite"],
  outputFileTracingIncludes: { "/api/**/*": ["./db/schema.sql"] },
};

export default nextConfig;
