import { existsSync } from "node:fs";
import type { NextConfig } from "next";

// Local development: reuse the secrets in backend/.env so they live in one place.
// (In production the host provides these as environment variables.)
if (existsSync("../backend/.env")) process.loadEnvFile("../backend/.env");

const nextConfig: NextConfig = {
  // Only these two are safe to show in the browser. The anon key is public by design;
  // the database password and the service-role key stay on the server.
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  },
};

export default nextConfig;
