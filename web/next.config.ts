import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Per-user gold lives in Supabase and updates frequently — disable the
  // App Router Client Cache so back-navigation always re-renders against
  // a fresh server fetch instead of replaying a stale snapshot.
  experimental: {
    staleTimes: {
      // Min imposé par Next 16 = 30s. En dessous → warning au build et
      // erreur sur Vercel (config invalide). 30s est court et acceptable.
      dynamic: 30,
      static: 30,
    },
  },
};

export default nextConfig;
