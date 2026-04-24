import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Per-user gold lives in Supabase and updates frequently — disable the
  // App Router Client Cache so back-navigation always re-renders against
  // a fresh server fetch instead of replaying a stale snapshot.
  experimental: {
    staleTimes: {
      dynamic: 0,
      static: 0,
    },
  },
};

export default nextConfig;
