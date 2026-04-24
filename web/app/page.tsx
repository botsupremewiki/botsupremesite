import Link from "next/link";
import { LandingContent } from "./landing-content";
import { UserMenu } from "@/components/user-menu";

export default function HomePage() {
  return (
    <main className="relative flex flex-1 flex-col overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-grid opacity-60" />
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,rgba(99,102,241,0.18),transparent_55%),radial-gradient(ellipse_at_bottom,rgba(236,72,153,0.12),transparent_55%)]" />

      <nav className="relative z-10 flex items-center justify-between px-6 py-5 sm:px-10">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded-md bg-gradient-to-br from-indigo-400 to-fuchsia-500" />
          <span className="font-semibold tracking-tight">Site Ultime</span>
        </div>
        <div className="flex items-center gap-3">
          <UserMenu />
          <Link
            href="/play"
            className="rounded-full border border-white/10 px-4 py-2 text-sm font-medium text-zinc-200 transition-colors hover:bg-white/5"
          >
            Entrer
          </Link>
        </div>
      </nav>

      <LandingContent />

      <footer className="relative z-10 border-t border-white/5 px-6 py-6 text-center text-xs text-zinc-500 sm:px-10">
        Site Ultime · projet indé · 2026
      </footer>
    </main>
  );
}
