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
  // Hosts externes autorisés pour next/image. Permet l'optimisation
  // automatique (resize/format/lazy) des images de cartes Pokémon
  // (tcgdex.net) et des avatars Discord.
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "assets.tcgdex.net",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "cdn.discordapp.com",
        pathname: "/avatars/**",
      },
      {
        protocol: "https",
        hostname: "images.pokemontcg.io",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
